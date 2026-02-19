import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePageActions } from "@/context/PageActionsContext";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Mail, Calendar, Settings, Wifi, WifiOff, AlertCircle, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useNylasConnections } from "@/hooks/useNylasConnections";
import { useCalendars } from "@/hooks/useCalendars";
import { useNotetakerSetting } from "@/hooks/useNotetakerSetting";
import { useBilling } from "@/hooks/useBilling";
import type { BillingStatus } from "@/types/billing";

const DEFAULT_BASE_PLAN_PRICE = 399;
const DEFAULT_ADDITIONAL_ACCOUNT_PRICE = 45;

const formatMonthlyPrice = (amount: number) => {
  const hasCents = Math.round(amount * 100) % 100 !== 0;
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  });
};

const resolvePlanPrice = (
  status: BillingStatus | undefined,
  type: "base" | "additional"
) => {
  const item = status?.subscription?.items?.find((subscriptionItem) => subscriptionItem.type === type);
  if (item?.unitAmount != null) {
    return item.unitAmount / 100;
  }

  return type === "base" ? DEFAULT_BASE_PLAN_PRICE : DEFAULT_ADDITIONAL_ACCOUNT_PRICE;
};

interface ConnectedAccount {
  _id: string;
  email: string;
  provider: string;
  services?: {
    email: boolean;
    calendar: boolean;
  };
  syncStatus: 'active' | 'disconnected' | 'error' | 'expired';
}

interface Calendar {
  id: string;
  name: string;
  description?: string;
  isSubscribed: boolean;
}

