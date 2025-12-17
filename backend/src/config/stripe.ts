import Stripe from 'stripe';

// Lazy initialization to allow environment variables to be loaded first
let stripeInstance: Stripe | null = null;

export const getStripe = (): Stripe => {
  if (!stripeInstance) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY environment variable is not set');
    }
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeInstance;
};

// For backward compatibility - lazy getter
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const STRIPE_CONFIG = {
  // Individual plan: 300 yen/month
  individualPriceId: process.env.STRIPE_INDIVIDUAL_PRICE_ID || '',
  // Organization plan: 5,000 yen/month (10 users)
  organizationPriceId: process.env.STRIPE_ORGANIZATION_PRICE_ID || '',
  currency: 'jpy',
  trialDays: 7,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
};
