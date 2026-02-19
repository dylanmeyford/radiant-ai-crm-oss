import { CreditCard, ExternalLink, Loader2, AlertCircle, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useBilling } from '@/hooks/useBilling';
import { useBillingOperations } from '@/hooks/useBillingOperations';
import { useNavigate } from 'react-router-dom';
import type { BillingStatus } from '@/types/billing';

const DEFAULT_BASE_PLAN_PRICE = 399;
const DEFAULT_ADDITIONAL_ACCOUNT_PRICE = 45;

const formatMonthlyPrice = (amount: number) => {
  const hasCents = Math.round(amount * 100) % 100 !== 0;
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  });
};

const resolvePlanPrice = (
  status: BillingStatus | undefined,
  type: 'base' | 'additional'
) => {
  const item = status?.subscription?.items?.find((subscriptionItem) => subscriptionItem.type === type);
  if (item?.unitAmount != null) {
    return item.unitAmount / 100;
  }

  return type === 'base' ? DEFAULT_BASE_PLAN_PRICE : DEFAULT_ADDITIONAL_ACCOUNT_PRICE;
};

const calculateCurrentMonthCost = (status: BillingStatus) => {
  const basePlanPrice = resolvePlanPrice(status, 'base');
  const additionalAccountPrice = resolvePlanPrice(status, 'additional');
  const additionalAccounts = Math.max(0, status.connectedAccounts - 5);

  return basePlanPrice + additionalAccounts * additionalAccountPrice;
};

/**
 * BillingSettings Component
 * Displays subscription status, account usage, and AI usage estimate
 */
export default function BillingSettings() {
  const navigate = useNavigate();
  const { 
    billingStatus, 
    isLoadingBillingStatus, 
    openBillingPortal, 
    isOpeningBillingPortal,
    checkBillingRequired 
  } = useBilling();

  // Use the same billing operations hook as sidebar for consistency
  const { liveUsage, isLoadingLiveUsage, liveUsageError } = useBillingOperations();

  const handleOpenBillingPortal = async () => {
    await openBillingPortal(window.location.href);
  };

  if (isLoadingBillingStatus) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  // No billing setup
  if (!billingStatus || checkBillingRequired()) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-gray-600" />
                <h3 className="text-sm font-medium text-gray-900">Billing</h3>
              </div>
            </div>
            <div className="p-4">
              <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-blue-900">Billing Not Set Up</h4>
                  <p className="text-xs text-blue-700 mt-1">
                    Set up billing to start connecting email accounts and using the platform
                  </p>
                  <Button
                    size="sm"
                    onClick={() => navigate('/billing/setup')}
                    className="mt-3 bg-blue-600 hover:bg-blue-700"
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Set Up Billing
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const getStatusBadgeVariant = (status: string | null) => {
    switch (status) {
      case 'active':
      case 'trialing':
        return 'default';
      case 'past_due':
        return 'destructive';
      case 'canceled':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const currentMonthCost = calculateCurrentMonthCost(billingStatus);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {/* Subscription Overview */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-gray-600" />
              <h3 className="text-sm font-medium text-gray-900">Subscription</h3>
            </div>
            <Badge variant={getStatusBadgeVariant(billingStatus.subscriptionStatus)}>
              {billingStatus.subscriptionStatus || 'N/A'}
            </Badge>
          </div>
        </div>
        <div className="p-4 space-y-4">
          {/* Current Period */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Current Billing Period</p>
              <div className="flex items-center gap-2 mt-1">
                <CalendarIcon className="h-3 w-3 text-gray-400" />
                <p className="text-sm text-gray-900">
                  {formatDate(billingStatus.currentPeriodStart)} - {formatDate(billingStatus.currentPeriodEnd)}
                </p>
              </div>
            </div>
          </div>

          {/* Account Usage */}
          <div className="pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500 mb-2">Connected Accounts</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {billingStatus.connectedAccounts} account{billingStatus.connectedAccounts !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-gray-500">
                  {billingStatus.connectedAccounts <= 5
                    ? `${billingStatus.connectedAccounts} of 5 included`
                    : `5 included + ${billingStatus.connectedAccounts - 5} additional`
                  }
                </p>
              </div>
              <p className="text-sm font-medium text-gray-900">
                ${formatMonthlyPrice(currentMonthCost)}/mo
              </p>
            </div>
          </div>

          {/* Manage Billing */}
          <div className="pt-4 border-t border-gray-200">
            <Button
              onClick={handleOpenBillingPortal}
              disabled={isOpeningBillingPortal}
              variant="outline"
              className="w-full"
            >
              {isOpeningBillingPortal ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Opening...
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Manage Billing
                </>
              )}
            </Button>
            <p className="text-xs text-gray-500 mt-2 text-center">
              Update payment method, view invoices, and manage subscription
            </p>
          </div>
        </div>
      </div>

      {/* AI Usage Estimate */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-gray-600" />
            <h3 className="text-sm font-medium text-gray-900">AI Usage (Current Month)</h3>
          </div>
        </div>
        <div className="p-4">
          {isLoadingLiveUsage ? (
            <Skeleton className="h-16 w-full" />
          ) : liveUsageError ? (
            <p className="text-xs text-red-600">Failed to load AI usage</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">Estimated Cost</p>
                <p className="text-lg font-semibold text-gray-900">
                  ${liveUsage?.usage?.totalCost?.toFixed(2) || '0.00'}
                </p>
              </div>
              
              {liveUsage?.usage?.breakdown && (
                <div className="space-y-2 pt-3 border-t border-gray-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Actions</span>
                    <span className="text-gray-900">
                      ${liveUsage.usage.breakdown.actions?.cost?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Processing</span>
                    <span className="text-gray-900">
                      ${liveUsage.usage.breakdown.processing?.cost?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Research</span>
                    <span className="text-gray-900">
                      ${liveUsage.usage.breakdown.research?.cost?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                </div>
              )}
              
              <p className="text-xs text-gray-500 mt-3">
                AI usage will be billed at the end of the month at cost
              </p>
            </div>
          )}
        </div>
      </div>

          {/* Billing Email */}
          {billingStatus.billingEmail && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500">Billing Email</p>
              <p className="text-sm text-gray-900 mt-1">{billingStatus.billingEmail}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

