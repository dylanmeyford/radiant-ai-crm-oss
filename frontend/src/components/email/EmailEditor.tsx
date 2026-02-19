import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Send, Save, Clock, X } from 'lucide-react';
import TipTapEditor, { isHTML, plainTextToHTML } from '@/components/ui/TipTapEditor';
import { EmailField } from './EmailField';
import { FromField } from './FromField';
import { AttachmentManager } from './AttachmentManager';
import { useContactOperations } from '@/hooks/useContactOperations';
import { useNylasConnections } from '@/hooks/useNylasConnections';
import { useEmailSignature } from '@/hooks/useEmailSignature';
import { AttachmentMetadata } from '@/hooks/useEmailOperations';
import { updateSignature } from '@/lib/signatureUtils';

export interface EmailRecipient {
  email: string;
  name?: string;
  contactId?: string;
}

export interface EmailFromRecipient {
  email: string;
  connectionId: string;
  name?: string;
}

export interface EmailData {
  from?: EmailFromRecipient;
  to: EmailRecipient[];
  cc: EmailRecipient[];
  bcc: EmailRecipient[];
  subject: string;
  body: string;
  scheduledFor?: Date;
  attachments?: AttachmentMetadata[];
}

export interface EmailEditorProps {
  /** Initial email data */
  initialData?: Partial<EmailData>;
  /** Prospect ID to load contacts for */
  prospectId?: string;
  /** Opportunity ID for context */
  opportunityId?: string;
  /** Organization ID for attachments */
  organizationId?: string;
  /** Callback when email is sent */
  onSend?: (emailData: EmailData) => Promise<void>;
  /** Callback when email is saved as draft */
  onSaveDraft?: (emailData: EmailData) => Promise<void>;
  /** Callback when email is scheduled */
  onSchedule?: (emailData: EmailData, scheduledFor: Date) => Promise<void>;
  /** Callback when editor is closed */
  onClose?: () => void;
  /** Whether the editor is in modal mode */
  isModal?: boolean;
  /** Loading state */
  isLoading?: boolean;
  /** Error message */
  error?: string | null;
  /** Custom title */
  title?: string;
}

