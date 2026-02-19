import type Stripe from 'stripe';
import { stripe, stripeConfig, getBasePlanPriceIds } from '../config/stripe';
import Organization from '../models/Organization';
import { AIUsageTrackingService } from './aiUsageTrackingService';

/**
 * StripeService - Handles all Stripe billing operations
 * 
 * This service manages:
 * - Customer creation and management
 * - Setup intents for payment method collection
 * - Subscription creation and updates with multiple line items
 * - Billing portal sessions
 * - Invoice creation for AI usage
 */

const getBasePlanPriceIdSet = (): Set<string> => {
  return new Set(getBasePlanPriceIds());
};

const getPriceType = (priceId: string | null | undefined): 'base' | 'additional' | 'other' => {
  if (!priceId) return 'other';

  const basePriceIds = getBasePlanPriceIdSet();
  if (basePriceIds.has(priceId)) {
    return 'base';
  }

  if (priceId === stripeConfig.priceIdAdditionalAccount) {
    return 'additional';
  }

  return 'other';
};

/**
 * Create a Stripe customer for an organization
 */
export const createCustomer = async (
  organizationId: string,
  email: string,
  organizationName: string
): Promise<string> => {
  try {
    const customer = await stripe.customers.create({
      email,
      name: organizationName,
      metadata: {
        organizationId,
      },
    });

    console.log(`[STRIPE-SERVICE] Created customer ${customer.id} for org ${organizationId}`);
    return customer.id;
  } catch (error: any) {
    console.error('[STRIPE-SERVICE] Error creating customer:', error);
    throw new Error(`Failed to create Stripe customer: ${error.message}`);
  }
};

/**
 * Create a setup intent to collect payment method
 */
export const createSetupIntent = async (customerId: string): Promise<string> => {
  try {
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session', // For charging when customer is not actively using the site
    });

    console.log(`[STRIPE-SERVICE] Created setup intent ${setupIntent.id} for customer ${customerId}`);
    return setupIntent.client_secret!;
  } catch (error: any) {
    console.error('[STRIPE-SERVICE] Error creating setup intent:', error);
    throw new Error(`Failed to create setup intent: ${error.message}`);
  }
};

/**
 * Ensure customer has a default payment method set
 * Retrieves the most recent successful SetupIntent and sets its payment method as default
 */
export const ensureDefaultPaymentMethod = async (customerId: string): Promise<void> => {
  try {
    // Get customer to check if they already have a default payment method
    const customer = await stripe.customers.retrieve(customerId);
    
    if ('deleted' in customer && customer.deleted) {
      throw new Error('Customer has been deleted');
    }

    // Check if default payment method is already set
    if (customer.invoice_settings?.default_payment_method) {
      console.log(
        `[STRIPE-SERVICE] Customer ${customerId} already has default payment method`
      );
      return;
    }

    // Find the most recent successful SetupIntent for this customer
    const setupIntents = await stripe.setupIntents.list({
      customer: customerId,
      limit: 10,
    });

    const successfulSetupIntent = setupIntents.data.find(
      (si) => si.status === 'succeeded' && si.payment_method
    );

    if (!successfulSetupIntent || !successfulSetupIntent.payment_method) {
      throw new Error(
        'No successful SetupIntent with payment method found. Please add a payment method first.'
      );
    }

    // Set the payment method as default
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: successfulSetupIntent.payment_method as string,
      },
    });

    console.log(
      `[STRIPE-SERVICE] Set default payment method ${successfulSetupIntent.payment_method} for customer ${customerId}`
    );
  } catch (error: any) {
    console.error('[STRIPE-SERVICE] Error ensuring default payment method:', error);
    throw new Error(`Failed to set default payment method: ${error.message}`);
  }
};

/**
 * Create a subscription with base plan + additional accounts
 * 
 * @param customerId - Stripe customer ID
 * @param accountCount - Total number of connected accounts
 * @returns Subscription object
 */
