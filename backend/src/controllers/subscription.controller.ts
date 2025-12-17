import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { stripe, STRIPE_CONFIG } from '../config/stripe.js';
import { AuthRequest } from '../types/index.js';

const prisma = new PrismaClient();

// Get subscription status
export const getSubscriptionStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: {
        organization: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const now = new Date();
    let subscriptionStatus: string;
    let trialEndsAt: Date | null;
    let currentPeriodEnd: Date | null;
    let isActive: boolean;

    if (user.planType === 'ORGANIZATION' && user.organization) {
      // Organization subscription
      subscriptionStatus = user.organization.subscriptionStatus;
      trialEndsAt = user.organization.trialEndsAt;
      currentPeriodEnd = user.organization.currentPeriodEnd;

      const orgTrialEndsAt = trialEndsAt || now;
      isActive =
        (subscriptionStatus === 'TRIALING' && orgTrialEndsAt > now) ||
        subscriptionStatus === 'ACTIVE';
    } else {
      // Individual subscription
      subscriptionStatus = user.subscriptionStatus;
      trialEndsAt = user.trialEndsAt;
      currentPeriodEnd = user.currentPeriodEnd;

      const userTrialEndsAt = trialEndsAt || now;
      isActive =
        (subscriptionStatus === 'TRIALING' && userTrialEndsAt > now) ||
        subscriptionStatus === 'ACTIVE';
    }

    const trialDaysRemaining = trialEndsAt
      ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

    res.json({
      status: subscriptionStatus,
      planType: user.planType,
      trialEndsAt,
      trialDaysRemaining,
      currentPeriodEnd,
      isActive,
      organizationName: user.organization?.name || null,
      userRole: user.role,
    });
  } catch (error) {
    console.error('Error getting subscription status:', error);
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
};

// Create Stripe Checkout session
export const createCheckoutSession = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { planType } = req.body; // 'individual' or 'organization'

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { organization: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    let customerId: string | null = null;
    let priceId: string;
    let metadata: Record<string, string>;

    if (planType === 'organization' || (user.planType === 'ORGANIZATION' && user.organization)) {
      // Organization checkout
      if (!user.organization) {
        res.status(400).json({ error: 'User is not part of an organization' });
        return;
      }

      if (user.role !== 'ADMIN') {
        res.status(403).json({ error: 'Only organization admins can manage subscriptions' });
        return;
      }

      customerId = user.organization.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { organizationId: user.organization.id },
        });
        customerId = customer.id;
        await prisma.organization.update({
          where: { id: user.organization.id },
          data: { stripeCustomerId: customerId },
        });
      }

      priceId = STRIPE_CONFIG.organizationPriceId;
      metadata = { organizationId: user.organization.id };
    } else {
      // Individual checkout
      customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        await prisma.user.update({
          where: { id: user.id },
          data: { stripeCustomerId: customerId },
        });
      }

      priceId = STRIPE_CONFIG.individualPriceId;
      metadata = { userId: user.id };
    }

    // Create Checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.FRONTEND_URL}?subscription=success`,
      cancel_url: `${process.env.FRONTEND_URL}?subscription=cancelled`,
      metadata,
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
};

// Create Customer Portal session
export const createPortalSession = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { organization: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    let customerId: string | null = null;

    if (user.planType === 'ORGANIZATION' && user.organization) {
      if (user.role !== 'ADMIN') {
        res.status(403).json({ error: 'Only organization admins can manage subscriptions' });
        return;
      }
      customerId = user.organization.stripeCustomerId;
    } else {
      customerId = user.stripeCustomerId;
    }

    if (!customerId) {
      res.status(400).json({ error: 'No subscription found' });
      return;
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: process.env.FRONTEND_URL,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating portal session:', error);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
};
