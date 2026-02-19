import { useState, useEffect } from "react";
import { usePageActions } from "@/context/PageActionsContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Save, FileText, Eye, EyeOff, Mail, Wifi, WifiOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNylasConnections } from "@/hooks/useNylasConnections";
import { useEmailSignature } from "@/hooks/useEmailSignature";
import TipTapEditor from "@/components/ui/TipTapEditor";

// Custom styles for signature editor
const signatureEditorStyles = `
  .signature-editor .tiptap-content {
    min-height: 120px !important;
    max-height: 200px !important;
  }
`;

export default function SignaturePage() {
  const [signature, setSignature] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const { setActions, clearActions } = usePageActions();

  // Get Nylas connections
  const { connections, isLoading: isLoadingConnections } = useNylasConnections();
  
  // Get email signature hooks
  const { getEmailSignatureQuery, updateSignature, isUpdating } = useEmailSignature();
  
  // Get signature data for selected connection
  const signatureQuery = getEmailSignatureQuery(selectedConnectionId);
  const signatureData = signatureQuery.data;

  // Set page actions
  useEffect(() => {
    setActions([
      {
        id: 'save-signature',
        label: 'Save',
        icon: Save,
        onClick: handleSaveSignature,
        variant: 'default',
        disabled: isUpdating || !selectedConnectionId
      },
      {
        id: 'toggle-preview',
        label: showPreview ? 'Hide Preview' : 'Show Preview',
        icon: showPreview ? EyeOff : Eye,
        onClick: () => setShowPreview(!showPreview),
        variant: 'outline'
      }
    ]);

    return () => {
      clearActions();
    };
  }, [setActions, clearActions, isUpdating, showPreview, selectedConnectionId]);

  // Auto-hide toast after 5 seconds
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Auto-select first connection if available and none selected
  useEffect(() => {
    if (connections.length > 0 && !selectedConnectionId) {
      setSelectedConnectionId(connections[0]._id);
    }
  }, [connections, selectedConnectionId]);

  // Update signature when signature data changes
  useEffect(() => {
    if (signatureData) {
      // If the signature is plain text, convert it to HTML
      const signatureContent = signatureData.emailSignature || '';
      if (signatureContent && !signatureContent.includes('<')) {
        // Plain text - convert to HTML with line breaks
        const htmlSignature = signatureContent.replace(/\n/g, '<br>');
        setSignature(`<p>${htmlSignature}</p>`);
      } else {
        setSignature(signatureContent);
      }
    } else if (selectedConnectionId && !signatureQuery.isLoading) {
      // Reset signature if no data found for selected connection
      setSignature('');
    }
  }, [signatureData, selectedConnectionId, signatureQuery.isLoading]);

  // Handle connection selection
  const handleConnectionSelect = (connectionId: string) => {
    setSelectedConnectionId(connectionId);
    setSignature(''); // Reset signature while loading
  };

  const handleSaveSignature = async () => {
    if (!selectedConnectionId) {
      setToastMessage({
        type: 'error',
        message: 'Please select a connection first.'
      });
      return;
    }

    try {
      const result = await updateSignature(selectedConnectionId, signature);
      
      if (result.success) {
        setToastMessage({
          type: 'success',
          message: 'Email signature saved successfully!'
        });
      } else {
        setToastMessage({
          type: 'error',
          message: result.error || 'Failed to save signature. Please try again.'
        });
      }
    } catch (error) {
      setToastMessage({
        type: 'error',
        message: 'Failed to save signature. Please try again.'
      });
    }
  };



  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Custom styles for signature editor */}
      <style dangerouslySetInnerHTML={{ __html: signatureEditorStyles }} />
      
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
          {/* Connection Selection */}
          <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-gray-600" />
                <h3 className="text-sm font-medium text-gray-900">Email Account</h3>
              </div>
              <p className="text-xs text-gray-500 mt-1">Select the email account to configure signature for</p>
            </div>
            <div className="p-4">
              {isLoadingConnections ? (
                <Skeleton className="h-10 w-full rounded-md" />
              ) : connections.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                  <Mail className="h-8 w-8 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-500 mb-2">No connected accounts</p>
                  <p className="text-xs text-gray-400">Connect an email account in Settings &gt; Accounts to manage signatures</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <Label htmlFor="connection-select" className="text-sm font-medium text-gray-900">
                    Connected Account
                  </Label>
                  <Select value={selectedConnectionId || ''} onValueChange={handleConnectionSelect}>
                    <SelectTrigger className="py-5">
                      <SelectValue placeholder="Select an email account" />
                    </SelectTrigger>
                    <SelectContent>
                      {connections.map((connection) => (
                        <SelectItem key={connection._id} value={connection._id}>
                          <div className="flex items-center gap-3">
                            <div className={`p-1 rounded-sm ${connection.syncStatus === 'active' ? 'bg-green-50' : 'bg-red-50'}`}>
                              {connection.syncStatus === 'active' ? (
                                <Wifi className="h-3 w-3 text-green-600" />
                              ) : (
                                <WifiOff className="h-3 w-3 text-red-600" />
                              )}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">{connection.email}</span>
                              <span className="text-xs text-gray-500">{connection.provider}</span>
                            </div>
                            <Badge className={`ml-auto px-2 py-1 text-xs font-medium rounded-md ${
                              connection.syncStatus === 'active' 
                                ? 'bg-green-50 text-green-700 border-green-200' 
                                : 'bg-red-50 text-red-700 border-red-200'
                            }`}>
                              {connection.syncStatus}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          {/* Email Signature Settings */}
          {selectedConnectionId && (
            <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-gray-600" />
                  <h3 className="text-sm font-medium text-gray-900">Email Signature</h3>
                </div>
                <p className="text-xs text-gray-500 mt-1">Customize the signature that appears at the end of your emails</p>
              </div>
              <div className="p-4">
                {signatureQuery.isLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-32 w-full rounded-md" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Signature Editor */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-900">
                        Signature
                      </Label>
                      <div className="border border-gray-200 rounded-md signature-editor">
                        <TipTapEditor
                          content={signature}
                          onChange={(html) => setSignature(html)}
                          editable={true}
                        />
                      </div>
                      <p className="text-xs text-gray-500">
                        Create a rich HTML signature for emails sent from {signatureData?.email || 'this account'}
                      </p>
                    </div>

                    {/* Preview Section */}
                    {showPreview && signature.trim() && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-gray-900">
                          Preview
                        </Label>
                        <div className="p-4 border border-gray-200 rounded-md bg-gray-50/30">
                          <div 
                            className="prose prose-sm max-w-none text-sm text-gray-900"
                            dangerouslySetInnerHTML={{ __html: signature }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Save Button */}
                    <div className="flex justify-end pt-2">
                      <Button 
                        onClick={handleSaveSignature} 
                        disabled={isUpdating}
                        className="bg-gray-900 text-white hover:bg-gray-800 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200"
                      >
                        {isUpdating ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="mr-2 h-4 w-4" />
                            Save Signature
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
