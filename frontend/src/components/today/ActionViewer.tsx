import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Mail,
  Phone,
  Calendar,
  CheckSquare,
  MessageSquare,
  Search,
  Clock,
  Save,
  Check,
  Loader2,
  MapPin,
  Users,
  ExternalLink,
  CheckCircle,
  XCircle,
  AlertCircle,
  MinusCircle,
  ArrowUpDown,
  PlusCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import TipTapEditor, { isHTML, plainTextToHTML } from '@/components/ui/TipTapEditor';
import { EmailActionViewer } from '@/components/email/EmailActionViewer';
import MeetingActionViewer from '@/components/meeting/MeetingActionViewer';
import { useActionOperations } from '@/hooks/useActionOperations';
import { useEmailOperations, AttachmentMetadata } from '@/hooks/useEmailOperations';
import { useQueryClient } from '@tanstack/react-query';
import { parseReasoningText } from '@/lib/parseReasoningText';
import { useAuth } from '@/context/AuthContext';
import { ActivityTimelineSection } from '@/components/opportunities/ActivityTimelineSection';
import { MinedDealViewer } from './MinedDealViewer';
import { MinedDeal } from '@/types/minedDeal';
import { usePipelines } from '@/hooks/usePipelines';

interface ActionViewerProps {
  action: any | null;
  calendarActivity?: any | null;
  minedDeal?: MinedDeal | null;
  onClose: () => void;
  onSave?: (updatedAction: any) => void;
  onSubActionSelect?: (subAction: any) => void;
}

// Helper function to process content for TipTap editor
const processContentForEditor = (content: string | undefined): string => {
  if (!content) return '';
  return isHTML(content) ? content : plainTextToHTML(content);
};

// Helper function to get icon for action type
const getActionIcon = (type: string, size = 'h-5 w-5', color = 'gray') => {
  switch (type) {
    case 'EMAIL':
      return <Mail className={size} color={color} />;
    case 'CALL':
      return <Phone className={size} color={color} />;
    case 'MEETING':
      return <Calendar className={size} color={color} />;
    case 'TASK':
      return <CheckSquare className={size} color={color} />;
    case 'LINKEDIN MESSAGE':
      return <MessageSquare className={size} color={color} />;
    case 'LOOKUP':
      return <Search className={size} color={color} />;
    case 'UPDATE_PIPELINE_STAGE':
      return <ArrowUpDown className={size} color={color} />;
    default:
      return <Clock className={size} color={color} />;
  }
};

// Helper function to get status color
const getStatusColor = (status: string) => {
  switch (status) {
    case 'PROPOSED':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'APPROVED':
      return 'bg-green-50 text-green-700 border-green-200';
    case 'UPDATED':
      return 'bg-green-50 text-green-700 border-green-200';
    case 'PROCESSING UPDATES':
      return 'bg-yellow-50 text-yellow-700 border-yellow-200';
    case 'EXECUTED':
      return 'bg-gray-50 text-gray-700 border-gray-200';
    case 'REJECTED':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'CANCELLED':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200';
  }
};

// Helper function to check if all sub-actions are approved
const areAllSubActionsApproved = (subActions?: any[]): boolean => {
  if (!subActions || subActions.length === 0) return true;
  return subActions.every(subAction => 
    subAction.status === 'APPROVED' || subAction.status === 'UPDATED'
  );
};

// Helper function to get unapproved sub-action count
const getUnapprovedSubActionCount = (subActions?: any[]): number => {
  if (!subActions || subActions.length === 0) return 0;
  return subActions.filter(subAction => 
    subAction.status !== 'APPROVED' && subAction.status !== 'UPDATED'
  ).length;
};