export const createSubscription = async (
  customerId: string,
  accountCount: number
): Promise<any> => {
  try {
    const additionalAccounts = Math.max(0, accountCount - 5);

    // Build subscription items array
    const items: any[] = [
      {
        price: stripeConfig.priceIdBase,
        quantity: 1, // Base plan is always quantity 1
      },
    ];

    // Add additional accounts line item if needed
    if (additionalAccounts > 0) {
      items.push({
        price: stripeConfig.priceIdAdditionalAccount,
        quantity: additionalAccounts,
      });
    }

    // Get the most recent successful payment method from SetupIntent
    const setupIntents = await stripe.setupIntents.list({
      customer: customerId,
      limit: 1,
    });

    const successfulSetupIntent = setupIntents.data.find(
      (si) => si.status === 'succeeded' && si.payment_method
    );

    if (!successfulSetupIntent || !successfulSetupIntent.payment_method) {
      throw new Error('No payment method found. Please add a payment method first.');
    }

    const paymentMethodId = successfulSetupIntent.payment_method as string;

    console.log(`[STRIPE-SERVICE] Creating subscription with payment method: ${paymentMethodId}`);

    const response = await stripe.subscriptions.create({
      customer: customerId,
      items,
      default_payment_method: paymentMethodId, // Explicitly set the payment method
      payment_behavior: 'allow_incomplete', // Changed from 'default_incomplete' to allow immediate payment attempt
      payment_settings: {
        payment_method_types: ['card'],
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
    });

    let subscription = response as any;
    
    // Stripe SDK v19+ only includes current_period_start/end on SubscriptionItem, not Subscription
    // Copy them to subscription level for backwards compatibility
    const firstItem = subscription.items?.data?.[0];
    if (firstItem && !subscription.current_period_start) {
      subscription.current_period_start = firstItem.current_period_start;
      subscription.current_period_end = firstItem.current_period_end;
    }

    console.log(
      `[STRIPE-SERVICE] Created subscription ${subscription.id} for customer ${customerId} with ${accountCount} accounts ` +
      `(period: ${new Date(subscription.current_period_start * 1000).toISOString()} - ` +
      `${new Date(subscription.current_period_end * 1000).toISOString()})`
    );
    
    // For incomplete subscriptions, fetch the invoice separately to get payment intent
    // Use retry logic because invoice/payment_intent are created asynchronously
    if (subscription.status === 'incomplete' && subscription.latest_invoice) {
      console.log('[STRIPE-SERVICE] Subscription incomplete, fetching invoice with payment intent...');
      
      const invoiceId = typeof subscription.latest_invoice === 'string' 
        ? subscription.latest_invoice 
        : subscription.latest_invoice.id;
      
      // First, try to retrieve the invoice immediately
      let invoice = await stripe.invoices.retrieve(invoiceId, {
        expand: ['payment_intent'],
      }) as any;
      
      console.log('[STRIPE-SERVICE] Initial invoice fetch:', {
        invoiceId: invoice.id,
        status: invoice.status,
        hasPaymentIntent: !!invoice.payment_intent,
      });
      
      // If no payment intent and invoice is open, attempt to pay it to trigger payment intent creation
      if (!invoice.payment_intent && invoice.status === 'open') {
        console.log('[STRIPE-SERVICE] No payment intent found, attempting to pay invoice...');
        try {
          // This will trigger payment intent creation
          const payResult = await stripe.invoices.pay(invoiceId, {
            expand: ['payment_intent'],
          }) as any;
          console.log('[STRIPE-SERVICE] Invoice pay triggered, payment intent created');
          invoice = payResult;
        } catch (payError: any) {
          console.log('[STRIPE-SERVICE] Invoice pay attempt error:', payError.message);
          // If it fails, re-fetch the invoice as it may have been updated
          invoice = await stripe.invoices.retrieve(invoiceId, {
            expand: ['payment_intent', 'charge'],
          }) as any;
        }
      }
      
      // Now retry fetching the invoice with payment intent if we still don't have it
      if (!invoice.payment_intent) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay between attempts
          
          invoice = await stripe.invoices.retrieve(invoiceId, {
            expand: ['payment_intent', 'charge', 'lines.data.price'],
          }) as any;
          
          console.log(`[STRIPE-SERVICE] Invoice fetch attempt ${attempt + 1}:`, {
            invoiceId: invoice.id,
            status: invoice.status,
            hasPaymentIntent: !!invoice.payment_intent,
            hasCharge: !!invoice.charge,
          });
          
          // If invoice is paid but no payment_intent, try to get it from the charge
          if (!invoice.payment_intent && invoice.status === 'paid') {
            console.log('[STRIPE-SERVICE] Invoice paid but no payment_intent, checking for charge...');
            
            // For subscription invoices, the charge might be in different places
            const chargeId = invoice.charge || 
                           (invoice.payment_intent && typeof invoice.payment_intent === 'string' ? null : invoice.payment_intent?.latest_charge);
            
            if (chargeId && typeof chargeId === 'string') {
              console.log(`[STRIPE-SERVICE] Found charge ID: ${chargeId}, retrieving...`);
              try {
                const charge = await stripe.charges.retrieve(chargeId, {
                  expand: ['payment_intent'],
                }) as any;
                if (charge.payment_intent) {
                  console.log('[STRIPE-SERVICE] Found payment intent on charge');
                  invoice.payment_intent = charge.payment_intent;
                }
              } catch (chargeError: any) {
                console.log('[STRIPE-SERVICE] Could not retrieve charge:', chargeError.message);
              }
            } else {
              console.log('[STRIPE-SERVICE] No charge ID found on paid invoice');
            }
          }
          
          // If we found the payment intent, stop retrying
          if (invoice.payment_intent) {
            break;
          }
        }
        
        if (!invoice.payment_intent) {
          console.warn('[STRIPE-SERVICE] Payment intent not found after all attempts');
        }
      }
      
      // Attach the invoice with payment intent to the subscription
      subscription.latest_invoice = invoice;
      
      console.log('[STRIPE-SERVICE] Final invoice state:', {
        invoiceId: invoice.id,
        status: invoice.status,
        hasPaymentIntent: !!invoice.payment_intent,
        paymentIntentId: typeof invoice.payment_intent === 'string'
          ? invoice.payment_intent
          : invoice.payment_intent?.id,
        paymentIntentStatus: typeof invoice.payment_intent === 'object' 
          ? invoice.payment_intent?.status 
          : 'string',
        hasClientSecret: typeof invoice.payment_intent === 'object' 
          ? !!invoice.payment_intent?.client_secret 
          : false,
      });
    }
    
    // Debug: Log the final subscription details
    console.log('[STRIPE-SERVICE] Final subscription details:', {
      status: subscription.status,
      hasLatestInvoice: !!subscription.latest_invoice,
      latestInvoiceId: subscription.latest_invoice?.id,
      hasPaymentIntent: !!subscription.latest_invoice?.payment_intent,
      paymentIntentId: typeof subscription.latest_invoice?.payment_intent === 'string' 
        ? subscription.latest_invoice?.payment_intent 
        : subscription.latest_invoice?.payment_intent?.id,
      paymentIntentStatus: subscription.latest_invoice?.payment_intent?.status,
      hasClientSecret: !!subscription.latest_invoice?.payment_intent?.client_secret,
      clientSecretPreview: subscription.latest_invoice?.payment_intent?.client_secret?.substring(0, 20),
    });
    
    // Final check: If subscription appears incomplete but invoice is paid, re-fetch subscription status
    if (subscription.status === 'incomplete' && 
        subscription.latest_invoice?.status === 'paid') {
      console.log('[STRIPE-SERVICE] Invoice is paid but subscription shows incomplete, re-fetching subscription...');
      
      // Give webhooks a moment to process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Fetch the latest subscription status
      const updatedSubscription = await stripe.subscriptions.retrieve(subscription.id, {
        expand: ['latest_invoice.payment_intent'],
      }) as any;
      
      console.log('[STRIPE-SERVICE] Updated subscription status:', updatedSubscription.status);
      
      // Use the updated subscription if it's now active
      if (updatedSubscription.status === 'active' || updatedSubscription.status === 'trialing') {
        subscription = updatedSubscription;
        
        // Copy period dates for compatibility
        subscription.current_period_start = subscription.current_period_start || 
          subscription.items?.data?.[0]?.current_period_start;
        subscription.current_period_end = subscription.current_period_end || 
          subscription.items?.data?.[0]?.current_period_end;
      }
    }
    
    return subscription;
  } catch (error: any) {
    console.error('[STRIPE-SERVICE] Error creating subscription:', error);
    throw new Error(`Failed to create subscription: ${error.message}`);
  }
};