export const EmailEditor: React.FC<EmailEditorProps> = ({
  initialData = {},
  prospectId,
  organizationId,
  onSend,
  onSaveDraft,
  onSchedule,
  onClose,
  isModal = false,
  isLoading = false,
  error,
  title = "Compose Email",
}) => {
  // Process initial body content - convert plain text to HTML if needed
  const processInitialBody = (body: string | undefined) => {
    if (!body) return '';
    return isHTML(body) ? body : plainTextToHTML(body);
  };

  // Email data state
  const [emailData, setEmailData] = useState<EmailData>({
    from: initialData.from,
    to: initialData.to || [],
    cc: initialData.cc || [],
    bcc: initialData.bcc || [],
    subject: initialData.subject || '',
    body: processInitialBody(initialData.body),
    scheduledFor: initialData.scheduledFor,
    attachments: initialData.attachments || []
  });

  // UI state
  const [showCC, setShowCC] = useState(false);
  const [showBCC, setShowBCC] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingDeletions, setPendingDeletions] = useState<string[]>([]);

  // Contact operations
  const { useContactsByProspect } = useContactOperations();
  const contactsQuery = useContactsByProspect(prospectId || '');
  const contacts = contactsQuery.data || [];

  // Nylas connections
  const { connections, isLoading: isLoadingConnections } = useNylasConnections();

  // Email signature
  const { getEmailSignatureQuery } = useEmailSignature();
  const signatureQuery = getEmailSignatureQuery(emailData.from?.connectionId || null);
  const currentSignature = signatureQuery.data?.emailSignature || '';
  
  // Track the last applied signature to prevent infinite loops
  const lastAppliedSignatureRef = useRef<{ connectionId: string; signature: string } | null>(null);

  // Show CC/BCC if there's initial data
  useEffect(() => {
    if (initialData.cc && initialData.cc.length > 0) {
      setShowCC(true);
    }
    if (initialData.bcc && initialData.bcc.length > 0) {
      setShowBCC(true);
    }
  }, [initialData.cc, initialData.bcc]);

  // Handle signature updates when from address changes
  useEffect(() => {
    const connectionId = emailData.from?.connectionId;
    
    if (connectionId && currentSignature) {
      // Check if we've already applied this signature for this connection
      const lastApplied = lastAppliedSignatureRef.current;
      const shouldUpdate = !lastApplied || 
        lastApplied.connectionId !== connectionId || 
        lastApplied.signature !== currentSignature;
      
      if (shouldUpdate) {
        // Update the email body with the new signature
        setEmailData(prev => ({
          ...prev,
          body: updateSignature(prev.body, currentSignature, lastApplied?.signature)
        }));
        
        // Track that we've applied this signature
        lastAppliedSignatureRef.current = { connectionId, signature: currentSignature };
      }
    }
  }, [emailData.from?.connectionId, currentSignature]);

  // Update email field
  const updateField = useCallback((field: keyof EmailData, value: any) => {
    setEmailData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Reset signature tracking if body is manually changed
    if (field === 'body') {
      lastAppliedSignatureRef.current = null;
    }
    
    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const updated = { ...prev };
        delete updated[field];
        return updated;
      });
    }
  }, [validationErrors]);

  // Validate email data
  const validateEmail = useCallback((): boolean => {
    const errors: Record<string, string> = {};

    if (!emailData.from) {
      errors.from = 'Sender email address is required';
    }

    if (emailData.to.length === 0) {
      errors.to = 'At least one recipient is required';
    }

    if (!emailData.subject.trim()) {
      errors.subject = 'Subject is required';
    }

    if (!emailData.body.trim()) {
      errors.body = 'Email body is required';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [emailData]);

  // Handle send email
  const handleSend = async () => {
    if (!validateEmail()) return;
    
    setIsSending(true);
    try {
      await onSend?.(emailData);
    } catch (error) {
      console.error('Failed to send email:', error);
    } finally {
      setIsSending(false);
    }
  };

  // Handle save draft
  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    try {
      await onSaveDraft?.(emailData);
    } catch (error) {
      console.error('Failed to save draft:', error);
    } finally {
      setIsSavingDraft(false);
    }
  };

  

  return (
    <div className={`flex flex-col bg-white ${isModal ? 'h-full' : 'min-h-[600px]'}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 border-b border-red-200">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Email Form */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* From Field */}
          <FromField
            value={emailData.from}
            connections={connections}
            onChange={(from) => updateField('from', from)}
            disabled={isLoadingConnections}
            error={validationErrors.from}
            required
          />

          {/* To Field */}
          <EmailField
            label="To"
            recipients={emailData.to}
            contacts={contacts}
            onChange={(recipients) => updateField('to', recipients)}
            placeholder="Add recipients..."
            error={validationErrors.to}
            required
          />

          {/* CC/BCC Toggle Buttons */}
          <div className="flex gap-2">
            {!showCC && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCC(true)}
                className="text-xs px-2 py-1 h-auto"
              >
                Add CC
              </Button>
            )}
            {!showBCC && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowBCC(true)}
                className="text-xs px-2 py-1 h-auto"
              >
                Add BCC
              </Button>
            )}
          </div>

          {/* CC Field */}
          {showCC && (
            <EmailField
              label="CC"
              recipients={emailData.cc}
              contacts={contacts}
              onChange={(recipients) => updateField('cc', recipients)}
              placeholder="Add CC recipients..."
              onRemove={() => {
                setShowCC(false);
                updateField('cc', []);
              }}
            />
          )}

          {/* BCC Field */}
          {showBCC && (
            <EmailField
              label="BCC"
              recipients={emailData.bcc}
              contacts={contacts}
              onChange={(recipients) => updateField('bcc', recipients)}
              placeholder="Add BCC recipients..."
              onRemove={() => {
                setShowBCC(false);
                updateField('bcc', []);
              }}
            />
          )}

          <Separator />

          {/* Subject Field */}
          <div className="space-y-2">
            <Label htmlFor="subject" className="text-sm font-medium text-gray-900">
              Subject *
            </Label>
            <Input
              id="subject"
              value={emailData.subject}
              onChange={(e) => updateField('subject', e.target.value)}
              placeholder="Enter email subject..."
              className={validationErrors.subject ? 'border-red-300' : ''}
            />
            {validationErrors.subject && (
              <p className="text-xs text-red-600">{validationErrors.subject}</p>
            )}
          </div>

          {/* Email Body */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-900">
              Message *
            </Label>
            <div className={validationErrors.body ? 'ring-1 ring-red-300 rounded-md' : ''}>
              <TipTapEditor
                content={emailData.body}
                onChange={(html) => updateField('body', html)}
                placeholder="Compose your email..."
              />
            </div>
            {validationErrors.body && (
              <p className="text-xs text-red-600">{validationErrors.body}</p>
            )}
          </div>

          {/* Attachments */}
          {organizationId && (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-900">
                Attachments
              </Label>
              <AttachmentManager
                attachments={emailData.attachments || []}
                pendingFiles={pendingFiles}
                pendingDeletions={pendingDeletions}
                onAttachmentsChange={(attachments) => updateField('attachments', attachments)}
                onPendingFilesChange={setPendingFiles}
                organizationId={organizationId}
                disabled={isLoading || isSending || isSavingDraft}
                onMarkForDeletion={(attachmentId) => setPendingDeletions(prev => [...prev, attachmentId])}
              />
            </div>
          )}

          {/* Schedule Field */}
          {emailData.scheduledFor && (
            <div className="space-y-2">
              <Label htmlFor="scheduled" className="text-sm font-medium text-gray-900">
                Scheduled For
              </Label>
              <Input
                id="scheduled"
                type="datetime-local"
                value={emailData.scheduledFor.toISOString().slice(0, 16)}
                onChange={(e) => updateField('scheduledFor', new Date(e.target.value))}
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {onSaveDraft && (
                <Button
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={isSavingDraft || isLoading}
                  className="flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  {isSavingDraft ? 'Saving...' : 'Save Draft'}
                </Button>
              )}
              
              {onSchedule && (
                <Button
                  variant="outline"
                  onClick={() => updateField('scheduledFor', new Date())}
                  disabled={isLoading}
                  className="flex items-center gap-2"
                >
                  <Clock className="h-4 w-4" />
                  Schedule
                </Button>
              )}
            </div>

            <Button
              onClick={handleSend}
              disabled={isSending || isLoading}
              className="flex items-center gap-2 bg-gray-900 text-white hover:bg-gray-800"
            >
              <Send className="h-4 w-4" />
              {isSending ? 'Sending...' : 'Send'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailEditor;
