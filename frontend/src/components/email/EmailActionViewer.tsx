import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, Edit, Send, Save, Clock, Paperclip, MoreHorizontal } from 'lucide-react';
import TipTapEditor, { isHTML, plainTextToHTML } from '@/components/ui/TipTapEditor';
import { EmailField } from './EmailField';
import { FromField } from './FromField';
import { AttachmentManager } from './AttachmentManager';
import { EmailRecipient, EmailData, EmailFromRecipient } from './EmailEditor';
import { ProposedAction } from '@/types/dashboard';
import { useContactOperations } from '@/hooks/useContactOperations';
import { useNylasConnections } from '@/hooks/useNylasConnections';
import { useEmailSignature } from '@/hooks/useEmailSignature';
import { updateSignature, stripSignature, hasSignature } from '@/lib/signatureUtils';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { 
  getBrowserTimezone, 
  getTimezoneOptions, 
  extractTimezoneFromDate,
  formatDateWithTimezone,
  formatDateForLocalInput,
  parseLocalDateTimeToTimezone
} from '@/lib/timezoneUtils';
// import { AttachmentMetadata } from '@/hooks/useEmailOperations';
import { useEmailOperations } from '@/hooks/useEmailOperations';

export interface EmailActionViewerProps {
  /** The email action to view/edit */
  action: ProposedAction;
  /** Callback when action data changes */
  onChange: (field: string, value: any) => void;
  /** Whether the component is in edit mode */
  isEditing?: boolean;
  /** Callback to toggle edit mode */
  onToggleEdit?: () => void;
  /** Whether the action is being saved */
  isSaving?: boolean;
  /** Opportunity ID for context */
  opportunityId?: string;
  /** Prospect ID to load contacts */
  prospectId?: string;
  /** Organization ID for attachments */
  organizationId?: string;
  /** Pending files to stage before upload */
  pendingFiles?: File[];
  /** Callback to update pending files */
  onPendingFilesChange?: (files: File[]) => void;
  /** Array of attachment IDs marked for deletion */
  pendingDeletions?: string[];
  /** Stage deletion of existing attachment by id */
  onMarkForDeletion?: (attachmentId: string) => void;
  /** Whether to show action buttons */
  showActions?: boolean;
  /** Custom action handlers */
  onSend?: (emailData: EmailData) => Promise<void>;
  onSaveDraft?: (emailData: EmailData) => Promise<void>;
  onSchedule?: (emailData: EmailData, scheduledFor: Date) => Promise<void>;
  /** Optional immediate deletion (not used in Today flow) */
  onDeleteAttachment?: (attachmentId: string) => Promise<{ success: boolean; error?: string }>;
  /** Callback when clicking reply-to message id to focus timeline */
  onReplyIdClick?: (replyMessageId: string) => void;
}

