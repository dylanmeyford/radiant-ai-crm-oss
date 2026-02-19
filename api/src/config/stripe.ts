import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set in environment variables');
}

const parseLegacyBasePriceIds = (): string[] => {
  const raw = process.env.STRIPE_PRICE_ID_BASE_LEGACY;
  if (!raw) return [];

  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
};

const legacyBasePriceIds = parseLegacyBasePriceIds();

// Initialize Stripe with the secret key
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  typescript: true,
});

// Stripe configuration
export const stripeConfig = {
  secretKey: process.env.STRIPE_SECRET_KEY,
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  priceIdBase: process.env.STRIPE_PRICE_ID_BASE || '',
  legacyBasePriceIds,
  priceIdAdditionalAccount: process.env.STRIPE_PRICE_ID_ADDITIONAL_ACCOUNT || '',
};

export const getBasePlanPriceIds = (): string[] => {
  const ids = [stripeConfig.priceIdBase, ...stripeConfig.legacyBasePriceIds];
  return Array.from(new Set(ids.filter((value) => value.length > 0)));
};

// Validation function to ensure all required config is present
export const validateStripeConfig = (): void => {
  const requiredVars = [
    'STRIPE_SECRET_KEY',
    'STRIPE_PUBLISHABLE_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_PRICE_ID_BASE',
    'STRIPE_PRICE_ID_ADDITIONAL_ACCOUNT',
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    console.warn(
      `⚠️  Warning: Missing Stripe environment variables: ${missingVars.join(', ')}`
    );
  }

  if (!process.env.STRIPE_PRICE_ID_BASE_LEGACY) {
    console.info(
      '[Stripe Config] STRIPE_PRICE_ID_BASE_LEGACY not set. Legacy subscriptions will be treated using the current base price only.'
    );
  }
};

