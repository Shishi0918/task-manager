import { Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../types/index.js';

const prisma = new PrismaClient();

export const requireActiveSubscription = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: {
        organization: true,
      },
    });

    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const now = new Date();
    let isActive = false;
    let subscriptionStatus: string;

    if (user.planType === 'ORGANIZATION' && user.organization) {
      // Check organization subscription
      subscriptionStatus = user.organization.subscriptionStatus;
      const trialEndsAt = user.organization.trialEndsAt || now;
      const isTrialActive = subscriptionStatus === 'TRIALING' && trialEndsAt > now;
      const isSubscriptionActive = subscriptionStatus === 'ACTIVE';
      isActive = isTrialActive || isSubscriptionActive;
    } else {
      // Check individual subscription
      subscriptionStatus = user.subscriptionStatus;
      const trialEndsAt = user.trialEndsAt || now;
      const isTrialActive = subscriptionStatus === 'TRIALING' && trialEndsAt > now;
      const isSubscriptionActive = subscriptionStatus === 'ACTIVE';
      isActive = isTrialActive || isSubscriptionActive;
    }

    if (!isActive) {
      res.status(403).json({
        error: 'Subscription required',
        code: 'SUBSCRIPTION_REQUIRED',
        subscriptionStatus,
        planType: user.planType,
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Error checking subscription:', error);
    res.status(500).json({ error: 'Failed to check subscription status' });
  }
};
