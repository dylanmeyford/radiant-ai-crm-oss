/**
 * Billing Types
 * TypeScript interfaces for billing and Stripe integration
 */

export interface BillingStatus {
  hasStripeCustomer: boolean;
  paymentMethodAdded: boolean;
  subscriptionStatus: 'active' | 'past_due' | 'canceled' | 'incomplete' | 'trialing' | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  billingEmail: string | null;
  connectedAccounts: number;
  subscription: SubscriptionDetails | null;
}

export interface SubscriptionDetails {
  id: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  items: SubscriptionItem[];
}

export interface SubscriptionItem {
  id: string;
  priceId: string;
  quantity: number;
  unitAmount: number | null;
  currency: string | null;
  type: 'base' | 'additional' | 'other';
}

export interface SetupIntentResponse {
  clientSecret: string;
  customerId: string;
}

export interface CreateSubscriptionResponse {
  subscriptionId: string;
  status: string;
  clientSecret?: string;
  requiresAction?: boolean;
}

export interface BillingPortalResponse {
  url: string;
}