/**
 * Update subscription quantities when accounts are added/removed
 */
export const updateSubscription = async (
  subscriptionId: string,
  newAccountCount: number
): Promise<any> => {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const additionalAccounts = Math.max(0, newAccountCount - 5);
    const basePlanPriceIds = getBasePlanPriceIdSet();

    // Find existing subscription items
    const baseItem = subscription.items.data.find(
      (item) => basePlanPriceIds.has(item.price.id)
    );
    const additionalItem = subscription.items.data.find(
      (item) => item.price.id === stripeConfig.priceIdAdditionalAccount
    );

    // Build update items array
    const items: any[] = [];

    // Keep base subscription item
    if (baseItem) {
      items.push({
        id: baseItem.id,
        quantity: 1,
      });
    } else {
      items.push({
        price: stripeConfig.priceIdBase,
        quantity: 1,
      });
    }

    // Handle additional accounts item
    if (additionalAccounts > 0) {
      if (additionalItem) {
        // Update existing item
        items.push({
          id: additionalItem.id,
          price: stripeConfig.priceIdAdditionalAccount,
          quantity: additionalAccounts,
        });
      } else {
        // Add new item
        items.push({
          price: stripeConfig.priceIdAdditionalAccount,
          quantity: additionalAccounts,
        });
      }
    } else if (additionalItem) {
      // Remove additional accounts item if no longer needed
      items.push({
        id: additionalItem.id,
        deleted: true,
      });
    }

    await stripe.subscriptions.update(subscriptionId, {
      items,
      proration_behavior: 'always_invoice', // Create prorations for changes
    });

    // Retrieve the full subscription object to get period dates
    const response = await stripe.subscriptions.retrieve(subscriptionId);
    const updatedSubscription = response as any;
    
    // Stripe SDK v19+ only includes current_period_start/end on SubscriptionItem, not Subscription
    // Copy them to subscription level for backwards compatibility
    const firstItem = updatedSubscription.items?.data?.[0];
    if (!updatedSubscription.current_period_start && firstItem) {
      updatedSubscription.current_period_start = firstItem.current_period_start;
      updatedSubscription.current_period_end = firstItem.current_period_end;
    }
    
    console.log(
      `[STRIPE-SERVICE] Updated subscription ${subscriptionId} to ${newAccountCount} accounts ` +
      `(period: ${new Date(updatedSubscription.current_period_start * 1000).toISOString()} - ` +
      `${new Date(updatedSubscription.current_period_end * 1000).toISOString()})`
    );
    
    return updatedSubscription;
  } catch (error: any) {
    console.error('[STRIPE-SERVICE] Error updating subscription:', error);
    throw new Error(`Failed to update subscription: ${error.message}`);
  }
};

