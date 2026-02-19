import { useState, useEffect } from "react";
import { usePageActions } from "@/context/PageActionsContext";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Key, Copy, Check, Code2, AlertCircle, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApiKeyOperations } from "@/hooks/useApiKeyOperations";

export default function DevelopersSettingsPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<{ name: string; key: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [updatingKeyId, setUpdatingKeyId] = useState<string | null>(null);
  const { setActions, clearActions } = usePageActions();

  const { 
    apiKeys, 
    isLoadingKeys, 
    isCreating, 
    createApiKey, 
    toggleApiKeyStatus 
  } = useApiKeyOperations();

  // Set page actions
  useEffect(() => {
    setActions([
      {
        id: 'create-api-key',
        label: 'Create API Key',
        icon: Plus,
        onClick: () => {
          setNewKeyName("");
          setShowCreateDialog(true);
        },
        variant: 'default'
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

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      setToastMessage({
        type: 'error',
        message: 'Please enter a name for the API key'
      });
      return;
    }

    const result = await createApiKey(newKeyName.trim());
    
    if (result.success && result.data) {
      setCreatedKey({
        name: result.data.data.name,
        key: result.data.apiKey
      });
      setNewKeyName("");
      setToastMessage({
        type: 'success',
        message: 'API key created successfully'
      });
    } else {
      setToastMessage({
        type: 'error',
        message: result.error || 'Failed to create API key'
      });
      setShowCreateDialog(false);
    }
  };

  const handleCopyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } catch (err) {
      setToastMessage({
        type: 'error',
        message: 'Failed to copy to clipboard'
      });
    }
  };

  const handleCloseCreatedDialog = () => {
    setCreatedKey(null);
    setShowCreateDialog(false);
    setCopiedKey(false);
  };

  const handleToggleStatus = async (keyId: string, currentStatus: boolean) => {
    setUpdatingKeyId(keyId);
    const result = await toggleApiKeyStatus(keyId, !currentStatus);
    
    if (result.success) {
      setToastMessage({
        type: 'success',
        message: `API key ${!currentStatus ? 'activated' : 'deactivated'} successfully`
      });
    } else {
      setToastMessage({
        type: 'error',
        message: result.error || 'Failed to update API key'
      });
    }
    
    setUpdatingKeyId(null);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const maskApiKey = (keyId: string) => {
    return `rk_••••••••${keyId.slice(-4)}`;
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
          {/* API Keys Management */}
          <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-gray-600" />
                <h3 className="text-sm font-medium text-gray-900">API Keys</h3>
              </div>
              <p className="text-xs text-gray-500 mt-1">Manage API keys for programmatic access to your organization's data</p>
            </div>
            <div className="p-4">
              {isLoadingKeys ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full rounded-md" />
                  <Skeleton className="h-16 w-full rounded-md" />
                </div>
              ) : apiKeys.length === 0 ? (
                <div className="text-center py-8">
                  <Key className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No API keys created yet</p>
                  <p className="text-xs text-gray-400 mt-1">Create your first API key to get started</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {apiKeys.map((key) => (
                    <div 
                      key={key._id}
                      className={`border border-gray-200 rounded-md p-3 transition-all duration-200 ${
                        updatingKeyId === key._id ? 'ring-2 ring-blue-200 bg-blue-50/30' : 'hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900">{key.name || 'Unnamed Key'}</p>
                            <Badge variant={key.isActive ? "default" : "secondary"} className="text-xs">
                              {key.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                            {updatingKeyId === key._id && (
                              <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1 font-mono">{maskApiKey(key._id)}</p>
                          <div className="flex items-center gap-3 mt-2">
                            <p className="text-xs text-gray-400">
                              Created: {formatDate(key.createdAt)}
                            </p>
                            {key.lastUsedAt && (
                              <p className="text-xs text-gray-400">
                                Last used: {formatDate(key.lastUsedAt)}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`active-${key._id}`} className="text-xs text-gray-600 cursor-pointer">
                            {key.isActive ? 'Active' : 'Inactive'}
                          </Label>
                          <Switch
                            id={`active-${key._id}`}
                            checked={key.isActive}
                            onCheckedChange={() => handleToggleStatus(key._id, key.isActive)}
                            disabled={updatingKeyId === key._id}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Webhook Documentation */}
          <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-gray-600" />
                <h3 className="text-sm font-medium text-gray-900">Webhook API</h3>
              </div>
              <p className="text-xs text-gray-500 mt-1">Programmatically send data to your CRM</p>
            </div>
            <div className="p-4 space-y-4">
              {/* Opportunities Webhook */}
              <Collapsible>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between p-3 rounded-md border border-gray-200 hover:border-gray-300 bg-white">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-gray-900">Create Opportunity</h4>
                      <span className="text-xs text-gray-500">POST /api/webhooks/opportunities</span>
                    </div>
                    <ChevronDown className="h-4 w-4 text-gray-600 transition-transform data-[state=open]:rotate-180" />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 space-y-4">
                  {/* Endpoint */}
                  <div>
                    <Label className="text-xs font-medium text-gray-700 mb-2 block">Endpoint</Label>
                    <div className="bg-gray-50 rounded-md p-3 border border-gray-200">
                      <code className="text-xs text-gray-900 font-mono">
                        POST /api/webhooks/opportunities
                      </code>
                    </div>
                  </div>
                  {/* Authentication */}
                  <div>
                    <Label className="text-xs font-medium text-gray-700 mb-2 block">Authentication</Label>
                    <div className="bg-gray-50 rounded-md p-3 border border-gray-200">
                      <code className="text-xs text-gray-900 font-mono">
                        Authorization: Bearer &lt;API_KEY&gt;
                      </code>
                    </div>
                  </div>
                  {/* Request Body */}
                  <div>
                    <Label className="text-xs font-medium text-gray-700 mb-2 block">Request Body</Label>
                    <div className="bg-gray-50 rounded-md p-3 border border-gray-200 overflow-x-auto">
                      <pre className="text-xs text-gray-900 font-mono whitespace-pre">
{`{
  "prospect": {
    "name": "Acme Inc",
    "domains": ["acme.com", "www.acme.io"]
  },
  "opportunity": {
    "name": "Acme - Enterprise Suite",
    "description": "Initial inbound",
    "amount": 25000,
    "stageId": "<stageId>",
    "stageName": "Qualification",
    "ownerId": "<userId>",
    "createdDate": "2025-10-24"
  }
}`}
                      </pre>
                    </div>
                    <div className="mt-2 flex items-start gap-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                      <AlertCircle className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-800">
                        <span className="font-medium">Note:</span> Provide either <code className="bg-blue-100 px-1 rounded">stageId</code> or <code className="bg-blue-100 px-1 rounded">stageName</code>. 
                        Prospects are created automatically if no existing prospect matches the provided domains.
                      </p>
                    </div>
                  </div>
                  {/* Example cURL */}
                  <div>
                    <Label className="text-xs font-medium text-gray-700 mb-2 block">Example Request</Label>
                    <div className="bg-gray-50 rounded-md p-3 border border-gray-200 overflow-x-auto">
                      <pre className="text-xs text-gray-900 font-mono whitespace-pre">
{`curl -X POST "$BASE_URL/api/webhooks/opportunities" \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prospect": {
      "name": "Acme Inc",
      "domains": ["acme.com"]
    },
    "opportunity": {
      "name": "Acme - Enterprise Suite",
      "description": "Initial inbound",
      "amount": 25000,
      "stageName": "Qualification",
      "ownerId": "<userId>",
      "createdDate": "2025-10-24"
    }
  }'`}
                      </pre>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Transcript Ingestion Webhook */}
              <Collapsible>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between p-3 rounded-md border border-gray-200 hover:border-gray-300 bg-white">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-gray-900">Ingest Meeting Transcript</h4>
                      <span className="text-xs text-gray-500">POST /api/webhooks/transcripts</span>
                    </div>
                    <ChevronDown className="h-4 w-4 text-gray-600 transition-transform data-[state=open]:rotate-180" />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 space-y-4">
                  {/* Endpoint */}
                  <div>
                    <Label className="text-xs font-medium text-gray-700 mb-2 block">Endpoint</Label>
                    <div className="bg-gray-50 rounded-md p-3 border border-gray-200">
                      <code className="text-xs text-gray-900 font-mono">
                        POST /api/webhooks/transcripts
                      </code>
                    </div>
                  </div>
                  {/* Authentication */}
                  <div>
                    <Label className="text-xs font-medium text-gray-700 mb-2 block">Authentication</Label>
                    <div className="bg-gray-50 rounded-md p-3 border border-gray-200">
                      <code className="text-xs text-gray-900 font-mono">
                        Authorization: Bearer &lt;API_KEY&gt;
                      </code>
                    </div>
                  </div>
                  {/* Request Body */}
                  <div>
                    <Label className="text-xs font-medium text-gray-700 mb-2 block">Request Body</Label>
                    <div className="bg-gray-50 rounded-md p-3 border border-gray-200 overflow-x-auto">
                      <pre className="text-xs text-gray-900 font-mono whitespace-pre">
{`{
  "title": "Weekly Sync",
  "startTime": "2025-11-12T09:00:00Z",
  "transcriptionText": "Raw transcript text or JSON/VTT content",
  "transcriptType": "krisp" // optional: json | krisp | granola | vtt | plain
}`}
                      </pre>
                    </div>
                    <div className="mt-2 flex items-start gap-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                      <AlertCircle className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-800">
                        <span className="font-medium">Behavior:</span> Matches an existing calendar activity by exact start time and case-insensitive title. 
                        Overwrites any existing transcript. Returns <code className="bg-blue-100 px-1 rounded">404</code> if no meeting matches.
                      </p>
                    </div>
                  </div>
                  {/* Example cURL */}
                  <div>
                    <Label className="text-xs font-medium text-gray-700 mb-2 block">Example Request</Label>
                    <div className="bg-gray-50 rounded-md p-3 border border-gray-200 overflow-x-auto">
                      <pre className="text-xs text-gray-900 font-mono whitespace-pre">
{`curl -X POST "$BASE_URL/api/webhooks/transcripts" \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Weekly Sync",
    "startTime": "2025-11-12T09:00:00Z",
    "transcriptionText": "...",
    "transcriptType": "krisp"
  }'`}
                      </pre>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        </div>
      </div>

      {/* Create API Key Dialog */}
      <Dialog open={showCreateDialog && !createdKey} onOpenChange={(open) => {
        if (!open) {
          setShowCreateDialog(false);
          setNewKeyName("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Create a new API key for programmatic access to your organization's data
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="key-name">Key Name</Label>
              <Input
                id="key-name"
                placeholder="e.g., Production Key, Development Key"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isCreating) {
                    handleCreateKey();
                  }
                }}
              />
              <p className="text-xs text-gray-500">
                A descriptive name to help you identify this key later
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowCreateDialog(false);
                setNewKeyName("");
              }}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateKey}
              disabled={isCreating || !newKeyName.trim()}
            >
              {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show Created API Key Dialog */}
      <Dialog open={!!createdKey} onOpenChange={(open) => {
        if (!open) handleCloseCreatedDialog();
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key Created</DialogTitle>
            <DialogDescription>
              Save this API key now. You won't be able to see it again!
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>API Key</Label>
              <div className="flex gap-2">
                <Input
                  value={createdKey?.key || ''}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => handleCopyKey(createdKey?.key || '')}
                >
                  {copiedKey ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
                <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  <span className="font-medium">Important:</span> Make sure to copy your API key now. 
                  You won't be able to see it again after closing this dialog.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCloseCreatedDialog}>
              {copiedKey ? 'Done' : 'I\'ve Saved My Key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

