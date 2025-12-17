import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { stripe, STRIPE_CONFIG } from '../config/stripe.js';
import Stripe from 'stripe';

const prisma = new PrismaClient();

export const handleStripeWebhook = async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers['stripe-signature'] as string;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      STRIPE_CONFIG.webhookSecret
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    res.status(400).send(`Webhook Error: ${err}`);
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

type SubscriptionStatusType = 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'TRIALING' | 'EXPIRED';
const statusMap: Record<string, SubscriptionStatusType> = {
  active: 'ACTIVE',
  past_due: 'PAST_DUE',
  canceled: 'CANCELED',
  trialing: 'TRIALING',
};

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  const organizationId = session.metadata?.organizationId;

  const subscriptionId = session.subscription as string;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  if (organizationId) {
    // Organization subscription
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        subscriptionId: subscription.id,
        subscriptionStatus: 'ACTIVE',
        currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
      },
    });
    console.log(`Subscription activated for organization ${organizationId}`);
  } else if (userId) {
    // Individual subscription
    await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionId: subscription.id,
        subscriptionStatus: 'ACTIVE',
        currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
      },
    });
    console.log(`Subscription activated for user ${userId}`);
  } else {
    console.error('No userId or organizationId in checkout session metadata');
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  // Try to find organization first
  const organization = await prisma.organization.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (organization) {
    await prisma.organization.update({
      where: { id: organization.id },
      data: {
        subscriptionStatus: statusMap[subscription.status] || 'EXPIRED',
        currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
      },
    });
    console.log(`Subscription updated for organization ${organization.id}: ${subscription.status}`);
    return;
  }

  // Try to find user
  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: statusMap[subscription.status] || 'EXPIRED',
        currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
      },
    });
    console.log(`Subscription updated for user ${user.id}: ${subscription.status}`);
    return;
  }

  console.error(`No user or organization found for customer ${customerId}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  // Try organization first
  const orgUpdateResult = await prisma.organization.updateMany({
    where: { stripeCustomerId: customerId },
    data: {
      subscriptionStatus: 'CANCELED',
      subscriptionId: null,
    },
  });

  if (orgUpdateResult.count > 0) {
    console.log(`Subscription deleted for organization with customer ${customerId}`);
    return;
  }

  // Try user
  await prisma.user.updateMany({
    where: { stripeCustomerId: customerId },
    data: {
      subscriptionStatus: 'CANCELED',
      subscriptionId: null,
    },
  });

  console.log(`Subscription deleted for customer ${customerId}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  // Try organization first
  const orgUpdateResult = await prisma.organization.updateMany({
    where: { stripeCustomerId: customerId },
    data: { subscriptionStatus: 'PAST_DUE' },
  });

  if (orgUpdateResult.count > 0) {
    console.log(`Payment failed for organization with customer ${customerId}`);
    return;
  }

  // Try user
  await prisma.user.updateMany({
    where: { stripeCustomerId: customerId },
    data: { subscriptionStatus: 'PAST_DUE' },
  });

  console.log(`Payment failed for customer ${customerId}`);
}