/**
 * Create a billing portal session for customer self-service
 */
export const createBillingPortalSession = async (
  customerId: string,
  returnUrl: string
): Promise<string> => {
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    console.log(`[STRIPE-SERVICE] Created billing portal session for customer ${customerId}`);
    return session.url;
  } catch (error: any) {
    console.error('[STRIPE-SERVICE] Error creating billing portal session:', error);
    throw new Error(`Failed to create billing portal session: ${error.message}`);
  }
};

/**
 * Calculate monthly AI usage cost for an organization
 */
export const calculateMonthlyAIUsage = async (
  organizationId: string,
  year: number,
  month: number
): Promise<{ totalCost: number; breakdown: any }> => {
  try {
    const statistics = await AIUsageTrackingService.getMonthlyUsage(
      organizationId,
      year,
      month
    );

    if (!statistics) {
      return { totalCost: 0, breakdown: {} };
    }

    return {
      totalCost: statistics.totalCost,
      breakdown: statistics.breakdown,
    };
  } catch (error: any) {
    console.error('[STRIPE-SERVICE] Error calculating AI usage:', error);
    throw new Error(`Failed to calculate AI usage: ${error.message}`);
  }
};

/**
 * Create an invoice for monthly AI usage
 */
export const createUsageInvoice = async (
  customerId: string,
  organizationId: string,
  year: number,
  month: number
): Promise<string | null> => {
  try {
    const { totalCost, breakdown } = await calculateMonthlyAIUsage(
      organizationId,
      year,
      month
    );

    // Don't create invoice if no usage
    if (totalCost === 0) {
      console.log(
        `[STRIPE-SERVICE] No AI usage for org ${organizationId} in ${year}-${month}`
      );
      return null;
    }

    // Create invoice first (as draft)
    const invoice = await stripe.invoices.create({
      customer: customerId,
      auto_advance: false, // Don't auto-finalize yet
      collection_method: 'charge_automatically',
      description: `AI Usage Invoice - ${year}-${String(month).padStart(2, '0')}`,
    });

    // Create invoice item linked to this specific invoice
    await stripe.invoiceItems.create({
      customer: customerId,
      invoice: invoice.id, // Explicitly link to this invoice
      amount: Math.round(totalCost * 100), // Convert to cents
      currency: 'usd',
      description: `AI Usage for ${year}-${String(month).padStart(2, '0')}`,
      metadata: {
        organizationId,
        year: year.toString(),
        month: month.toString(),
        actions_cost: breakdown.actions?.cost?.toFixed(2) || '0',
        processing_cost: breakdown.processing?.cost?.toFixed(2) || '0',
        research_cost: breakdown.research?.cost?.toFixed(2) || '0',
      },
    });

    // Now finalize the invoice (this will calculate totals)
    // Set auto_advance to true so Stripe automatically attempts payment
    await stripe.invoices.finalizeInvoice(invoice.id, {
      auto_advance: true,
    });

    console.log(`[STRIPE-SERVICE] Created and paid set to auto_advance}`);
    return invoice.id;
  } catch (error: any) {
    console.error('[STRIPE-SERVICE] Error creating usage invoice:', error);
    throw new Error(`Failed to create usage invoice: ${error.message}`);
  }
};

