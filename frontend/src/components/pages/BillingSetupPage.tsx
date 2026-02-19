import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CreditCard, Check } from 'lucide-react';
import { useBilling } from '@/hooks/useBilling';

// Initialize Stripe with publishable key from environment
const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

if (!publishableKey) {
  console.error('[BILLING-SETUP] VITE_STRIPE_PUBLISHABLE_KEY is not set!');
}

const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

/**
 * BillingSetupPage
 * Allows users to set up their billing information with Stripe
 */
export default function BillingSetupPage() {
  const [email, setEmail] = useState('');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [step, setStep] = useState<'email' | 'payment' | 'complete'>('email');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { setupBilling, isSettingUpBilling } = useBilling();
  const navigate = useNavigate();

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    console.log('[BILLING-SETUP] Submitting email:', email);
    
    const result = await setupBilling(email);
    
    console.log('[BILLING-SETUP] Setup result:', result);
    
    if (result.success && result.data) {
      console.log('[BILLING-SETUP] Setting client secret and moving to payment step');
      setClientSecret(result.data.clientSecret);
      setStep('payment');
    } else {
      console.error('[BILLING-SETUP] Setup failed:', result.error);
      setErrorMessage(result.error || 'Failed to setup billing');
    }
  };

  const handlePaymentComplete = () => {
    setStep('complete');
    // Redirect to accounts page after a brief delay
    setTimeout(() => {
      navigate('/settings/accounts');
    }, 2000);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto pb-8">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Set Up Billing
          </h1>
          <p className="text-sm text-gray-600">
            Set up your payment method to start connecting email accounts
          </p>
        </div>

        {/* Pricing Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-sm font-medium text-gray-900 mb-4">Pricing</h2>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Check className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">Base Plan - $399/month</p>
                <p className="text-xs text-gray-500">Includes up to 5 connected email accounts</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Check className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">Additional Accounts - $45/month each</p>
                <p className="text-xs text-gray-500">For each account beyond the first 5</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Check className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">AI Usage - Billed Monthly</p>
                <p className="text-xs text-gray-500">Charged at cost at the end of each month</p>
              </div>
            </div>
          </div>
        </div>

        {/* Setup Steps */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          {/* Error Message */}
          {errorMessage && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-xs text-red-600">{errorMessage}</p>
            </div>
          )}

          {step === 'email' && (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email" className="text-sm font-medium text-gray-900">
                  Billing Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="billing@company.com"
                  required
                  className="mt-1"
                  disabled={isSettingUpBilling}
                />
                <p className="text-xs text-gray-500 mt-1">
                  We'll send invoices and receipts to this email
                </p>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isSettingUpBilling || !email}
              >
                {isSettingUpBilling ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Continue to Payment
                  </>
                )}
              </Button>
            </form>
          )}

          {step === 'payment' && clientSecret && stripePromise && (
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <PaymentForm 
                onComplete={handlePaymentComplete}
              />
            </Elements>
          )}

          {step === 'payment' && !clientSecret && (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 text-gray-400 animate-spin mx-auto mb-4" />
              <p className="text-sm text-gray-600">Loading payment form...</p>
            </div>
          )}

          {step === 'complete' && (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Billing Setup Complete!
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Redirecting you to connect your email accounts...
              </p>
              <Loader2 className="h-5 w-5 text-gray-400 animate-spin mx-auto" />
            </div>
          )}
        </div>

        {/* Info Footer */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            Your payment information is securely processed by Stripe. We never store your card details.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Payment Form Component
 * Handles Stripe Elements payment form and setup intent confirmation
 */
interface PaymentFormProps {
  onComplete: () => void;
}

function PaymentForm({ onComplete }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [processingStep, setProcessingStep] = useState<string>('');
  const { createSubscription } = useBilling();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // Step 1: Confirm the setup intent to save payment method
      setProcessingStep('Saving payment method...');
      
      const { error: stripeError } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/billing/setup`,
        },
        redirect: 'if_required',
      });

      if (stripeError) {
        console.error('[BILLING-SETUP] SetupIntent failed:', stripeError);
        setErrorMessage(stripeError.message || 'Payment setup failed');
        setIsProcessing(false);
        return;
      }

      // Step 2: Create the subscription
      setProcessingStep('Creating subscription...');
      
      const subscriptionResult = await createSubscription();
      
      if (!subscriptionResult.success) {
        console.error('[BILLING-SETUP] Subscription creation failed:', subscriptionResult.error);
        setErrorMessage(subscriptionResult.error || 'Failed to create subscription');
        setIsProcessing(false);
        return;
      }

      // Step 3: Check if 3DS authentication is required
      if (!subscriptionResult.data) {
        console.error('[BILLING-SETUP] No subscription data returned');
        setErrorMessage('Failed to create subscription - no data returned');
        setIsProcessing(false);
        return;
      }

      const { status, clientSecret, requiresAction } = subscriptionResult.data;

      if (requiresAction && clientSecret) {
        // 3DS authentication required
        setProcessingStep('Completing payment authentication...');

        const { error: paymentError } = await stripe.confirmPayment({
          clientSecret,
          redirect: 'if_required',
          confirmParams: {
            return_url: `${window.location.origin}/billing/setup`,
          },
        });

        if (paymentError) {
          console.error('[BILLING-SETUP] Payment confirmation failed:', paymentError);
          setErrorMessage(paymentError.message || 'Payment authentication failed');
          setIsProcessing(false);
          return;
        }

      } else if (status === 'active' || status === 'trialing') {
        // Subscription is already active (no 3DS required)
      } else if (status === 'incomplete' && !clientSecret) {
        // Subscription is processing, wait a bit for webhooks
        setProcessingStep('Processing payment...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        // Unexpected status
        console.warn('[BILLING-SETUP] Unexpected subscription status:', status);
      }

      // Success! Wait a moment for webhook to process, then complete
      setProcessingStep('Finalizing...');
      
      // Give webhook time to update the subscription status
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      onComplete();
    } catch (error) {
      console.error('[BILLING-SETUP] Error in handleSubmit:', error);
      setErrorMessage(error instanceof Error ? error.message : 'An error occurred');
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-4">Payment Method</h3>
        <PaymentElement />
      </div>

      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-xs text-red-600">{errorMessage}</p>
        </div>
      )}

      {isProcessing && processingStep && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
            <p className="text-xs text-blue-700">{processingStep}</p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <Button
          type="submit"
          className="w-full"
          disabled={isProcessing || !stripe || !elements}
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="h-4 w-4 mr-2" />
              Complete Setup
            </>
          )}
        </Button>

        <p className="text-xs text-gray-500 text-center">
          By completing setup, you agree to our terms and authorize us to charge your payment method monthly.
        </p>
        
        {isProcessing && (
          <p className="text-xs text-gray-500 text-center">
            If your card requires authentication, you may see a popup from your bank.
          </p>
        )}
      </div>
    </form>
  );
}