export const ActionViewer: React.FC<ActionViewerProps> = ({ 
  action,
  calendarActivity,
  minedDeal,
  onClose,
  onSave,
  onSubActionSelect 
}) => {
  const { 
    updateAction, 
    approveSubAction,
    rejectSubAction,
    updateAndApproveSubAction,
    approveAction,
    rejectAction,
    isUpdatingAction,
    isUpdatingSubAction,
    isApprovingAction,
    isRejectingAction,
    useProposedActionsQuery 
  } = useActionOperations();

  // Get query client for cache invalidation
  const queryClient = useQueryClient();

  // Email operations for attachment functionality
  const {
    uploadAttachments,
    deleteAttachment,
  } = useEmailOperations();
  const [editedDetails, setEditedDetails] = useState<any>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [deletedAttachmentIds, setDeletedAttachmentIds] = useState<string[]>([]);
  const [focusEmailMessageId, setFocusEmailMessageId] = useState<string | null>(null);
  const [focusActivityId, setFocusActivityId] = useState<string | null>(null);

  // Fetch live data from TanStack Query cache
  const { data: cachedActions = [] } = useProposedActionsQuery({});
  
  // Find the current action in the cached data (this will be optimistically updated)
  const currentAction = useMemo(() => {
    if (!action) return null;
    
    // For sub-actions, we need to find them within the parent action's subActions
    if (action.isSubAction && action.parentAction?._id) {
      const parentAction = cachedActions.find((a: any) => a._id === action.parentAction._id);
      if (parentAction?.subActions) {
        const subAction = parentAction.subActions.find((sa: any) => sa.id === action.id);
        if (subAction) {
          return {
            ...subAction,
            isSubAction: true,
            parentAction: parentAction
          };
        }
      }
      return action; // Fallback to prop if not found in cache
    }
    
    // For main actions, find in the cached actions if we have an _id
    if (action._id) {
      const cachedAction = cachedActions.find((a: any) => a._id === action._id);
      return cachedAction || action; // Fallback to prop if not found in cache
    }
    
    // For calendar activities or actions without _id, return as-is
    return action;
  }, [
    action?._id, 
    action?.id, 
    action?.isSubAction, 
    action?.parentAction?._id,
    // Use a stringified version to detect deep changes in cached actions
    JSON.stringify(cachedActions.map((a: any) => ({ _id: a._id, status: a.status, details: a.details })))
  ]);

  // Create the edited action by merging cached data with local edits
  const editedAction = useMemo(() => {
    if (!currentAction) return null;
    
    // Create a stable reference for the merged action
    const merged = {
      ...currentAction,
      details: {
        ...(currentAction.details || {}),
        ...editedDetails
      }
    };
    
    return merged;
  }, [currentAction, editedDetails]);

  // Track previous status to detect transitions
  const [previousStatus, setPreviousStatus] = useState<string | null>(null);
  const [initialActionId, setInitialActionId] = useState<string | null>(null);

  // Reset local edits when action changes and initialize status tracking
  useEffect(() => {
    if (action) {
      setEditedDetails({});
      setHasChanges(false);
      setPendingFiles([]);
      setDeletedAttachmentIds([]);
      setFocusEmailMessageId(null);
      setFocusActivityId(null);
      
      // Track the action ID to detect when action prop changes
      const actionId = action._id || action.id;
      const isNewAction = actionId !== initialActionId;
      
      if (isNewAction) {
        setInitialActionId(actionId);
        // Initialize previous status from the action prop's status
        setPreviousStatus(action.status || 'PROPOSED');
      }
    }
  }, [action?._id, action?.id, action?.isSubAction, initialActionId]);

  // Auto-close viewer when action transitions from pending to completed
  useEffect(() => {
    // Check if the action prop indicates execution
    if (action && action.status === 'EXECUTED') {
      // Action was executed, close the viewer after brief delay
      const timer = setTimeout(() => {
        onClose();
      }, 500);
      return () => clearTimeout(timer);
    }
    
    // If currentAction is null but we had a previousStatus that was pending,
    // it likely means the action was executed and filtered out of the query
    if (!currentAction && previousStatus) {
      const pendingStatuses = ['PROPOSED', 'PROCESSING UPDATES'];
      if (pendingStatuses.includes(previousStatus)) {
        // Action was likely executed and is now filtered out
        const timer = setTimeout(() => {
          onClose();
        }, 500);
        return () => clearTimeout(timer);
      }
      return;
    }
    
    if (!currentAction) return;
    
    const currentStatus = currentAction.status;
    const pendingStatuses = ['PROPOSED', 'PROCESSING UPDATES'];
    const completedStatuses = ['APPROVED', 'EXECUTED', 'REJECTED', 'CANCELLED'];
    
    // Only close if we're transitioning FROM pending TO completed
    // This prevents closing when:
    // - Switching to an already-completed action
    // - Cache refreshes cause temporary data changes
    if (previousStatus && 
        pendingStatuses.includes(previousStatus) && 
        completedStatuses.includes(currentStatus)) {
      // Brief delay for UX feedback before closing
      const timer = setTimeout(() => {
        onClose();
      }, 500);
      return () => clearTimeout(timer);
    }
    
    // Update the tracked status
    setPreviousStatus(currentStatus);
  }, [currentAction?.status, action?.status, previousStatus, onClose]);

  // If we have a mined deal, render the mined deal viewer
  if (minedDeal) {
    return <MinedDealViewer deal={minedDeal} onClose={onClose} />;
  }

  // If we have a calendar activity, render the calendar activity viewer
  if (calendarActivity) {
    return <CalendarActivityViewer calendarActivity={calendarActivity} />;
  }

  if (!action || !currentAction) {
    return (
      <div className="flex-1 overflow-hidden bg-gray-50">
        <div className="h-full flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-600" />
                  <h3 className="text-sm font-medium text-gray-900">No Action Selected</h3>
                </div>
                <p className="text-xs text-gray-500 mt-1">Select an action or meeting from the sidebar to view details</p>
              </div>
              <div className="p-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="h-5 w-5 rounded bg-gray-100 flex items-center justify-center text-gray-600 text-xs">1</div>
                    <p className="text-sm text-gray-900">Open the sidebar to pick an action</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="h-5 w-5 rounded bg-gray-100 flex items-center justify-center text-gray-600 text-xs">2</div>
                    <p className="text-sm text-gray-900">Tap an action to view its details</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-2">
                  <p className="text-xs text-gray-500 sm:ml-2">Tip: On mobile, the sidebar may be hidden.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Wait for editedAction to be properly initialized
  if (!editedAction) {
    return (
      <div className="flex-1 overflow-hidden bg-gray-50">
        <div className="h-full flex items-center justify-center p-4">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-24"></div>
          </div>
        </div>
      </div>
    );
  }

  // Check if form should be disabled
  const isFormDisabled = currentAction.status === 'PROCESSING UPDATES';
  
  // Check if there are pending attachment changes
  const hasPendingAttachmentChanges = pendingFiles.length > 0 || deletedAttachmentIds.length > 0;

  const handleFieldChange = (field: string, value: any) => {
    if (isFormDisabled) return; // Prevent changes when processing
    setEditedDetails((prev: any) => ({
      ...prev,
      [field]: value
    }));
    setHasChanges(true);
  };

  

  const handleApprove = async () => {
    try {
      // For sub-actions, handle differently
      if (action.isSubAction) {
        const parentActionId = action.parentAction?._id;
        if (!parentActionId) {
          console.error('Sub-action missing parent action ID');
          return;
        }

        let result;
        if (hasChanges || hasPendingAttachmentChanges) {
          // Save and approve sub-action (status becomes 'UPDATED')
          // Extract only the fields that can be updated for sub-actions
          const subActionUpdates = {
            details: editedAction.details,
            status: 'UPDATED',
            // Include other sub-action fields if they've been changed (using legacy parameter names)
            ...(editedAction.reasoning !== action.reasoning && { subActionReasoning: editedAction.reasoning }),
            ...(editedAction.priority !== action.priority && { subActionPriority: editedAction.priority }),
            ...(JSON.stringify(editedAction.dependsOn) !== JSON.stringify(action.dependsOn) && { subActionDependsOn: editedAction.dependsOn })
          };
          result = await updateAndApproveSubAction(parentActionId, action.id, subActionUpdates);
        } else {
          // Just approve sub-action (status becomes 'APPROVED')
          result = await approveSubAction(parentActionId, action.id);
        }

        if (result.success) {
          setHasChanges(false);
          onSave?.(editedAction);
        }
        return;
      }

      // For main actions, handle differently based on whether there are changes (including attachment changes)
      if (hasChanges || hasPendingAttachmentChanges) {
        // If there are changes, upload any pending files first, then save details with attachments metadata
        let attachments: AttachmentMetadata[] = (editedAction.details.attachments || []).filter((a: any) => !deletedAttachmentIds.includes(a.id));
        if (pendingFiles.length > 0) {
          const organizationId = (editedAction as any).organization || (editedAction.opportunity as any)?.organizationId || (editedAction as any).organizationId;
          if (!organizationId) {
            console.error('Missing organization ID for uploading pending attachments.');
          } else {
            const uploadResult = await uploadAttachments(pendingFiles, organizationId);
            if (uploadResult.success && uploadResult.data) {
              attachments = [...attachments, ...uploadResult.data];
              setPendingFiles([]);
            } else {
              console.error('Failed to upload pending attachments before save:', uploadResult.error);
            }
          }
        }

        for (const id of deletedAttachmentIds) {
          try { await deleteAttachment(id); } catch (e) { console.error('Failed to delete attachment', id, e); }
        }
        setDeletedAttachmentIds([]);

        const result = await updateAction(editedAction._id, { details: { ...editedAction.details, attachments } });
        if (result.success) {
          setHasChanges(false);
          // Clear local state after successful update
          setPendingFiles([]);
          // Update local edited details to reflect the new attachments
          setEditedDetails((prev: any) => ({
            ...prev,
            attachments
          }));
          // Invalidate all action queries to refresh data
          queryClient.invalidateQueries({ 
            predicate: (query) => {
              const queryKey = query.queryKey as any[];
              return queryKey?.[0]?.scope === 'actions';
            }
          });
          onSave?.(editedAction);
        }
      } else {
        // If no changes, approve and execute immediately. Upload pending files first and include metadata in details.
        let attachments: AttachmentMetadata[] = (editedAction.details.attachments || []).filter((a: any) => !deletedAttachmentIds.includes(a.id));
        if (pendingFiles.length > 0) {
          const organizationId = (editedAction as any).organization || (editedAction.opportunity as any)?.organizationId || (editedAction as any).organizationId;
          if (!organizationId) {
            console.error('Missing organization ID for uploading pending attachments.');
          } else {
            const uploadResult = await uploadAttachments(pendingFiles, organizationId);
            if (uploadResult.success && uploadResult.data) {
              attachments = [...attachments, ...uploadResult.data];
              setPendingFiles([]);
            } else {
              console.error('Failed to upload pending attachments before execute:', uploadResult.error);
            }
          }
        }

        // Save attachments metadata to details before executing (backend may ignore if not needed)
        for (const id of deletedAttachmentIds) {
          try { await deleteAttachment(id); } catch (e) { console.error('Failed to delete attachment', id, e); }
        }
        setDeletedAttachmentIds([]);

        await updateAction(editedAction._id, { details: { ...editedAction.details, attachments } });
        const result = await approveAction(editedAction._id, true); // true = execute immediately
        if (result.success) {
          // Clear local state after successful execution
          setPendingFiles([]);
          // Update local edited details to reflect the new attachments
          setEditedDetails((prev: any) => ({
            ...prev,
            attachments
          }));
          // Invalidate all action queries to refresh data
          queryClient.invalidateQueries({ 
            predicate: (query) => {
              const queryKey = query.queryKey as any[];
              return queryKey?.[0]?.scope === 'actions';
            }
          });
          // Don't call onSave when executing - we're closing the viewer
          // The auto-close effect will handle closing after the status updates
        }
      }
    } catch (error) {
      console.error('Failed to approve action:', error);
    }
  };

  const handleDeny = async () => {
    try {
      // For sub-actions, handle differently
      if (action.isSubAction) {
        const parentActionId = action.parentAction?._id;
        if (!parentActionId) {
          console.error('Sub-action missing parent action ID');
          return;
        }

        // Use the sub-action reject function
        const result = await rejectSubAction(parentActionId, action.id);
        
        if (result.success) {
          onSave?.(editedAction);
        }
        return;
      }

      // For main actions, use the dedicated reject endpoint
      await rejectAction(editedAction._id);
      // Don't call onSave when rejecting - auto-close effect will handle closing after status updates
    } catch (error) {
      console.error('Failed to deny action:', error);
    }
  };

  // Attachment handler functions

  const handleDeleteAttachment = async (attachmentId: string) => {
    setDeletedAttachmentIds((prev) => Array.from(new Set([...prev, attachmentId])));
    return { success: true };
  };

  const renderActionForm = () => {
    // For sub-actions, we want to show them in a read-only detailed view
    if (currentAction.isSubAction) {
      return (
        <SubActionDetailView 
          action={editedAction} 
          onChange={handleFieldChange} 
          isDisabled={isFormDisabled}
          onDeleteAttachment={handleDeleteAttachment}
        />
      );
    }

    switch (currentAction.type) {
      case 'EMAIL':
        return (
          <div className={isFormDisabled ? 'opacity-60 pointer-events-none' : ''}>
            <EmailActionViewer 
              key={`email-${currentAction._id || currentAction.id}-${currentAction.isSubAction ? 'sub' : 'main'}`}
              action={editedAction} 
              onChange={handleFieldChange}
              isEditing={true}
              isSaving={isUpdatingAction}
              prospectId={editedAction.opportunity?.prospect?._id || editedAction.prospectId}
              opportunityId={editedAction.opportunity?._id || editedAction.opportunityId}
              organizationId={(editedAction as any).organization || (editedAction.opportunity as any)?.organizationId || (editedAction as any).organizationId}
              pendingFiles={pendingFiles}
              onPendingFilesChange={setPendingFiles}
              pendingDeletions={deletedAttachmentIds}
              onMarkForDeletion={(id) => setDeletedAttachmentIds((prev) => Array.from(new Set([...prev, id])))}
              showActions={false} // Actions are handled by the main ActionViewer
              onDeleteAttachment={handleDeleteAttachment}
            onReplyIdClick={(id) => {
              setFocusEmailMessageId(id);
              setFocusActivityId(null);
            }}
            />
          </div>
        );
      case 'TASK':
        return <TaskActionForm action={editedAction} onChange={handleFieldChange} isDisabled={isFormDisabled} />;
      case 'MEETING':
        return <MeetingActionViewer action={editedAction} onChange={handleFieldChange} isDisabled={isFormDisabled} />;
      case 'CALL':
        return <CallActionForm action={editedAction} onChange={handleFieldChange} isDisabled={isFormDisabled} />;
      case 'LINKEDIN MESSAGE':
        return <LinkedInActionForm action={editedAction} onChange={handleFieldChange} isDisabled={isFormDisabled} />;
      case 'LOOKUP':
        return <LookupActionForm action={editedAction} onChange={handleFieldChange} isDisabled={isFormDisabled} />;
      case 'NO_ACTION':
        return <NoActionForm action={editedAction} onChange={handleFieldChange} isDisabled={isFormDisabled} />;
      default:
        return <DefaultActionForm action={editedAction} onChange={handleFieldChange} isDisabled={isFormDisabled} />;
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          {getActionIcon(currentAction.type)}
          <div>
            {/* <h1 className="text-lg font-semibold text-gray-900">
              {currentAction.isSubAction ? 'Sub-action: ' : ''}{currentAction.type} Action
            </h1> */}
            <div className="flex items-center gap-2 mt-1">
              {currentAction.status && currentAction.status !== 'PROPOSED' && (
                <Badge 
                  variant="outline" 
                  className={`text-xs ${getStatusColor(currentAction.status)}`}
                >
                  <div className="flex items-center gap-1">
                    {currentAction.status === 'PROCESSING UPDATES' && (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    )}
                    {currentAction.status}
                  </div>
                </Badge>
              )}
              {/* {currentAction.priority && (
                <span className="text-xs text-gray-500">Priority: {currentAction.priority}</span>
              )} */}
            </div>
          </div>
        </div>
        
                <div className="flex items-center gap-2">
          {/* Show sub-actions status for main actions */}
          {!currentAction.isSubAction && currentAction.subActions?.length > 0 && (
            <div className="mr-2">
              {areAllSubActionsApproved(currentAction.subActions) ? (
                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                  All sub-actions approved
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">
                  {getUnapprovedSubActionCount(currentAction.subActions)} sub-action(s) need approval
                </Badge>
              )}
            </div>
          )}
          
          {/* Only show approve/deny buttons if action is still in PROPOSED status */}
          {currentAction.status === 'PROPOSED' && (
            <>
              <Button
                onClick={handleDeny}
                disabled={
                  isUpdatingAction ||
                  isUpdatingSubAction ||
                  isApprovingAction ||
                  isRejectingAction ||
                  isFormDisabled
                }
                variant="outline"
                size="sm"
                className={`border-red-300 text-red-700 hover:bg-red-50 transition-all duration-200 ${
                  isRejectingAction ? 'ring-2 ring-red-200 bg-red-50/30' : ''
                }`}
              >
                {isRejectingAction ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Rejecting...
                  </>
                ) : (
                  'Deny'
                )}
              </Button>
              <Button
                onClick={handleApprove}
                disabled={
                  (isUpdatingAction || isUpdatingSubAction || isApprovingAction || isFormDisabled) || 
                  (!currentAction.isSubAction && !areAllSubActionsApproved(currentAction.subActions))
                }
                size="sm"
                className={`primary transition-all duration-200 ${
                  (isUpdatingAction || isUpdatingSubAction || isApprovingAction) 
                    ? 'ring-2 ring-primary/30' 
                    : ''
                }`}
              >
                {(isUpdatingAction || isUpdatingSubAction || isApprovingAction) ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {currentAction.isSubAction 
                      ? ((hasChanges || hasPendingAttachmentChanges) ? 'Saving & Approving...' : 'Approving...')
                      : (isApprovingAction ? 'Executing...' : (hasChanges || hasPendingAttachmentChanges) ? 'Saving...' : 'Executing...')
                    }
                  </>
                ) : (hasChanges || hasPendingAttachmentChanges) ? (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    {currentAction.isSubAction ? 'Save and Approve' : 'Save'}
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    {currentAction.isSubAction ? 'Approve' : 'Execute'}
                  </>
                )}
              </Button>
            </>
          )}
        
        </div>
      </div>

      {/* Content */}
      <div className={`flex-1 overflow-y-auto p-4 ${isFormDisabled ? 'opacity-60' : ''}`}>
        {/* Action Reasoning */}
        {currentAction.reasoning && (
          <div className="mb-6">
            <Label className="text-sm font-medium text-gray-700">AI Reasoning</Label>
          <div className="mt-1 p-3 bg-gray-50 rounded-md text-sm text-gray-600">
            {parseReasoningText(
              currentAction.reasoning, 
              currentAction.sourceActivities,
              (activityId) => {
                // Check if this is an email activity (messageId) or general activity
                setFocusActivityId(activityId);
                setFocusEmailMessageId(null);
              }
            )}
          </div>
          </div>
        )}

        <Separator className="my-6" />

        {/* Action-specific form */}
        {renderActionForm()}

        {/* Sub-actions - only show for main actions, not sub-actions */}
        {!currentAction.isSubAction && currentAction.subActions?.length > 0 && (
          <>
            <Separator className="my-6" />
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-3 block">Sub-actions</Label>
              <div className="space-y-3">
                {currentAction.subActions.map((subAction: any) => (
                  <div 
                    key={subAction.id} 
                    className={`p-3 border rounded-md cursor-pointer transition-colors ${
                      subAction.status === 'APPROVED' || subAction.status === 'UPDATED'
                        ? 'border-green-200 bg-green-50 hover:bg-green-100'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                    onClick={() => {
                      // Create a sub-action object that can be handled by the main action viewer
                      const subActionForViewer = {
                        ...subAction,
                        isSubAction: true,
                        parentAction: currentAction
                      };
                      onSubActionSelect?.(subActionForViewer);
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {getActionIcon(subAction.type, 'h-4 w-4')}
                      <span className="font-medium text-sm">{subAction.type}</span>
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${getStatusColor(subAction.status)}`}
                      >
                        {subAction.status}
                      </Badge>
                      <span className="text-xs text-gray-500">Priority: {subAction.priority}</span>
                    </div>
                    
                    {/* Show only query for LOOKUP sub-actions */}
                    {subAction.type === 'LOOKUP' && subAction.details?.query && (
                      <div className="mt-2">
                        <span className="text-xs font-medium text-gray-700">Query:</span>
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                          {subAction.details.query}
                        </p>
                      </div>
                    )}
                    
                    {/* Show title for other sub-action types */}
                    {subAction.type === 'EMAIL' && subAction.details?.subject && (
                      <div className="mt-2">
                        <span className="text-xs font-medium text-gray-700">Subject:</span>
                        <p className="text-xs text-gray-600 mt-1 line-clamp-1">{subAction.details.subject}</p>
                      </div>
                    )}
                    
                    {subAction.type === 'TASK' && subAction.details?.title && (
                      <div className="mt-2">
                        <span className="text-xs font-medium text-gray-700">Task:</span>
                        <p className="text-xs text-gray-600 mt-1 line-clamp-1">{subAction.details.title}</p>
                      </div>
                    )}
                    
                    {subAction.type === 'MEETING' && subAction.details?.title && (
                      <div className="mt-2">
                        <span className="text-xs font-medium text-gray-700">Meeting:</span>
                        <p className="text-xs text-gray-600 mt-1 line-clamp-1">{subAction.details.title}</p>
                      </div>
                    )}
                    
                    {(subAction.type === 'CALL' || subAction.type === 'LINKEDIN MESSAGE') && subAction.details?.contactEmail && (
                      <div className="mt-2">
                        <span className="text-xs font-medium text-gray-700">Contact:</span>
                        <p className="text-xs text-gray-600 mt-1">{subAction.details.contactEmail}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Activity Timeline - context from previous activities for this opportunity */}
        {(currentAction.opportunity?._id || currentAction.opportunityId) && (
          <>
            <div className="mt-8 pt-6 border-t border-gray-100">
              <ActivityTimelineSection
                opportunityId={currentAction.opportunity?._id || currentAction.opportunityId}
                focusMessageId={focusEmailMessageId || undefined}
                focusActivityId={focusActivityId || undefined}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// Email Action Form Component - Replaced by EmailActionViewer
// This component has been replaced by the more advanced EmailActionViewer component
// which provides better contact selection, validation, and UI

// Task Action Form Component
const TaskActionForm: React.FC<{ action: any; onChange: (field: string, value: any) => void; isDisabled?: boolean }> = ({ 
  action, 
  onChange,
  isDisabled = false
}) => {
  return (
    <div className={`space-y-4 ${isDisabled ? 'opacity-60 pointer-events-none' : ''}`}>
      <div>
        <Label htmlFor="task-title">Task Title *</Label>
        <Input
          id="task-title"
          value={action.details?.title || ''}
          onChange={(e) => onChange('title', e.target.value)}
          placeholder="Task title"
          className="mt-1"
          disabled={isDisabled}
        />
      </div>

      <div>
        <Label htmlFor="task-description">Description *</Label>
        <div className="mt-1">
          <TipTapEditor
            content={processContentForEditor(action.details?.description)}
            onChange={(html) => onChange('description', html)}
            placeholder="Describe the task..."
            editable={!isDisabled}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="task-due">Due Date *</Label>
        <Input
          id="task-due"
          type="date"
          value={action.details?.dueDate || ''}
          onChange={(e) => onChange('dueDate', e.target.value)}
          className="mt-1"
          disabled={isDisabled}
        />
      </div>
    </div>
  );
};

// Call Action Form Component
const CallActionForm: React.FC<{ action: any; onChange: (field: string, value: any) => void; isDisabled?: boolean }> = ({ 
  action, 
  onChange,
  isDisabled = false
}) => {
  return (
    <div className={`space-y-4 ${isDisabled ? 'opacity-60 pointer-events-none' : ''}`}>
      <div>
        <Label htmlFor="call-contact">Contact Email *</Label>
        <Input
          id="call-contact"
          value={action.details?.contactEmail || ''}
          onChange={(e) => onChange('contactEmail', e.target.value)}
          placeholder="contact@example.com"
          className="mt-1"
          disabled={isDisabled}
        />
      </div>

      <div>
        <Label htmlFor="call-scheduled">Scheduled For *</Label>
        <Input
          id="call-scheduled"
          type="datetime-local"
          value={action.details?.scheduledFor ? new Date(action.details.scheduledFor).toISOString().slice(0, 16) : ''}
          onChange={(e) => onChange('scheduledFor', e.target.value ? new Date(e.target.value).toISOString() : '')}
          className="mt-1"
          disabled={isDisabled}
        />
      </div>

      <div>
        <Label htmlFor="call-purpose">Call Purpose</Label>
        <div className="mt-1">
          <TipTapEditor
            content={processContentForEditor(action.details?.purpose)}
            onChange={(html) => onChange('purpose', html)}
            placeholder="Call purpose and talking points..."
            editable={!isDisabled}
          />
        </div>
      </div>
    </div>
  );
};

// LinkedIn Action Form Component
const LinkedInActionForm: React.FC<{ action: any; onChange: (field: string, value: any) => void; isDisabled?: boolean }> = ({ 
  action, 
  onChange,
  isDisabled = false
}) => {
  return (
    <div className={`space-y-4 ${isDisabled ? 'opacity-60 pointer-events-none' : ''}`}>
      <div>
        <Label htmlFor="linkedin-contact">Contact Email *</Label>
        <Input
          id="linkedin-contact"
          value={action.details?.contactEmail || ''}
          onChange={(e) => onChange('contactEmail', e.target.value)}
          placeholder="contact@example.com"
          className="mt-1"
          disabled={isDisabled}
        />
      </div>

      <div>
        <Label htmlFor="linkedin-scheduled">Scheduled For *</Label>
        <Input
          id="linkedin-scheduled"
          type="datetime-local"
          value={action.details?.scheduledFor ? new Date(action.details.scheduledFor).toISOString().slice(0, 16) : ''}
          onChange={(e) => onChange('scheduledFor', e.target.value ? new Date(e.target.value).toISOString() : '')}
          className="mt-1"
          disabled={isDisabled}
        />
      </div>

      <div>
        <Label htmlFor="linkedin-message">Message</Label>
        <div className="mt-1">
          <TipTapEditor
            content={processContentForEditor(action.details?.message)}
            onChange={(html) => onChange('message', html)}
            placeholder="LinkedIn message content..."
            editable={!isDisabled}
          />
        </div>
      </div>
    </div>
  );
};

// Lookup Action Form Component
const LookupActionForm: React.FC<{ action: any; onChange: (field: string, value: any) => void; isDisabled?: boolean }> = ({ 
  action, 
  onChange,
  isDisabled = false
}) => {
  return (
    <div className={`space-y-4 ${isDisabled ? 'opacity-60 pointer-events-none' : ''}`}>
      <div>
        <Label htmlFor="lookup-query">Query *</Label>
        <Input
          id="lookup-query"
          value={action.details?.query || ''}
          onChange={(e) => onChange('query', e.target.value)}
          placeholder="What information needs to be looked up?"
          className="mt-1"
          disabled={isDisabled}
        />
      </div>

      {(action.details?.answer || action.details?.content) && (
        <div>
          <Label htmlFor="lookup-answer">Answer</Label>
          <div className="mt-1">
            <TipTapEditor
              content={processContentForEditor(action.details.answer || action.details.content)}
              onChange={(html) => {
                onChange('answer', html);
                // Also update content field for backward compatibility
                onChange('content', html);
              }}
              placeholder="Lookup results..."
              editable={!isDisabled}
            />
          </div>
        </div>
      )}

      {action.details?.sources?.length > 0 && (
        <div>
          <Label>Sources</Label>
          <div className="mt-1 space-y-1">
            {action.details.sources.map((source: string, index: number) => (
              <div key={index} className="text-sm text-blue-600 hover:underline">
                <a href={source} target="_blank" rel="noopener noreferrer">
                  {source}
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {action.details?.confidence ? (
        <div>
          <Label>Confidence Score</Label>
          <div className="mt-1 text-sm text-gray-600">
            {(action.details.confidence * 100).toFixed(0)}%
          </div>
        </div>
      ) : null}
    </div>
  );
};

// No Action Form Component
const NoActionForm: React.FC<{ action: any; onChange: (field: string, value: any) => void; isDisabled?: boolean }> = ({ 
  action, 
  onChange: _onChange,
  isDisabled = false
}) => {
  // Format the next review date if available
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'Not set';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        weekday: 'long',
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className={`space-y-4 ${isDisabled ? 'opacity-60 pointer-events-none' : ''}`}>
      {/* Wait Reason */}
      {action.details?.waitReason && (
        <div>
          <Label className="text-sm font-medium text-gray-700">Wait Reason</Label>
          <div className="mt-1 p-3 bg-gray-50 rounded-md text-sm text-gray-600">
            {action.details.waitReason}
          </div>
        </div>
      )}

      {/* Next Review Date */}
      {action.details?.nextReviewDate && (
        <div>
          <Label className="text-sm font-medium text-gray-700">Next Review Date</Label>
          <div className="mt-1 p-3 bg-blue-50 rounded-md text-sm text-blue-900 font-medium">
            {formatDate(action.details.nextReviewDate)}
          </div>
        </div>
      )}

      {/* Expected Event */}
      {action.details?.expectedEvent && (
        <div>
          <Label className="text-sm font-medium text-gray-700">Expected Event</Label>
          <div className="mt-1 p-3 bg-gray-50 rounded-md text-sm text-gray-600">
            {action.details.expectedEvent}
          </div>
        </div>
      )}

      {/* Show any other fields that might exist */}
      {action.details && Object.keys(action.details).filter(
        key => !['waitReason', 'nextReviewDate', 'expectedEvent'].includes(key)
      ).length > 0 && (
        <div>
          <Label className="text-sm font-medium text-gray-700">Additional Details</Label>
          <div className="mt-1 p-3 bg-gray-50 rounded-md text-sm text-gray-600">
            {Object.entries(action.details)
              .filter(([key]) => !['waitReason', 'nextReviewDate', 'expectedEvent'].includes(key))
              .map(([key, value]) => (
                <div key={key} className="mb-2 last:mb-0">
                  <span className="font-medium text-gray-700">{key}: </span>
                  <span className="text-gray-600">{String(value)}</span>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
};

// Default Action Form Component
const DefaultActionForm: React.FC<{ action: any; onChange: (field: string, value: any) => void; isDisabled?: boolean }> = ({ 
  action, 
  onChange: _onChange,
  isDisabled = false
}) => {
  return (
    <div className={`space-y-4 ${isDisabled ? 'opacity-60 pointer-events-none' : ''}`}>
      <div>
        <Label>Action Details</Label>
        <div className="mt-1 p-3 bg-gray-50 rounded-md text-sm">
          <pre className="whitespace-pre-wrap">
            {JSON.stringify(action.details, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
};

// Update Pipeline Stage Action Form Component
const UpdatePipelineStageActionForm: React.FC<{ 
  action: any; 
  onChange: (field: string, value: any) => void;
  isDisabled?: boolean;
}> = ({ action, onChange: _onChange, isDisabled = false }) => {
  return (
    <div className={`space-y-4 ${isDisabled ? 'opacity-60 pointer-events-none' : ''}`}>
      <div>
        <Label className="text-sm font-medium text-gray-700">Target Stage</Label>
        <Input
          value={action.details?.targetStageName || ''}
          disabled={true}
          className="mt-2"
        />
        <p className="text-xs text-gray-500 mt-1">
          This opportunity will be moved to the "{action.details?.targetStageName}" stage
        </p>
      </div>
    </div>
  );
};

// Sub-Action Detail View Component
const SubActionDetailView: React.FC<{ 
  action: any; 
  onChange: (field: string, value: any) => void; 
  isDisabled?: boolean;
  onDeleteAttachment?: (attachmentId: string) => Promise<{ success: boolean; error?: string }>;
}> = ({ 
  action, 
  onChange,
  isDisabled = false,
  onDeleteAttachment,
}) => {
  return (
    <div className={`space-y-4 ${isDisabled ? 'opacity-60 pointer-events-none' : ''}`}>
      {/* Dependencies */}
      {action.dependsOn?.length > 0 && (
        <div className="p-3 bg-yellow-50 rounded-md border border-yellow-200">
          <Label className="text-sm font-medium text-yellow-800">Dependencies</Label>
          <div className="text-sm text-yellow-700 mt-1">
            This sub-action depends on: {action.dependsOn.join(', ')}
          </div>
        </div>
      )}

      {/* Editable Sub-action Content - Use the same forms as main actions */}
      {action.type === 'EMAIL' && (
        <div className={isDisabled ? 'opacity-60 pointer-events-none' : ''}>
          <EmailActionViewer 
            key={`sub-email-${action.id || action._id}-${action.parentAction?._id || 'no-parent'}`}
            action={action} 
            onChange={onChange}
            isEditing={true}
            showActions={false}
            prospectId={action.opportunity?.prospect?._id || action.prospectId}
            opportunityId={action.opportunity?._id || action.opportunityId}
            organizationId={(action as any).organization || (action.opportunity as any)?.organizationId || (action as any).organizationId}
            pendingFiles={[]}
            onPendingFilesChange={() => {}}
            pendingDeletions={[]}
            onMarkForDeletion={() => {}}
            onDeleteAttachment={onDeleteAttachment}
          />
        </div>
      )}
      {action.type === 'TASK' && <TaskActionForm action={action} onChange={onChange} isDisabled={isDisabled} />}
      {action.type === 'MEETING' && <MeetingActionViewer action={action} onChange={onChange} isDisabled={isDisabled} />}
      {action.type === 'CALL' && <CallActionForm action={action} onChange={onChange} isDisabled={isDisabled} />}
      {action.type === 'LINKEDIN MESSAGE' && <LinkedInActionForm action={action} onChange={onChange} isDisabled={isDisabled} />}
      {action.type === 'LOOKUP' && <LookupActionForm action={action} onChange={onChange} isDisabled={isDisabled} />}
      {action.type === 'UPDATE_PIPELINE_STAGE' && <UpdatePipelineStageActionForm action={action} onChange={onChange} isDisabled={isDisabled} />}
    </div>
  );
};

// Helper function to get attendee status icon
const getAttendeeStatusIcon = (status: string) => {
  switch (status) {
    case 'accepted':
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    case 'declined':
      return <XCircle className="h-4 w-4 text-red-600" />;
    case 'tentative':
      return <AlertCircle className="h-4 w-4 text-yellow-600" />;
    case 'needsAction':
      return <MinusCircle className="h-4 w-4 text-gray-400" />;
    default:
      return <MinusCircle className="h-4 w-4 text-gray-400" />;
  }
};

// Helper function to get attendee status color
const getAttendeeStatusColor = (status: string) => {
  switch (status) {
    case 'accepted':
      return 'bg-green-50 text-green-700 border-green-200';
    case 'declined':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'tentative':
      return 'bg-yellow-50 text-yellow-700 border-yellow-200';
    case 'needsAction':
      return 'bg-gray-50 text-gray-700 border-gray-200';
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200';
  }
};

// Calendar Activity Viewer Component
const CalendarActivityViewer: React.FC<{ calendarActivity: any }> = ({ calendarActivity }) => {
  console.log('calendarActivity', calendarActivity);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { defaultPipeline } = usePipelines();
  
  const formatDateTime = (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };

  const getDuration = () => {
    if (!calendarActivity.startTime || !calendarActivity.endTime) return null;
    const start = new Date(calendarActivity.startTime);
    const end = new Date(calendarActivity.endTime);
    const durationMs = end.getTime() - start.getTime();
    const durationMinutes = Math.round(durationMs / (1000 * 60));
    
    if (durationMinutes < 60) {
      return `${durationMinutes} minutes`;
    } else {
      const hours = Math.floor(durationMinutes / 60);
      const minutes = durationMinutes % 60;
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
  };

  const getConferenceLink = () => {
    // Check for conference details
    if (calendarActivity.conferencing?.details?.url) {
      return calendarActivity.conferencing.details.url;
    }
    
    // Check for HTML link
    if (calendarActivity.htmlLink) {
      return calendarActivity.htmlLink;
    }
    
    // Check for common meeting links in description
    if (calendarActivity.description) {
      const zoomMatch = calendarActivity.description.match(/https:\/\/[a-zA-Z0-9.-]*\.?zoom\.us\/[a-zA-Z0-9\/\?=&-]*/);
      const teamsMatch = calendarActivity.description.match(/https:\/\/teams\.microsoft\.com\/[a-zA-Z0-9\/\?=&-]*/);
      const meetMatch = calendarActivity.description.match(/https:\/\/meet\.google\.com\/[a-zA-Z0-9-]*/);
      
      return zoomMatch?.[0] || teamsMatch?.[0] || meetMatch?.[0];
    }
    
    return null;
  };

  // Extract external domains from attendees (excluding organization domains)
  const extractExternalDomains = (): string[] => {
    if (!calendarActivity.attendees || calendarActivity.attendees.length === 0) {
      return [];
    }

    // Get organization domain from user's email
    // The user object structure might be: user.user.email or user.email
    const userEmail = (user?.user?.email || user?.email || '').toLowerCase();
    const orgDomain = userEmail.split('@')[1] || '';

    // Also get organizer domain if available
    const organizerEmail = calendarActivity.organizer?.email?.toLowerCase() || '';
    const organizerDomain = organizerEmail.split('@')[1] || '';

    // Collect all internal domains to exclude
    const internalDomains = new Set<string>();
    if (orgDomain) internalDomains.add(orgDomain);
    if (organizerDomain) internalDomains.add(organizerDomain);

    // Extract unique external domains
    const domains: string[] = calendarActivity.attendees
      .map((attendee: any) => {
        const email = (attendee.email || '').toLowerCase();
        return email.split('@')[1] || '';
      })
      .filter((domain: string) => {
        // Filter out empty domains and internal domains
        return domain && !internalDomains.has(domain);
      });

    // Return unique domains
    return [...new Set(domains)];
  };

  // Handle create opportunity button click
  const handleCreateOpportunity = () => {
    const externalDomains = extractExternalDomains();
    const params = new URLSearchParams();
    
    params.set('prefill', 'true');
    
    if (externalDomains.length > 0) {
      params.set('domains', externalDomains.join(','));
    }
    
    if (calendarActivity.title) {
      params.set('name', calendarActivity.title);
    }
    
    if (calendarActivity.startTime) {
      // Format date as YYYY-MM-DD for the date input
      const startDate = new Date(calendarActivity.startTime);
      const formattedDate = startDate.toISOString().split('T')[0];
      params.set('date', formattedDate);
    }
    
    const pipelineId = defaultPipeline?._id || 'default';
    navigate(`/pipeline/${pipelineId}/new-opportunity?${params.toString()}`);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-gray-900 mb-1 truncate">
              {calendarActivity.title || 'Untitled Meeting'}
            </h1>
            
            <div className="flex items-center gap-3 text-sm text-gray-600 mb-3">
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                <span>
                  {calendarActivity.startTime ? formatDateTime(calendarActivity.startTime) : formatDateTime(calendarActivity.date)}
                </span>
              </div>
              {getDuration() && (
                <span className="text-gray-500">• {getDuration()}</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Badge 
                variant="outline" 
                className={`text-xs ${calendarActivity.status ? getStatusColor(calendarActivity.status.toUpperCase()) : 'bg-blue-50 text-blue-700 border-blue-200'}`}
              >
                {calendarActivity.status || 'scheduled'}
              </Badge>
            </div>
          </div>

          <div className="ml-4 flex-shrink-0 flex items-center gap-2">
            {/* Create Opportunity Button - Show only when not linked to a prospect */}
            {!calendarActivity.prospectRef && (
              <Button
                onClick={handleCreateOpportunity}
                variant="outline"
                size="sm"
                className="inline-flex items-center gap-2"
              >
                <PlusCircle className="h-3 w-3" />
                Create Opportunity
              </Button>
            )}
            
            {/* Meeting Link */}
            {getConferenceLink() && (
              <a
                href={getConferenceLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-md transition-colors"
              >
                Join Meeting
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Meeting Agenda - Special handling for HTML content */}
        {calendarActivity.agenda?.content && (
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-gray-600" />
                <h3 className="text-sm font-medium text-gray-900">Meeting Agenda</h3>
                {calendarActivity.agenda.generatedBy && (
                  <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                    AI Generated
                  </Badge>
                )}
              </div>
              {calendarActivity.agenda.generatedAt && (
                <p className="text-xs text-gray-500 mt-1">
                  Generated on {new Date(calendarActivity.agenda.generatedAt).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="p-4">
              {/* Render HTML content safely using TipTap editor in read-only mode */}
              <TipTapEditor
                content={calendarActivity.agenda.content}
                onChange={() => {}} // Read-only
                editable={false}
                placeholder="No agenda available"
              />
            </div>
          </div>
        )}

        {/* Location */}
        {calendarActivity.location && (
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gray-600" />
                <h3 className="text-sm font-medium text-gray-900">Location</h3>
              </div>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-900">{calendarActivity.location}</p>
            </div>
          </div>
        )}

        {/* Attendees */}
        {calendarActivity.attendees && calendarActivity.attendees.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-600" />
                <h3 className="text-sm font-medium text-gray-900">
                  Attendees ({calendarActivity.attendees.length})
                </h3>
              </div>
            </div>
            <div className="p-4">
              <div className="space-y-3">
                {calendarActivity.attendees.map((attendee: any, index: number) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                    <div className="flex items-center gap-3">
                      {getAttendeeStatusIcon(attendee.responseStatus)}
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {attendee.name || attendee.email}
                        </p>
                        {attendee.name && attendee.email && (
                          <p className="text-xs text-gray-500">{attendee.email}</p>
                        )}
                      </div>
                    </div>
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${getAttendeeStatusColor(attendee.responseStatus)}`}
                    >
                      {attendee.responseStatus}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Organizer & Creator */}
        {(calendarActivity.organizer || calendarActivity.creator) && (
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-600" />
                <h3 className="text-sm font-medium text-gray-900">Meeting Details</h3>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {calendarActivity.organizer && (
                <div>
                  <Label className="text-xs text-gray-500">Organizer</Label>
                  <p className="text-sm text-gray-900 mt-1">
                    {calendarActivity.organizer.name ? 
                      `${calendarActivity.organizer.name} (${calendarActivity.organizer.email})` : 
                      calendarActivity.organizer.email
                    }
                  </p>
                </div>
              )}
              {calendarActivity.creator && calendarActivity.creator.email !== calendarActivity.organizer?.email && (
                <div>
                  <Label className="text-xs text-gray-500">Creator</Label>
                  <p className="text-sm text-gray-900 mt-1">
                    {calendarActivity.creator.name ? 
                      `${calendarActivity.creator.name} (${calendarActivity.creator.email})` : 
                      calendarActivity.creator.email
                    }
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Meeting Description */}
        {calendarActivity.description && (
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-gray-600" />
                <h3 className="text-sm font-medium text-gray-900">Description</h3>
              </div>
            </div>
            <div className="p-4">
              <div className="text-sm text-gray-900 whitespace-pre-wrap">
                {calendarActivity.description}
              </div>
            </div>
          </div>
        )}

        {/* AI Summary */}
        {calendarActivity.aiSummary && (
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-gray-600" />
                <h3 className="text-sm font-medium text-gray-900">AI Summary</h3>
                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                  AI Generated
                </Badge>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Generated on {new Date(calendarActivity.aiSummary.date).toLocaleDateString()}
              </p>
            </div>
            <div className="p-4">
              <div className="text-sm text-gray-900 whitespace-pre-wrap">
                {calendarActivity.aiSummary.summary}
              </div>
            </div>
          </div>
        )}

        {/* Human Summary */}
        {calendarActivity.humanSummary && (
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-gray-600" />
                <h3 className="text-sm font-medium text-gray-900">Meeting Notes</h3>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Added on {new Date(calendarActivity.humanSummary.date).toLocaleDateString()}
              </p>
            </div>
            <div className="p-4">
              <div className="text-sm text-gray-900 whitespace-pre-wrap">
                {calendarActivity.humanSummary.summary}
              </div>
            </div>
          </div>
        )}

        {/* Recording & Transcript */}
        {(calendarActivity.recordingUrl || calendarActivity.transcriptUrl || calendarActivity.mediaStatus) && (
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-600" />
                <h3 className="text-sm font-medium text-gray-900">Recording & Media</h3>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {calendarActivity.mediaStatus && (
                <div>
                  <Label className="text-xs text-gray-500">Media Status</Label>
                  <div className="mt-1">
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${
                        calendarActivity.mediaStatus === 'available' || calendarActivity.mediaStatus === 'recorded' 
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : calendarActivity.mediaStatus === 'processing'
                          ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                          : calendarActivity.mediaStatus === 'error' || calendarActivity.mediaStatus === 'failed'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : 'bg-gray-50 text-gray-700 border-gray-200'
                      }`}
                    >
                      {calendarActivity.mediaStatus}
                    </Badge>
                  </div>
                </div>
              )}
              {calendarActivity.recordingUrl && (
                <div>
                  <Label className="text-xs text-gray-500">Recording</Label>
                  <div className="mt-1">
                    <a
                      href={calendarActivity.recordingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      View Recording
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              )}
              {calendarActivity.transcriptUrl && (
                <div>
                  <Label className="text-xs text-gray-500">Transcript</Label>
                  <div className="mt-1">
                    <a
                      href={calendarActivity.transcriptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      View Transcript
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
