import { RequestHandler } from 'express';
import { stripe } from '../config/stripe';
import * as StripeService from '../services/StripeService';
import Organization from '../models/Organization';
import Stripe from 'stripe';

/**
 * Stripe Webhook Controller
 * 
 * Handles webhook events from Stripe:
 * - customer.subscription.updated
 * - customer.subscription.deleted
 * - invoice.payment_succeeded
 * - invoice.payment_failed
 * - setup_intent.succeeded
 */

/**
 * POST /api/webhooks/stripe
 * Handle incoming Stripe webhook events
 */
export const handleStripeWebhook: RequestHandler = async (req, res) => {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    console.error('[STRIPE-WEBHOOK] No signature found in request');
    res.status(400).send('No signature found');
    return;
  }

  let event: Stripe.Event;

  try {
    // Verify the webhook signature and construct the event
    // express.raw() provides req.body as a Buffer
    // Stripe's constructEvent accepts Buffer directly - do NOT convert to string
    console.log('[STRIPE-WEBHOOK] Body type:', typeof req.body, 'isBuffer:', Buffer.isBuffer(req.body));
    
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error('[STRIPE-WEBHOOK] Signature verification failed:', err.message);
    console.error('[STRIPE-WEBHOOK] Signature header:', sig);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  console.log(`[STRIPE-WEBHOOK] Received event: ${event.type}`);

  // Quickly return 200 to acknowledge receipt
  res.status(200).json({ received: true });

  // Process the event asynchronously
  try {
    switch (event.type) {
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case 'setup_intent.succeeded':
        await handleSetupIntentSucceeded(event.data.object as Stripe.SetupIntent);
        break;

      default:
        console.log(`[STRIPE-WEBHOOK] Unhandled event type: ${event.type}`);
    }
  } catch (error: any) {
    console.error(`[STRIPE-WEBHOOK] Error processing ${event.type}:`, error);
    // Don't throw - we already returned 200 to Stripe
  }
};

/**
 * Handle subscription.updated event
 * Updates organization subscription status and period dates
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  try {
    const org = await Organization.findOne({
      stripeCustomerId: subscription.customer as string,
    });

    if (!org) {
      console.error(
        `[STRIPE-WEBHOOK] Organization not found for customer: ${subscription.customer}`
      );
      return;
    }

    const sub = subscription as any;
    await StripeService.updateOrganizationBilling(org.id, {
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status as any,
      currentPeriodStart: new Date((sub.current_period_start ?? sub.currentPeriodStart) * 1000),
      currentPeriodEnd: new Date((sub.current_period_end ?? sub.currentPeriodEnd) * 1000),
    });

    console.log(
      `[STRIPE-WEBHOOK] Updated subscription status for org ${org._id}: ${subscription.status}`
    );
  } catch (error: any) {
    console.error('[STRIPE-WEBHOOK] Error handling subscription.updated:', error);
    throw error;
  }
}

/**
 * Handle subscription.deleted event
 * Marks subscription as canceled
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  try {
    const org = await Organization.findOne({
      stripeCustomerId: subscription.customer as string,
    });

    if (!org) {
      console.error(
        `[STRIPE-WEBHOOK] Organization not found for customer: ${subscription.customer}`
      );
      return;
    }

    await StripeService.updateOrganizationBilling(org.id, {
      subscriptionStatus: 'canceled',
    });

    console.log(
      `[STRIPE-WEBHOOK] Subscription canceled for org ${org._id}`
    );
  } catch (error: any) {
    console.error('[STRIPE-WEBHOOK] Error handling subscription.deleted:', error);
    throw error;
  }
}

/**
 * Handle invoice.payment_succeeded event
 * Log successful payment
 */
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  try {
    console.log(
      `[STRIPE-WEBHOOK] Payment succeeded for invoice ${invoice.id}, customer: ${invoice.customer}`
    );

    // Update organization if it's a subscription invoice
    const inv = invoice as any;
    if (inv.subscription) {
      const org = await Organization.findOne({
        stripeCustomerId: invoice.customer as string,
      });

      if (org) {
        // Ensure subscription status is active after successful payment
        await StripeService.updateOrganizationBilling(org.id, {
          subscriptionStatus: 'active',
        });
      }
    }
  } catch (error: any) {
    console.error('[STRIPE-WEBHOOK] Error handling invoice.payment_succeeded:', error);
    throw error;
  }
}

/**
 * Handle invoice.payment_failed event
 * Update status and log failure
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  try {
    const org = await Organization.findOne({
      stripeCustomerId: invoice.customer as string,
    });

    if (!org) {
      console.error(
        `[STRIPE-WEBHOOK] Organization not found for customer: ${invoice.customer}`
      );
      return;
    }

    // Update subscription status to past_due if it's a subscription invoice
    const inv2 = invoice as any;
    if (inv2.subscription) {
      await StripeService.updateOrganizationBilling(org.id, {
        subscriptionStatus: 'past_due',
      });
    }

    console.error(
      `[STRIPE-WEBHOOK] Payment failed for org ${org._id}, invoice: ${invoice.id}`
    );

    // TODO: Send notification to organization admin about payment failure
  } catch (error: any) {
    console.error('[STRIPE-WEBHOOK] Error handling invoice.payment_failed:', error);
    throw error;
  }
}

/**
 * Handle setup_intent.succeeded event
 * Marks that payment method has been successfully added and sets it as default
 */
async function handleSetupIntentSucceeded(setupIntent: Stripe.SetupIntent) {
  try {
    const org = await Organization.findOne({
      stripeCustomerId: setupIntent.customer as string,
    });

    if (!org) {
      console.error(
        `[STRIPE-WEBHOOK] Organization not found for customer: ${setupIntent.customer}`
      );
      return;
    }

    // Set the payment method as the customer's default for invoices
    if (setupIntent.payment_method) {
      try {
        await stripe.customers.update(setupIntent.customer as string, {
          invoice_settings: {
            default_payment_method: setupIntent.payment_method as string,
          },
        });
        console.log(
          `[STRIPE-WEBHOOK] Set default payment method ${setupIntent.payment_method} for customer ${setupIntent.customer}`
        );
      } catch (error: any) {
        console.error('[STRIPE-WEBHOOK] Error setting default payment method:', error);
      }
    }

    await StripeService.updateOrganizationBilling(org.id, {
      paymentMethodAdded: true,
    });

    console.log(
      `[STRIPE-WEBHOOK] Payment method added for org ${org.id}`
    );
  } catch (error: any) {
    console.error('[STRIPE-WEBHOOK] Error handling setup_intent.succeeded:', error);
    throw error;
  }
}