export const EmailActionViewer: React.FC<EmailActionViewerProps> = ({
  action,
  onChange,
  isEditing = false,
  onToggleEdit,
  isSaving = false,
  opportunityId,
  prospectId,
  organizationId,
  pendingFiles = [],
  onPendingFilesChange,
  pendingDeletions = [],
  onMarkForDeletion,
  showActions = true,
  onSend,
  onSaveDraft,
  onSchedule,
  onDeleteAttachment: _onDeleteAttachment, // Available for AttachmentManager usage
  onReplyIdClick,
}) => {
  // Contact operations
  const { useContactsByProspect } = useContactOperations();
  const contactsQuery = useContactsByProspect(prospectId || '');
  const contacts = contactsQuery.data || [];

  // Nylas connections
  const { connections, isLoading: isLoadingConnections } = useNylasConnections();

  // Local state for email data
  const [emailData, setEmailData] = useState<EmailData>({
    from: undefined,
    to: [],
    cc: [],
    bcc: [],
    subject: '',
    body: '',
    scheduledFor: undefined,
    attachments: []
  });

  // Email signature
  const { getEmailSignatureQuery } = useEmailSignature();
  const signatureQuery = getEmailSignatureQuery(emailData.from?.connectionId || null);
  const currentSignature = signatureQuery.data?.emailSignature || '';
  
  // Track the last applied signature to prevent infinite loops
  const lastAppliedSignatureRef = useRef<{ connectionId: string; signature: string } | null>(null);

  // Ref for the container to handle clicks outside
  const containerRef = useRef<HTMLDivElement>(null);

  // UI state
  const [showCC, setShowCC] = useState(false);
  const [showBCC, setShowBCC] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [editingField, setEditingField] = useState<string | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isSignatureExpanded, setIsSignatureExpanded] = useState(false);
  
  // Handle clicks outside the component to close edit mode
  useOnClickOutside(containerRef, (event) => {
    // Check if the click was inside a portal (dialog or popover or select content)
    const target = event.target as Element;
    if (
      target.closest('[role="dialog"]') ||
      target.closest('[data-radix-popper-content-wrapper]') ||
      target.closest('[data-slot="select-content"]')
    ) {
      return;
    }

    if (editingField) {
      setEditingField(null);
    }
  });
  
  // Timezone state
  const [selectedTimezone, setSelectedTimezone] = useState<string>(() => {
    // Default to browser timezone
    return getBrowserTimezone();
  });
  // Track the display time separately to maintain it when timezone changes
  const [displayDateTime, setDisplayDateTime] = useState<string>('');
  const timezoneOptions = getTimezoneOptions();
  const userTimezone = getBrowserTimezone(); // Always show "Will be sent" in user's local timezone

  // Reply-to message id if present on action details
  const replyToMessageId: string | undefined = (action as any)?.details?.replyToMessageId
    || (action as any)?.details?.inReplyToMessageId
    || (action as any)?.details?.replyId;

  // Load email activities in context to resolve subject for replyToMessageId
  const emailOps = useEmailOperations(
    opportunityId
      ? { entityType: 'opportunity', entityId: opportunityId }
      : (prospectId ? { entityType: 'prospect', entityId: prospectId } : undefined)
  );
  const replyEmailSubject = useMemo(() => {
    if (!replyToMessageId) return null;
    const list = (emailOps?.emailActivities as any[]) || [];
    const match = list.find((e) => e.messageId === replyToMessageId || e._id === replyToMessageId);
    return match?.subject || null;
  }, [replyToMessageId, emailOps?.emailActivities]);

  // Convert action details to email data
  const actionToEmailData = useCallback((actionDetails: any): EmailData => {
    const convertToRecipients = (emails: string[] | string | undefined): EmailRecipient[] => {
      if (!emails) return [];
      const emailArray = Array.isArray(emails) ? emails : [emails];
      return emailArray
        .filter(email => email && email.trim())
        .map(email => {
          const trimmedEmail = email.trim();
          // Try to find matching contact
          const matchingContact = contacts.find((contact: any) => 
            contact.emails.some((e: any) => e.address.toLowerCase() === trimmedEmail.toLowerCase())
          );
          
          if (matchingContact) {
            return {
              email: trimmedEmail,
              name: `${matchingContact.firstName} ${matchingContact.lastName}`.trim(),
              contactId: matchingContact._id
            };
          }
          
          return {
            email: trimmedEmail,
            name: trimmedEmail
          };
        });
    };

    // Convert from field if available
    const convertFromField = (fromData: any): EmailFromRecipient | undefined => {
      if (!fromData) return undefined;
      
      if (typeof fromData === 'string') {
        // If it's just an email string, try to find matching connection
        const matchingConnection = connections.find(conn => 
          conn.email.toLowerCase() === fromData.toLowerCase()
        );
        
        if (matchingConnection) {
          return {
            email: matchingConnection.email,
            connectionId: matchingConnection._id,
            name: matchingConnection.email
          };
        }
        
        return undefined; // No matching connection found
      }
      
      // If it's already an object with connectionId
      if (fromData.connectionId) {
        return fromData as EmailFromRecipient;
      }
      
      return undefined;
    };

    // Process body content - convert plain text to HTML if needed
    const bodyContent = actionDetails?.body || '';
    const processedBody = bodyContent ? (isHTML(bodyContent) ? bodyContent : plainTextToHTML(bodyContent)) : '';

    return {
      from: convertFromField(actionDetails?.from),
      to: convertToRecipients(actionDetails?.to),
      cc: convertToRecipients(actionDetails?.cc),
      bcc: convertToRecipients(actionDetails?.bcc),
      subject: actionDetails?.subject || '',
      body: processedBody,
      scheduledFor: actionDetails?.scheduledFor ? new Date(actionDetails.scheduledFor) : undefined,
      attachments: actionDetails?.attachments || []
    };
  }, [contacts, connections]);

  // Convert email data to action details format
  const emailDataToActionDetails = useCallback((data: EmailData) => {
    return {
      from: data.from,
      to: data.to.map(r => r.email),
      cc: data.cc.map(r => r.email),
      bcc: data.bcc.map(r => r.email),
      subject: data.subject,
      body: data.body,
      scheduledFor: data.scheduledFor?.toISOString(),
      timezone: selectedTimezone, // Store the selected timezone
      attachments: data.attachments || []
    };
  }, [selectedTimezone]);

  // Initialize email data when action changes
  useEffect(() => {
    if (action?.details) {
      const newEmailData = actionToEmailData(action.details);
      setEmailData(newEmailData);
      
      // Show CC/BCC if they have data
      setShowCC(newEmailData.cc.length > 0);
      setShowBCC(newEmailData.bcc.length > 0);
      
      // Initialize timezone from scheduled date or use browser timezone
      if (newEmailData.scheduledFor) {
        // Check if we have stored timezone info in the action details
        const storedTimezone = action.details?.timezone;
        const detectedTimezone = extractTimezoneFromDate(newEmailData.scheduledFor, storedTimezone);
        setSelectedTimezone(detectedTimezone);
        
        // Set the display datetime to show the time in the detected timezone
        const displayTime = formatDateForLocalInput(newEmailData.scheduledFor, detectedTimezone);
        setDisplayDateTime(displayTime);
      } else {
        setSelectedTimezone(getBrowserTimezone());
        setDisplayDateTime('');
      }
      
      // Reset signature tracking when action changes
      lastAppliedSignatureRef.current = null;
      
      // Clear validation errors on action change
      setValidationErrors({});
      
      // Reset editing field when action changes
      setEditingField(null);
    }
  }, [
    // Primary identifiers - include both _id and id for sub-actions
    action?._id,
    (action as any)?.id,
    (action as any)?.isSubAction,
    (action as any)?.parentAction?._id,
    // Only depend on contacts/connections length to avoid excessive rerenders
    contacts.length,
    connections.length,
    // Use a more stable dependency for attachments
    action?.details?.attachments?.length || 0
  ]);

  // Handle signature updates when from address changes
  useEffect(() => {
    const connectionId = emailData.from?.connectionId;
    
    if (connectionId && currentSignature && isEditing) {
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
  }, [emailData.from?.connectionId, currentSignature, isEditing]);

  // Reset editing field when isEditing changes
  useEffect(() => {
    if (!isEditing) {
      setEditingField(null);
    }
  }, [isEditing]);

  // Reset signature expansion when editing the body
  useEffect(() => {
    if (isEditing && editingField === 'body') {
      setIsSignatureExpanded(false);
    }
  }, [isEditing, editingField]);

  // Update field in email data and notify parent
  const updateField = useCallback((field: keyof EmailData, value: any) => {
    setEmailData(prev => {
      const updatedEmailData = {
        ...prev,
        [field]: value
      };
      
      // Reset signature tracking if body is manually changed
      if (field === 'body') {
        lastAppliedSignatureRef.current = null;
      }
      
      // Convert back to action format and notify parent
      const actionDetails = emailDataToActionDetails(updatedEmailData);
      Object.keys(actionDetails).forEach(key => {
        onChange(key, actionDetails[key as keyof typeof actionDetails]);
      });
      
      return updatedEmailData;
    });
    
    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const updated = { ...prev };
        delete updated[field];
        return updated;
      });
    }
  }, [emailDataToActionDetails, onChange, validationErrors]);

  // Handle timezone change
  const handleTimezoneChange = useCallback((newTimezone: string) => {
    setSelectedTimezone(newTimezone);
    
    // If we have a display time, keep it the same but update the actual scheduled date
    // Example: Display stays "9:00 AM" but timezone changes from Sydney to London
    if (displayDateTime) {
      try {
        // Parse the display time as if it were in the new timezone
        const newDate = parseLocalDateTimeToTimezone(displayDateTime, newTimezone);
        updateField('scheduledFor', newDate);
      } catch (error) {
        console.error('Error converting timezone:', error);
        // If conversion fails, keep the current date
      }
    }
  }, [displayDateTime, updateField]);

  // Handle datetime input change
  const handleDateTimeChange = useCallback((dateTimeValue: string) => {
    // Update the display time state
    setDisplayDateTime(dateTimeValue);
    
    if (!dateTimeValue) {
      updateField('scheduledFor', undefined);
      setDisplayDateTime('');
      return;
    }
    
    try {
      // Parse the local datetime input value in the selected timezone
      const newDate = parseLocalDateTimeToTimezone(dateTimeValue, selectedTimezone);
      updateField('scheduledFor', newDate);
    } catch (error) {
      console.error('Error parsing datetime:', error);
      // Fallback to basic Date parsing
      updateField('scheduledFor', new Date(dateTimeValue));
    }
  }, [selectedTimezone, updateField]);

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

  // Handle email actions
  const handleSend = async () => {
    if (!validateEmail()) return;
    await onSend?.(emailData);
  };

  const handleSaveDraft = async () => {
    await onSaveDraft?.(emailData);
  };

  // Handle schedule email - currently unused but may be needed later
  // const handleSchedule = async () => {
  //   if (!validateEmail() || !emailData.scheduledFor) return;
  //   await onSchedule?.(emailData, emailData.scheduledFor);
  // };

  return (
    <div ref={containerRef} className="bg-white rounded-lg border border-gray-200">
      {/* Edit/View Toggle */}
      {onToggleEdit && showActions && (
        <div className="px-4 pt-4 pb-2 border-b border-gray-100">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleEdit}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            {isEditing ? (
              <>
                <Eye className="h-4 w-4" />
                Preview
              </>
            ) : (
              <>
                <Edit className="h-4 w-4" />
                Edit
              </>
            )}
          </Button>
        </div>
      )}

      {/* Email Header Section - Inline Labels */}
      <div className="p-4 space-y-1">
        {/* From Field */}
        <div 
          className="flex items-start gap-3 group cursor-pointer hover:bg-gray-50 -mx-2 px-2 py-1 rounded transition-colors"
          onClick={() => isEditing && setEditingField('from')}
        >
          <Label className="text-sm text-gray-600 w-16 flex-shrink-0 pt-2">
            From
          </Label>
          <div className="flex-1 min-w-0">
            {isEditing && editingField === 'from' ? (
              <div 
                onBlur={(e) => {
                  // Don't blur if clicking within the popover content
                  const currentTarget = e.currentTarget;
                  const relatedTarget = e.relatedTarget as HTMLElement;
                  
                  // Check if the related target is within a popover
                  if (relatedTarget && (
                    relatedTarget.closest('[role="dialog"]') ||
                    relatedTarget.closest('[data-radix-popper-content-wrapper]')
                  )) {
                    return;
                  }
                  
                  // Use setTimeout to ensure click events are processed first
                  setTimeout(() => {
                    if (!currentTarget.contains(document.activeElement)) {
                      setEditingField(null);
                    }
                  }, 0);
                }}
              >
                <FromField
                  value={emailData.from}
                  connections={connections}
                  onChange={(from) => updateField('from', from)}
                  disabled={isLoadingConnections}
                  error={validationErrors.from}
                  required
                  showLabel={false}
                />
              </div>
            ) : emailData.from ? (
              <div className="text-sm text-gray-900 pt-2">
                {emailData.from.name || emailData.from.email}
              </div>
            ) : (
              <div className="text-sm text-gray-400 italic pt-2">Click to set sender</div>
            )}
          </div>
        </div>

        {/* To Field */}
        <div 
          className="flex items-start gap-3 group cursor-pointer hover:bg-gray-50 -mx-2 px-2 py-1 rounded transition-colors"
          onClick={() => isEditing && setEditingField('to')}
        >
          <Label className="text-sm text-gray-600 w-16 flex-shrink-0 pt-2">
            To
          </Label>
          <div className="flex-1 min-w-0">
              {isEditing && editingField === 'to' ? (
              <div 
                onBlur={(e) => {
                  // Don't blur if clicking within the popover content
                  const currentTarget = e.currentTarget;
                  const relatedTarget = e.relatedTarget as HTMLElement;
                  
                  // Check if the related target is within a popover
                  if (relatedTarget && (
                    relatedTarget.closest('[role="dialog"]') ||
                    relatedTarget.closest('[data-radix-popper-content-wrapper]')
                  )) {
                    return;
                  }
                  
                  // Use setTimeout to ensure click events are processed first
                  setTimeout(() => {
                    if (!currentTarget.contains(document.activeElement)) {
                      setEditingField(null);
                    }
                  }, 0);
                }}
              >
                <EmailField
                  label=""
                  recipients={emailData.to}
                  contacts={contacts}
                  onChange={(recipients) => updateField('to', recipients)}
                  placeholder="Add recipients..."
                  error={validationErrors.to}
                  required
                />
              </div>
            ) : (
              <div className="flex flex-wrap gap-1 pt-1">
                {emailData.to.length > 0 ? (
                  emailData.to.map((recipient, index) => (
                    <Badge key={`to-${index}`} variant="secondary" className="text-xs">
                      {recipient.name !== recipient.email ? recipient.name : recipient.email}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-gray-400 italic pt-1">Click to add recipients</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* CC Field */}
        {(showCC || emailData.cc.length > 0 || (isEditing && editingField === 'cc')) && (
          <div 
            className="flex items-start gap-3 group cursor-pointer hover:bg-gray-50 -mx-2 px-2 py-1 rounded transition-colors"
            onClick={() => isEditing && setEditingField('cc')}
          >
            <Label className="text-sm text-gray-600 w-16 flex-shrink-0 pt-2">
              CC
            </Label>
            <div className="flex-1 min-w-0">
              {isEditing && editingField === 'cc' ? (
                <div 
                  onBlur={(e) => {
                    // Don't blur if clicking within the popover content
                    const currentTarget = e.currentTarget;
                    const relatedTarget = e.relatedTarget as HTMLElement;
                    
                    // Check if the related target is within a popover
                    if (relatedTarget && (
                      relatedTarget.closest('[role="dialog"]') ||
                      relatedTarget.closest('[data-radix-popper-content-wrapper]')
                    )) {
                      return;
                    }
                    
                    // Use setTimeout to ensure click events are processed first
                    setTimeout(() => {
                      if (!currentTarget.contains(document.activeElement)) {
                        setEditingField(null);
                      }
                    }, 0);
                  }}
                >
                  <EmailField
                    label=""
                    recipients={emailData.cc}
                    contacts={contacts}
                    onChange={(recipients) => updateField('cc', recipients)}
                    placeholder="Add CC recipients..."
                    onRemove={() => {
                      setShowCC(false);
                      setEditingField(null);
                      updateField('cc', []);
                    }}
                  />
                </div>
              ) : emailData.cc.length > 0 ? (
                <div className="flex flex-wrap gap-1 pt-1">
                  {emailData.cc.map((recipient, index) => (
                    <Badge key={`cc-${index}`} variant="secondary" className="text-xs">
                      {recipient.name !== recipient.email ? recipient.name : recipient.email}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* BCC Field */}
        {(showBCC || emailData.bcc.length > 0 || (isEditing && editingField === 'bcc')) && (
          <div 
            className="flex items-start gap-3 group cursor-pointer hover:bg-gray-50 -mx-2 px-2 py-1 rounded transition-colors"
            onClick={() => isEditing && setEditingField('bcc')}
          >
            <Label className="text-sm text-gray-600 w-16 flex-shrink-0 pt-2">
              BCC
            </Label>
            <div className="flex-1 min-w-0">
              {isEditing && editingField === 'bcc' ? (
                <div 
                  onBlur={(e) => {
                    // Don't blur if clicking within the popover content
                    const currentTarget = e.currentTarget;
                    const relatedTarget = e.relatedTarget as HTMLElement;
                    
                    // Check if the related target is within a popover
                    if (relatedTarget && (
                      relatedTarget.closest('[role="dialog"]') ||
                      relatedTarget.closest('[data-radix-popper-content-wrapper]')
                    )) {
                      return;
                    }
                    
                    // Use setTimeout to ensure click events are processed first
                    setTimeout(() => {
                      if (!currentTarget.contains(document.activeElement)) {
                        setEditingField(null);
                      }
                    }, 0);
                  }}
                >
                  <EmailField
                    label=""
                    recipients={emailData.bcc}
                    contacts={contacts}
                    onChange={(recipients) => updateField('bcc', recipients)}
                    placeholder="Add BCC recipients..."
                    onRemove={() => {
                      setShowBCC(false);
                      setEditingField(null);
                      updateField('bcc', []);
                    }}
                  />
                </div>
              ) : emailData.bcc.length > 0 ? (
                <div className="flex flex-wrap gap-1 pt-1">
                  {emailData.bcc.map((recipient, index) => (
                    <Badge key={`bcc-${index}`} variant="secondary" className="text-xs">
                      {recipient.name !== recipient.email ? recipient.name : recipient.email}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* CC/BCC Toggle Buttons - Only show when actively editing a field */}
        {isEditing && editingField && (!showCC || !showBCC) && editingField !== 'cc' && editingField !== 'bcc' && (
          <div className="flex items-start gap-3">
            <div className="w-16 flex-shrink-0" />
            <div className="flex gap-2">
              {!showCC && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCC(true);
                    setEditingField('cc');
                  }}
                  className="text-xs px-2 py-1 h-auto text-gray-600 hover:text-gray-900"
                >
                  Add CC
                </Button>
              )}
              {!showBCC && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowBCC(true);
                    setEditingField('bcc');
                  }}
                  className="text-xs px-2 py-1 h-auto text-gray-600 hover:text-gray-900"
                >
                  Add BCC
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Subject Section */}
      <div 
        className="px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => isEditing && setEditingField('subject')}
      >
        {isEditing && editingField === 'subject' ? (
          <div className="space-y-1" onBlur={() => setEditingField(null)}>
            <Input
              value={emailData.subject}
              onChange={(e) => updateField('subject', e.target.value)}
              placeholder="Subject"
              autoFocus
              className={`text-sm font-medium border-0 px-0 focus-visible:ring-0 focus-visible:ring-offset-0 ${
                validationErrors.subject ? 'text-red-600' : ''
              }`}
            />
            {validationErrors.subject && (
              <p className="text-xs text-red-600">{validationErrors.subject}</p>
            )}
          </div>
        ) : (
          <div className="text-sm font-medium text-gray-900">
            {emailData.subject || <span className="text-gray-400 italic">Click to add subject</span>}
          </div>
        )}
      </div>

      <Separator />

      {/* Email Body Section with Drag and Drop */}
      <div 
        className={`px-4 py-4 cursor-pointer hover:bg-gray-50 transition-colors relative ${
          isDraggingFiles ? 'ring-2 ring-blue-400 bg-blue-50' : ''
        }`}
        onClick={() => isEditing && editingField !== 'body' && setEditingField('body')}
      >
        {isDraggingFiles && (
          <div className="absolute inset-0 flex items-center justify-center bg-blue-50 bg-opacity-90 z-10 pointer-events-none">
            <div className="text-center">
              <Paperclip className="h-8 w-8 text-blue-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-blue-700">Drop files to attach</p>
            </div>
          </div>
        )}
        {isEditing && editingField === 'body' ? (
          <div className={validationErrors.body ? 'ring-1 ring-red-300 rounded-md' : ''}>
            <TipTapEditor
              content={emailData.body}
              onChange={(html) => updateField('body', html)}
              placeholder="Compose your email..."
            />
            {validationErrors.body && (
              <p className="text-xs text-red-600 mt-1">{validationErrors.body}</p>
            )}
          </div>
        ) : (
          <div className="min-h-[100px]">
            {emailData.body ? (
              <>
                {(() => {
                  // Check if body has a signature
                  const bodyHasSignature = hasSignature(emailData.body, currentSignature);
                  const displayBody = !isSignatureExpanded && bodyHasSignature
                    ? stripSignature(emailData.body, currentSignature)
                    : emailData.body;
                  
                  return (
                    <>
                      <div 
                        className="text-sm text-gray-900 [&_p]:mb-3 [&_ul]:ml-4 [&_ul]:list-disc [&_ol]:ml-4 [&_ol]:list-decimal [&_a]:text-blue-600 [&_a]:underline [&_strong]:font-semibold [&_em]:italic [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-bold [&_h3]:mb-2 [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_pre]:bg-gray-100 [&_pre]:p-2 [&_pre]:rounded [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded"
                        dangerouslySetInnerHTML={{ __html: displayBody }}
                      />
                      {bodyHasSignature && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsSignatureExpanded(!isSignatureExpanded);
                          }}
                          className="inline-flex items-center gap-1 mt-2 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                          aria-label={isSignatureExpanded ? "Collapse signature" : "Expand signature"}
                        >
                          <MoreHorizontal className="h-3 w-3" />
                          {isSignatureExpanded ? '' : ''}
                        </button>
                      )}
                    </>
                  );
                })()}
              </>
            ) : (
              <span className="text-gray-400 italic">Click to compose message</span>
            )}
          </div>
        )}
      </div>

      {/* When and Attachments Row - at bottom */}
      {(emailData.scheduledFor || (isEditing && editingField === 'when') || isEditing || (emailData.attachments?.length ?? 0) > 0 || pendingFiles.length > 0) && (
        <>
          <Separator />
          <div className="px-4 py-3">
            <div className="flex items-center gap-3">
              {/* When Field */}
              <div className="flex items-center gap-3 flex-1">
                <Label className="text-sm text-gray-600 w-16 flex-shrink-0">
                  When
                </Label>
                <div 
                  className="flex-1 min-w-0 cursor-pointer hover:bg-gray-50 -mx-2 px-2 py-1 rounded transition-colors"
                  onClick={() => isEditing && setEditingField('when')}
                >
                  {isEditing && editingField === 'when' ? (
                    <div 
                      onBlur={(e) => {
                        // Don't blur if clicking within the popover content
                        const currentTarget = e.currentTarget;
                        const relatedTarget = e.relatedTarget as HTMLElement;
                        
                        // Check if the related target is within a popover
                        if (relatedTarget && (
                          relatedTarget.closest('[role="dialog"]') ||
                          relatedTarget.closest('[data-radix-popper-content-wrapper]')
                        )) {
                          return;
                        }
                        
                        // Use setTimeout to ensure click events are processed first
                        setTimeout(() => {
                          if (!currentTarget.contains(document.activeElement)) {
                            setEditingField(null);
                          }
                        }, 0);
                      }}
                    >
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input
                            type="datetime-local"
                            value={displayDateTime}
                            onChange={(e) => handleDateTimeChange(e.target.value)}
                            className="flex-1"
                            placeholder="Select date and time"
                          />
                          <Select value={selectedTimezone} onValueChange={handleTimezoneChange}>
                            <SelectTrigger className="w-48">
                              <SelectValue placeholder="Timezone" />
                            </SelectTrigger>
                            <SelectContent>
                              {timezoneOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {emailData.scheduledFor && (
                          <div className="text-xs text-gray-500">
                            {emailData.scheduledFor.getTime() < Date.now()
                              ? 'Will be sent straight away - date in past'
                              : `Will be sent: ${formatDateWithTimezone(emailData.scheduledFor, userTimezone)}`}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : emailData.scheduledFor ? (
                    <div className="text-sm text-gray-900">
                      {formatDateWithTimezone(emailData.scheduledFor, selectedTimezone)}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400 italic">Click to schedule</div>
                  )}
                </div>
              </div>

              {/* Attachment Icon Button */}
              {organizationId && isEditing && (
                <div className="flex items-center">
                  <AttachmentManager
                    attachments={emailData.attachments || []}
                    pendingFiles={pendingFiles}
                    pendingDeletions={pendingDeletions}
                    onAttachmentsChange={(attachments) => updateField('attachments', attachments)}
                    onPendingFilesChange={(files) => onPendingFilesChange?.(files)}
                    organizationId={organizationId}
                    onMarkForDeletion={(id) => onMarkForDeletion?.(id)}
                    disabled={isSaving}
                    compact={true}
                    onDragActive={setIsDraggingFiles}
                  />
                </div>
              )}
            </div>

            {/* Attachments List - full width below */}
            {organizationId && ((emailData.attachments?.length ?? 0) > 0 || pendingFiles.length > 0) && !isEditing && (
              <div className="mt-3">
                <AttachmentManager
                  attachments={emailData.attachments || []}
                  pendingFiles={[]}
                  pendingDeletions={pendingDeletions}
                  onAttachmentsChange={(attachments) => updateField('attachments', attachments)}
                  onPendingFilesChange={() => {}}
                  organizationId={organizationId}
                  onMarkForDeletion={(id) => onMarkForDeletion?.(id)}
                  disabled={true}
                  compact={true}
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* Reply-to footer - bottom left of the email box */}
      {replyToMessageId && (
        <div className="px-4 pb-3 pt-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onReplyIdClick?.(replyToMessageId);
            }}
            className="text-xs text-gray-500 hover:text-gray-900 hover:underline"
            aria-label="Show replied-to email in timeline"
          >
            In reply to: {replyEmailSubject || replyToMessageId}
          </button>
        </div>
      )}

      {/* Action Buttons */}
      {isEditing && showActions && (onSend || onSaveDraft || onSchedule) && (
        <>
          <Separator />
          <div className="px-4 py-3 flex items-center justify-between bg-gray-50">
            <div className="flex gap-2">
              {onSaveDraft && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSaveDraft}
                  disabled={isSaving}
                  className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? 'Saving...' : 'Save Draft'}
                </Button>
              )}
              
              {onSchedule && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => updateField('scheduledFor', new Date())}
                  className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
                >
                  <Clock className="h-4 w-4" />
                  Schedule
                </Button>
              )}
            </div>

            {onSend && (
              <Button
                onClick={handleSend}
                disabled={isSaving}
                size="sm"
                className="flex items-center gap-2 bg-gray-900 text-white hover:bg-gray-800"
              >
                <Send className="h-4 w-4" />
                Send
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default EmailActionViewer;
