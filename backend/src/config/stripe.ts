import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('Warning: STRIPE_SECRET_KEY environment variable is not set');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

export const STRIPE_CONFIG = {
  // Individual plan: 300 yen/month
  individualPriceId: process.env.STRIPE_INDIVIDUAL_PRICE_ID || '',
  // Organization plan: 5,000 yen/month (10 users)
  organizationPriceId: process.env.STRIPE_ORGANIZATION_PRICE_ID || '',
  currency: 'jpy',
  trialDays: 7,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
};