/**
 * Get subscription status
 */
export const getSubscriptionStatus = async (
  subscriptionId: string
): Promise<any> => {
  try {
    const response = await stripe.subscriptions.retrieve(subscriptionId);
    const subscription = response as any;
    
    // Stripe SDK v19+ has period dates on SubscriptionItem, not on Subscription
    const firstItem = subscription.items?.data?.[0];
    const periodStart = subscription.current_period_start || firstItem?.current_period_start;
    const periodEnd = subscription.current_period_end || firstItem?.current_period_end;
    
    return {
      id: subscription.id,
      status: subscription.status,
      currentPeriodStart: periodStart ? new Date(periodStart * 1000) : null,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      items: subscription.items.data.map((item: any) => {
        const price = item.price as Stripe.Price;
        return {
          id: item.id,
          priceId: item.price.id,
          quantity: item.quantity,
          unitAmount: price?.unit_amount ?? null,
          currency: price?.currency ?? null,
          type: getPriceType(item.price.id),
        };
      }),
    };
  } catch (error: any) {
    console.error('[STRIPE-SERVICE] Error getting subscription status:', error);
    throw new Error(`Failed to get subscription status: ${error.message}`);
  }
};

/**
 * Update organization with Stripe customer and subscription data
 */
export const updateOrganizationBilling = async (
  organizationId: string,
  data: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    subscriptionStatus?: string;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    billingEmail?: string;
    paymentMethodAdded?: boolean;
  }
): Promise<void> => {
  try {
    console.log(`[STRIPE-SERVICE] Updating organization ${organizationId} with:`, {
      ...data,
      currentPeriodStart: data.currentPeriodStart?.toISOString(),
      currentPeriodEnd: data.currentPeriodEnd?.toISOString(),
    });
    
    const result = await Organization.findByIdAndUpdate(
      organizationId, 
      data,
      { new: true } // Return the updated document
    );
    
    if (result) {
      console.log(`[STRIPE-SERVICE] Organization ${organizationId} updated. Period dates in DB:`, {
        currentPeriodStart: result.currentPeriodStart?.toISOString(),
        currentPeriodEnd: result.currentPeriodEnd?.toISOString(),
      });
    } else {
      console.error(`[STRIPE-SERVICE] Organization ${organizationId} not found!`);
    }
  } catch (error: any) {
    console.error('[STRIPE-SERVICE] Error updating organization:', error);
    throw new Error(`Failed to update organization: ${error.message}`);
  }
};