export default function AccountsPage() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [showNotetakerConfirmDialog, setShowNotetakerConfirmDialog] = useState<{ connectionId: string; currentState: boolean } | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const { setActions, clearActions } = usePageActions();
  const navigate = useNavigate();

  const { connections, isLoading: isLoadingAccounts, connectAccount: handleConnectAccountFromHook } = useNylasConnections();
  const { isUpdating: isUpdatingNotetakerSetting, updateSetting, getConnectionSetting } = useNotetakerSetting();
  const { billingStatus, isLoadingBillingStatus, checkBillingRequired } = useBilling();
  const basePlanPrice = resolvePlanPrice(billingStatus, "base");
  const additionalAccountPrice = resolvePlanPrice(billingStatus, "additional");
  const additionalAccountCount = billingStatus ? Math.max(0, billingStatus.connectedAccounts - 5) : 0;
  const currentMonthlyCost = basePlanPrice + additionalAccountCount * additionalAccountPrice;
  
  // Set page actions
  useEffect(() => {
    setActions([
      {
        id: 'refresh-accounts',
        label: 'Refresh',
        icon: Settings,
        onClick: () => window.location.reload(),
        variant: 'outline'
      }
    ]);

    return () => {
      clearActions();
    };
  }, [setActions, clearActions]);

  // Auto-hide toast after 5 seconds
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const handleConnectAccount = async () => {
    setIsConnecting(true);
    try {
      await handleConnectAccountFromHook();
    } catch (error) {
      setToastMessage({
        type: 'error',
        message: 'Failed to connect account. Please try again.'
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleNotetakerToggle = (connectionId: string, currentState: boolean) => {
    setShowNotetakerConfirmDialog({ connectionId, currentState });
  };

  const handleConfirmNotetakerToggle = async () => {
    if (!showNotetakerConfirmDialog) return;
    
    const { connectionId, currentState } = showNotetakerConfirmDialog;
    const newNotetakerState = !currentState;
    
    // Close dialog immediately - TanStack Query handles optimistic updates
    setShowNotetakerConfirmDialog(null);
    
    // Set optimistic success message
    setToastMessage({
      type: 'success',
      message: `AI Notetaker has been ${newNotetakerState ? "enabled" : "disabled"} for this connection.`
    });
    
    // Call the update function - TanStack Query will handle rollback on error
    const result = await updateSetting(connectionId, newNotetakerState);
    
    // Only show error toast if the operation failed
    if (!result.success) {
      setToastMessage({
        type: 'error',
        message: 'Could not update AI Notetaker setting. Please try again.'
      });
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4">
        {/* Toast notification */}
        {toastMessage && (
          <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg border shadow-lg transition-all duration-200 ${
            toastMessage.type === 'success' 
              ? 'bg-green-50 border-green-200 text-green-800' 
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <p className="text-sm font-medium">{toastMessage.message}</p>
          </div>
        )}

        <div className="space-y-4">
          {/* Billing Required Banner */}
          {!isLoadingBillingStatus && checkBillingRequired() && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-blue-900">Billing Setup Required</h3>
                  <p className="text-xs text-blue-700 mt-1">
                    Set up your billing information before connecting email accounts
                  </p>
                  <Button
                    size="sm"
                    onClick={() => navigate('/billing/setup')}
                    className="mt-3 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Set Up Billing
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Account Count & Pricing Info */}
          {billingStatus && billingStatus.paymentMethodAdded && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {billingStatus.connectedAccounts} of 5 included accounts
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {billingStatus.connectedAccounts > 5 
                      ? `${billingStatus.connectedAccounts - 5} additional account${billingStatus.connectedAccounts - 5 !== 1 ? 's' : ''} at $${formatMonthlyPrice(additionalAccountPrice)}/month each`
                      : `${5 - billingStatus.connectedAccounts} remaining in base plan`
                    }
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">
                    ${formatMonthlyPrice(currentMonthlyCost)}/month
                  </p>
                  <p className="text-xs text-gray-500">+ AI usage</p>
                </div>
              </div>
            </div>
          )}

          {/* Connected Accounts */}
          <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-gray-600" />
                <h3 className="text-sm font-medium text-gray-900">Connected Accounts</h3>
              </div>
              <p className="text-xs text-gray-500 mt-1">Connect your email and calendar accounts to sync messages, contacts, and events</p>
            </div>
            <div className="p-4">
              <div className="space-y-4">
                {isLoadingAccounts ? (
                  <div className="space-y-3">
                    <Skeleton className="h-16 w-full rounded-md" />
                    <Skeleton className="h-16 w-full rounded-md" />
                  </div>
                ) : (
                  <>
                    {connections.length > 0 ? (
                      connections.map(account => (
                        <ConnectedAccountCard 
                          key={account._id} 
                          account={account} 
                          notetakerEnabled={getConnectionSetting(account._id)}
                          onNotetakerToggle={handleNotetakerToggle}
                          isUpdatingNotetaker={isUpdatingNotetakerSetting}
                        />
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center p-8 text-center">
                        <Mail className="h-8 w-8 text-gray-400 mb-2" />
                        <p className="text-sm text-gray-500 mb-4">No connected accounts</p>
                      </div>
                    )}
                    <div>
                      <Button 
                        onClick={handleConnectAccount} 
                        disabled={isConnecting || checkBillingRequired()}
                        className="w-full bg-gray-900 text-white hover:bg-gray-800 px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200"
                      >
                        {isConnecting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Plus className="mr-2 h-4 w-4" />
                            Connect Account
                          </>
                        )}
                      </Button>
                      {checkBillingRequired() && (
                        <p className="text-xs text-gray-500 mt-2 text-center">
                          Set up billing to connect accounts
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <Dialog open={!!showNotetakerConfirmDialog} onOpenChange={() => setShowNotetakerConfirmDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {showNotetakerConfirmDialog?.currentState ? "Disable" : "Enable"} AI Notetaker?
              </DialogTitle>
              <DialogDescription>
                {showNotetakerConfirmDialog?.currentState
                  ? "Disabling the AI Notetaker will stop automatic recording and analysis of meetings for this connection."
                  : "Enabling the AI Notetaker will allow it to join, record, and analyze meetings for this connection to provide summaries and insights."}
                You can always change this setting later.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setShowNotetakerConfirmDialog(null)}
                disabled={isUpdatingNotetakerSetting}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleConfirmNotetakerToggle} 
                disabled={isUpdatingNotetakerSetting}
                className="bg-gray-900 text-white hover:bg-gray-800"
              >
                {isUpdatingNotetakerSetting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function ConnectedAccountCard({ 
  account, 
  notetakerEnabled, 
  onNotetakerToggle, 
  isUpdatingNotetaker 
}: { 
  account: ConnectedAccount;
  notetakerEnabled: boolean;
  onNotetakerToggle: (connectionId: string, currentState: boolean) => void;
  isUpdatingNotetaker: boolean;
}) {
  const { calendars, isLoadingCalendars, updateSubscription } = useCalendars(account._id);
  const { connectAccount } = useNylasConnections();
  const [updatingCalendarId, setUpdatingCalendarId] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const handleCalendarToggle = async (calendarId: string, isSubscribed: boolean) => {
    setUpdatingCalendarId(calendarId);
    try {
      await updateSubscription(calendarId, isSubscribed);
    } catch (error) {
      console.error('Failed to update calendar subscription:', error);
    } finally {
      setUpdatingCalendarId(null);
    }
  };

  const handleReconnect = async () => {
    setIsReconnecting(true);
    try {
      await connectAccount();
    } catch (error) {
      console.error('Failed to reconnect account:', error);
    } finally {
      setIsReconnecting(false);
    }
  };

  // Determine styling based on status
  const getStatusColor = () => {
    if (account.syncStatus === 'active') return { bg: 'bg-green-50', text: 'text-green-600', badge: 'bg-green-50 text-green-700 border-green-200' };
    if (account.syncStatus === 'expired') return { bg: 'bg-orange-50', text: 'text-orange-600', badge: 'bg-orange-50 text-orange-700 border-orange-200' };
    return { bg: 'bg-red-50', text: 'text-red-600', badge: 'bg-red-50 text-red-700 border-red-200' };
  };

  const statusColors = getStatusColor();
  const isExpired = account.syncStatus === 'expired';

  return (
    <div className="space-y-4">
      <div className={`p-4 border rounded-lg transition-colors ${
        isExpired ? 'border-orange-300 bg-orange-50/30' : 'border-gray-200 hover:border-gray-300'
      }`}>
        {/* Account Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`p-2 rounded-md ${statusColors.bg}`}>
              {account.syncStatus === 'active' ? (
                <Wifi className={`h-4 w-4 ${statusColors.text}`} />
              ) : (
                <WifiOff className={`h-4 w-4 ${statusColors.text}`} />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{account.email}</p>
              <p className="text-xs text-gray-500">{account.provider}</p>
            </div>
          </div>
          <Badge className={`px-2 py-1 text-xs font-medium rounded-md ${statusColors.badge}`}>
            {account.syncStatus}
          </Badge>
        </div>
        
        {/* Expired Grant Alert - Inside Card */}
        {isExpired && (
          <div className="mt-4 pt-4 border-t border-orange-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="text-sm font-medium text-orange-900">Connection Expired</h4>
                <p className="text-xs text-orange-700 mt-1">
                  This account's authorization has expired and needs to be reconnected to continue syncing emails, 
                  calendar events, and other data.
                </p>
                <Button
                  onClick={handleReconnect}
                  disabled={isReconnecting}
                  size="sm"
                  className="mt-3 bg-orange-600 hover:bg-orange-700 text-white"
                >
                  {isReconnecting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Reconnecting...
                    </>
                  ) : (
                    'Reconnect Account'
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* AI Notetaker Settings for this connection */}
      <div className="ml-4 p-4 border border-gray-200 rounded-lg bg-gray-50/30 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Settings className="h-4 w-4 text-gray-600" />
          <h4 className="text-sm font-medium text-gray-900">AI Notetaker</h4>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Switch
              id={`ai-notetaker-toggle-${account._id}`}
              checked={notetakerEnabled}
              onCheckedChange={() => onNotetakerToggle(account._id, notetakerEnabled)}
              disabled={isUpdatingNotetaker}
            />
            <Label htmlFor={`ai-notetaker-toggle-${account._id}`} className="text-sm text-gray-900">
              Enable for this connection
            </Label>
          </div>
          {isUpdatingNotetaker && (
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          )}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          When enabled, the AI Notetaker will join, record, and analyze meetings for this email account.
        </p>
      </div>
      
      <div className="ml-4 p-4 border border-gray-200 rounded-lg bg-gray-50/30">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="h-4 w-4 text-gray-600" />
          <h4 className="text-sm font-medium text-gray-900">Available Calendars</h4>
        </div>
        
        {isLoadingCalendars ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-full rounded" />
            <Skeleton className="h-6 w-3/4 rounded" />
            <Skeleton className="h-6 w-1/2 rounded" />
          </div>
        ) : calendars.length > 0 ? (
          <div className="space-y-3">
            {calendars.map(calendar => (
              <div key={calendar.id} className="flex items-start space-x-2">
                <div className="relative">
                  <Checkbox 
                    id={`calendar-${calendar.id}`} 
                    checked={calendar.isSubscribed}
                    onCheckedChange={(checked) => handleCalendarToggle(calendar.id, checked as boolean)}
                    disabled={updatingCalendarId === calendar.id}
                    className="cursor-pointer"
                  />
                  {updatingCalendarId === calendar.id && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                    </div>
                  )}
                </div>
                <div className="grid gap-1.5 leading-none flex-1">
                  <label
                    htmlFor={`calendar-${calendar.id}`}
                    className="text-sm font-medium text-gray-900 cursor-pointer"
                  >
                    {calendar.name}
                  </label>
                  {calendar.description && (
                    <p className="text-xs text-gray-500">
                      {calendar.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center p-4">
            <p className="text-xs text-gray-500">No calendars available</p>
          </div>
        )}
      </div>
    </div>
  );
}
