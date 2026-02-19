import { RequestHandler } from 'express';
import * as StripeService from '../services/StripeService';
import Organization from '../models/Organization';
import NylasConnection from '../models/NylasConnection';

/**
 * Billing Controller - Handles billing-related endpoints
 * 
 * Endpoints:
 * - POST /setup-billing - Create Stripe customer & setup intent
 * - POST /create-subscription - Create subscription based on account count
 * - POST /update-subscription - Update subscription when accounts change
 * - GET /billing-status - Get current billing information
 * - POST /billing-portal - Generate billing portal session URL
 */

/**
 * POST /api/billing/setup-billing
 * Initialize billing for an organization
 */
export const setupBilling: RequestHandler = async (req, res) => {
  try {
    const userId = req.user?.id;
    const organizationId = req.user?.organization;
    const { email } = req.body;

    if (!userId || !organizationId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const organization = await Organization.findById(organizationId);
    if (!organization) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    // Check if customer already exists
    if (organization.stripeCustomerId) {
      res.status(400).json({ 
        error: 'Billing is already set up for this organization' 
      });
      return;
    }

    // Create Stripe customer
    const customerId = await StripeService.createCustomer(
      organizationId.toString(),
      email,
      organization.name
    );

    // Create setup intent for payment method collection
    const clientSecret = await StripeService.createSetupIntent(customerId);

    // Update organization with customer ID and billing email
    await StripeService.updateOrganizationBilling(organizationId.toString(), {
      stripeCustomerId: customerId,
      billingEmail: email,
    });

    res.json({
      clientSecret,
      customerId,
    });
  } catch (error: any) {
    console.error('[BILLING-CONTROLLER] Error in setupBilling:', error);
    res.status(500).json({ error: error.message || 'Failed to setup billing' });
  }
};

/**
 * POST /api/billing/create-subscription
 * Create a subscription for the organization
 */
export const createSubscription: RequestHandler = async (req, res) => {
  try {
    const organizationId = req.user?.organization;

    if (!organizationId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const organization = await Organization.findById(organizationId);
    if (!organization) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    if (!organization.stripeCustomerId) {
      res.status(400).json({ 
        error: 'Billing is not set up. Please set up billing first.' 
      });
      return;
    }

    if (organization.stripeSubscriptionId) {
      res.status(400).json({ 
        error: 'Subscription already exists for this organization' 
      });
      return;
    }

    // Count connected accounts
    // Note: We don't set default payment method here - let subscription creation handle it
    // via payment_settings.save_default_payment_method: 'on_subscription'
    const accountCount = await NylasConnection.countDocuments({
      organization: organizationId,
      syncStatus: 'active',
    });

    // Create subscription
    const subscription = await StripeService.createSubscription(
      organization.stripeCustomerId,
      accountCount
    );

    // Update organization with subscription data
    const orgUpdateData: any = {
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      paymentMethodAdded: true,
    };

    if (subscription.current_period_start) {
      orgUpdateData.currentPeriodStart = new Date(subscription.current_period_start * 1000);
    }
    if (subscription.current_period_end) {
      orgUpdateData.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
    }

    await StripeService.updateOrganizationBilling(organizationId.toString(), orgUpdateData);

    // Extract client secret from the invoice's payment intent if subscription is incomplete
    let clientSecret = null;
    if (subscription.status === 'incomplete' && subscription.latest_invoice?.payment_intent) {
      const paymentIntent = subscription.latest_invoice.payment_intent;
      clientSecret = typeof paymentIntent === 'object' ? paymentIntent.client_secret : null;
    }

    const response = {
      subscriptionId: subscription.id,
      status: subscription.status,
      clientSecret,
      requiresAction: subscription.status === 'incomplete' && !!clientSecret,
    };

    console.log('[BILLING-CONTROLLER] Returning subscription response:', {
      subscriptionId: response.subscriptionId,
      status: response.status,
      hasClientSecret: !!response.clientSecret,
      clientSecretPreview: response.clientSecret?.substring(0, 20),
    });

    res.json(response);
  } catch (error: any) {
    console.error('[BILLING-CONTROLLER] Error in createSubscription:', error);
    res.status(500).json({ error: error.message || 'Failed to create subscription' });
  }
};

/**
 * POST /api/billing/update-subscription
 * Update subscription quantities (called automatically when accounts change)
 */
export const updateSubscription: RequestHandler = async (req, res) => {
  try {
    const organizationId = req.user?.organization;

    if (!organizationId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const organization = await Organization.findById(organizationId);
    if (!organization) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    if (!organization.stripeSubscriptionId) {
      res.status(400).json({ error: 'No active subscription found' });
      return;
    }

    // Count current connected accounts
    const accountCount = await NylasConnection.countDocuments({
      organization: organizationId,
      syncStatus: 'active',
    });

    // Update subscription
    const subscription = await StripeService.updateSubscription(
      organization.stripeSubscriptionId,
      accountCount
    );

    // Update organization with new period dates
    const orgUpdateData: any = {
      subscriptionStatus: subscription.status,
    };
    if (subscription.current_period_start) {
      orgUpdateData.currentPeriodStart = new Date(subscription.current_period_start * 1000);
    }
    if (subscription.current_period_end) {
      orgUpdateData.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
    }
    
    await StripeService.updateOrganizationBilling(organizationId.toString(), orgUpdateData);

    res.json({
      subscriptionId: subscription.id,
      status: subscription.status,
      accountCount,
    });
  } catch (error: any) {
    console.error('[BILLING-CONTROLLER] Error in updateSubscription:', error);
    res.status(500).json({ error: error.message || 'Failed to update subscription' });
  }
};

/**
 * GET /api/billing/status
 * Get current billing status for the organization
 */
export const getBillingStatus: RequestHandler = async (req, res) => {
  try {
    const organizationId = req.user?.organization;

    if (!organizationId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const organization = await Organization.findById(organizationId);
    if (!organization) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    console.log('[BILLING-CONTROLLER] Organization billing data from DB:', {
      currentPeriodStart: organization.currentPeriodStart,
      currentPeriodEnd: organization.currentPeriodEnd,
      subscriptionStatus: organization.subscriptionStatus,
    });

    // Count connected accounts
    const accountCount = await NylasConnection.countDocuments({
      organization: organizationId,
      syncStatus: 'active',
    });

    // Get subscription details if it exists
    let subscriptionDetails = null;
    if (organization.stripeSubscriptionId) {
      try {
        subscriptionDetails = await StripeService.getSubscriptionStatus(
          organization.stripeSubscriptionId
        );
      } catch (error) {
        console.error('[BILLING-CONTROLLER] Error fetching subscription:', error);
      }
    }

    const response = {
      hasStripeCustomer: !!organization.stripeCustomerId,
      paymentMethodAdded: organization.paymentMethodAdded || false,
      subscriptionStatus: organization.subscriptionStatus || null,
      currentPeriodStart: organization.currentPeriodStart || null,
      currentPeriodEnd: organization.currentPeriodEnd || null,
      billingEmail: organization.billingEmail || null,
      connectedAccounts: accountCount,
      subscription: subscriptionDetails,
    };

    console.log('[BILLING-CONTROLLER] Returning billing status:', {
      currentPeriodStart: response.currentPeriodStart,
      currentPeriodEnd: response.currentPeriodEnd,
    });

    res.json(response);
  } catch (error: any) {
    console.error('[BILLING-CONTROLLER] Error in getBillingStatus:', error);
    res.status(500).json({ error: error.message || 'Failed to get billing status' });
  }
};

/**
 * POST /api/billing/portal
 * Create a billing portal session for customer self-service
 */
export const createBillingPortal: RequestHandler = async (req, res) => {
  try {
    const organizationId = req.user?.organization;
    const { returnUrl } = req.body;

    if (!organizationId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const organization = await Organization.findById(organizationId);
    if (!organization) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    if (!organization.stripeCustomerId) {
      res.status(400).json({ 
        error: 'No billing account found. Please set up billing first.' 
      });
      return;
    }

    const portalUrl = await StripeService.createBillingPortalSession(
      organization.stripeCustomerId,
      returnUrl || `${process.env.FRONTEND_URL}/settings/billing`
    );

    res.json({ url: portalUrl });
  } catch (error: any) {
    console.error('[BILLING-CONTROLLER] Error in createBillingPortal:', error);
    res.status(500).json({ error: error.message || 'Failed to create billing portal' });
  }
};

