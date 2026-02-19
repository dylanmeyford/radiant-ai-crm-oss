import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePageActions } from '@/context/PageActionsContext';
import { useOpportunityOperations } from '@/hooks/useOpportunityOperations';
import { useContactOperations } from '@/hooks/useContactOperations';
import { useIsMobile } from '@/hooks/use-mobile';
import { Skeleton } from '@/components/ui/skeleton';
import { ProcessingStatusIndicator } from '@/components/opportunities/ProcessingStatusIndicator';

import { FileText, MapIcon, Plus, Pencil, Lightbulb, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { OpportunitySidebar } from '@/components/opportunities/OpportunitySidebar';
import { SalesRoomTab } from '@/components/opportunities/SalesRoomTab';
import { SalesRoomPathwaysManager } from '@/components/opportunities/SalesRoomPathwaysManager';
import ActivityTimelineTab from '@/components/opportunities/ActivityTimelineTab';
import { ContactOverview } from '@/components/opportunities/ContactOverview';
import { useSalesRoomByOpportunity } from '@/hooks/useSalesRoom';
import { useActivityOperations } from '@/hooks/useActivityOperations';
import { useCalendarOperations } from '@/hooks/useCalendarOperations';
import { useEmailOperations } from '@/hooks/useEmailOperations';
import DOMPurify from 'dompurify';

type TabType = 'overview' | 'activity' | 'data-room' | 'pathways';

function convertMarkdownToHtml(markdown: string): string {
  const convertLinks = (text: string) =>
    text.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">$1</a>'
    );

  const lines = markdown.split(/\r?\n/);
  let html = '';
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      html += '</ul>';
      inUl = false;
    }
    if (inOl) {
      html += '</ol>';
      inOl = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      closeLists();
      continue;
    }

    if (/^-\s+/.test(trimmed)) {
      if (!inUl) {
        closeLists();
        html += '<ul class="list-disc pl-5 space-y-1">';
        inUl = true;
      }
      const content = convertLinks(trimmed.replace(/^-\s+/, ''));
      html += `<li>${content}</li>`;
      continue;
    }

    if (/^\d+\)\s+/.test(trimmed)) {
      if (!inOl) {
        closeLists();
        html += '<ol class="list-decimal pl-5 space-y-1">';
        inOl = true;
      }
      const content = convertLinks(trimmed.replace(/^\d+\)\s+/, ''));
      html += `<li>${content}</li>`;
      continue;
    }

    // Default paragraph
    closeLists();
    html += `<p class="mb-2">${convertLinks(trimmed)}</p>`;
  }

  closeLists();
  return DOMPurify.sanitize(html);
}

const OpportunityViewPage: React.FC = () => {
  const { opportunityId, pipelineId } = useParams<{ opportunityId: string; pipelineId: string }>();
  const navigate = useNavigate();
  const { setActions, setActionGroups, clearActions } = usePageActions();
  const { removeContactFromOpportunity, getOpportunityById, getOpportunityProcessingStatus } = useOpportunityOperations();
  const { useContactsByProspect, updateOpportunityContacts } = useContactOperations();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const isMobile = useIsMobile();
  const [isIntelligenceExpanded, setIsIntelligenceExpanded] = useState(false);

  // Fetch opportunity details using useOpportunityOperations hook
  const opportunityQuery = getOpportunityById(opportunityId || '');
  const { 
    data: opportunity, 
    isLoading, 
    error,
    refetch 
  } = opportunityQuery;
  const prospectId =
    typeof opportunity?.prospect === 'string'
      ? opportunity.prospect
      : opportunity?.prospect?._id || '';
  const contactsByProspectQuery = useContactsByProspect(prospectId);
  const availableContacts = contactsByProspectQuery.data || [];

  // Fetch opportunity processing status
  const processingStatusQuery = opportunityId 
    ? getOpportunityProcessingStatus(opportunityId)
    : { data: null, isLoading: false, error: null };

  // Fetch sales room data for pathways tab
  const salesRoomQuery = useSalesRoomByOpportunity(opportunityId || '');
  const currentSalesRoom = salesRoomQuery.data;

  // Fetch activity data for timeline tab
  const { 
    activities, 
    isLoadingActivities, 
    activitiesError 
  } = useActivityOperations({ entityType: 'opportunity', entityId: opportunityId || '' });
  
  const { 
    meetings, 
    isLoadingMeetings, 
    meetingsError 
  } = useCalendarOperations({ entityType: 'opportunity', entityId: opportunityId || '' });
  
  const { 
    emailActivities, 
    isLoadingEmailActivities, 
    emailActivitiesError 
  } = useEmailOperations({ entityType: 'opportunity', entityId: opportunityId || '' });

  // Setup page actions based on selected contact
  useEffect(() => {
    if (!opportunity) return;

    // If a contact is selected, show contact-specific actions
    if (selectedContact) {
      setActions([
        {
          id: 'edit-contact',
          label: 'Edit Contact',
          icon: Pencil,
          onClick: () => {
            navigate(`/pipeline/${pipelineId}/opportunity/${opportunityId}/edit-contact/${selectedContact._id}`);
          },
          variant: 'default'
        }
      ]);

      // Clear action groups when viewing contact
      setActionGroups([]);
    } else {
      // Show opportunity actions when no contact is selected
      setActions([
        {
          id: 'add-activity',
          label: 'Add Activity',
          icon: Plus,
          onClick: () => {
            navigate(`/pipeline/${pipelineId}/opportunity/${opportunityId}/add-activity`);
          },
          variant: 'default'
        }
      ]);

      // Clear action groups (edit/delete not yet implemented)
      setActionGroups([]);
    }

    return () => {
      clearActions();
    };
  }, [opportunity, selectedContact, opportunityId, navigate, setActions, setActionGroups, clearActions]);

  // Sync selectedContact with updated data from opportunity
  useEffect(() => {
    if (selectedContact && opportunity?.contacts) {
      const updatedContact = opportunity.contacts.find(
        (c: any) => c._id === selectedContact._id
      );
      if (updatedContact) {
        setSelectedContact(updatedContact);
      }
    }
  }, [opportunity?.contacts, selectedContact?._id]);

  if (isLoading) {
    return (
      <div className={`h-full ${isMobile ? 'flex flex-col overflow-y-auto' : 'flex overflow-hidden'}`}>
        <OpportunitySidebar opportunity={null} isLoading={true} />
        <div className={`flex-1 flex flex-col p-4 ${isMobile ? '' : 'overflow-hidden'}`}>
          {/* Header Skeleton */}
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-6 w-32" />
            </div>
          </div>

          {/* Tab Navigation Skeleton */}
          <div className={`flex gap-2 border-b border-gray-200 pb-3 mb-4 ${isMobile ? 'overflow-x-auto' : ''}`}>
            <Skeleton className="h-7 w-20 rounded-md flex-shrink-0" />
            <Skeleton className="h-7 w-18 rounded-md flex-shrink-0" />
            <Skeleton className="h-7 w-24 rounded-md flex-shrink-0" />
            <Skeleton className="h-7 w-20 rounded-md flex-shrink-0" />
          </div>
          {/* Content Skeleton */}
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-4">
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <Skeleton className="h-3 w-64 mt-1" />
                <div className="space-y-3 mt-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`h-full ${isMobile ? 'flex flex-col overflow-y-auto' : 'flex overflow-hidden'}`}>
        <OpportunitySidebar opportunity={null} isLoading={false} />
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="text-center">
            <h1 className="text-sm font-medium text-gray-900 mb-2">
              Error Loading Opportunity
            </h1>
            <p className="text-red-600 text-xs mb-4">
              {error instanceof Error ? error.message : 'Failed to load opportunity'}
            </p>
            <button 
              onClick={() => refetch()}
              className="px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!opportunity) {
    return (
      <div className={`h-full ${isMobile ? 'flex flex-col overflow-y-auto' : 'flex overflow-hidden'}`}>
        <OpportunitySidebar opportunity={null} isLoading={false} />
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="text-center">
            <h1 className="text-sm font-medium text-gray-900 mb-2">
              Opportunity Not Found
            </h1>
            <p className="text-gray-600 text-xs">
              The opportunity you're looking for doesn't exist or has been removed.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleRemoveContact = async (contactId: string) => {
    if (!opportunityId) {
      console.error('No opportunity ID available');
      return;
    }

    try {
      const result = await removeContactFromOpportunity(opportunityId, contactId);
      if (result.success) {
        // Refetch the opportunity data to update the sidebar
        refetch();
      } else {
        console.error('Failed to remove contact:', result.error);
      }
    } catch (error) {
      console.error('Error removing contact:', error);
    }
  };

  const handleAddContact = () => {
    if (opportunityId) {
      navigate(`/pipeline/${pipelineId}/opportunity/${opportunityId}/add-contact`);
    }
  };

  const handleQuickAddContact = async (contactId: string) => {
    if (!opportunityId || !opportunity) {
      console.error('No opportunity data available');
      return;
    }

    const existingIds = (opportunity.contacts || []).map((contact: any) => contact._id);
    if (existingIds.includes(contactId)) {
      return;
    }

    try {
      await updateOpportunityContacts(opportunityId, [...existingIds, contactId]);
      refetch();
    } catch (error) {
      console.error('Failed to add contact:', error);
    }
  };

  const handleContactClick = (contact: any) => {
    setSelectedContact(contact);
  };

  const handleBackFromContact = () => {
    setSelectedContact(null);
  };

  return (
    <div className={`h-full ${isMobile ? 'flex flex-col overflow-y-auto' : 'flex overflow-hidden'}`}>
      <OpportunitySidebar 
        opportunity={opportunity as any} 
        isLoading={false} 
        onRemoveContact={handleRemoveContact}
        onAddContact={handleAddContact}
        onContactClick={handleContactClick}
        availableContacts={availableContacts}
        isLoadingAvailableContacts={contactsByProspectQuery.isLoading}
        onQuickAddContact={handleQuickAddContact}
      />
      {selectedContact ? (
        <ContactOverview
          contact={selectedContact}
          opportunityId={opportunityId || ''}
          onBack={handleBackFromContact}
        />
      ) : (
        <div className={`flex-1 flex flex-col ${isMobile ? '' : 'overflow-hidden'}`}>
          <div className="p-4">
            {/* Header with Processing Status */}
            <div className="mb-4">
              <div className="flex items-center justify-between">
                <h1 className="text-lg font-semibold text-gray-900">
                  {opportunity.name}
                </h1>
                {processingStatusQuery.data && (
                  <ProcessingStatusIndicator 
                    status={processingStatusQuery.data}
                    isLoading={processingStatusQuery.isLoading}
                  />
                )}
              </div>
            </div>

            {/* Tab Navigation */}
            <div className={`flex gap-2 border-b border-gray-200 pb-3 ${isMobile ? 'overflow-x-auto' : ''}`}>
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 flex-shrink-0 ${
                  activeTab === 'overview' 
                    ? 'bg-gray-900 text-white' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('activity')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 flex-shrink-0 ${
                  activeTab === 'activity' 
                    ? 'bg-gray-900 text-white' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Activity
              </button>
              <button
                onClick={() => setActiveTab('data-room')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 flex-shrink-0 ${
                  activeTab === 'data-room' 
                    ? 'bg-gray-900 text-white' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Data Room
              </button>
              <button
                onClick={() => setActiveTab('pathways')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 flex-shrink-0 ${
                  activeTab === 'pathways' 
                    ? 'bg-gray-900 text-white' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Pathways
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className={`flex-1 p-4 pt-0 ${isMobile ? '' : 'overflow-y-auto'}`}>
            {activeTab === 'overview' && (
              <div className="space-y-4">
                {/* Deal Narrative Section */}
                <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                  <div className="p-4 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-600" />
                      <h3 className="text-sm font-medium text-gray-900">Opportunity Overview</h3>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Latest summary and insights for this opportunity
                    </p>
                  </div>
                  <div className="p-4">
                    {opportunity.latestDealNarrative ? (
                      <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-900">
                        {opportunity.latestDealNarrative}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <FileText className="h-8 w-8 text-gray-400 mb-3" />
                        <p className="text-gray-600 text-sm font-medium">
                          No deal narrative available yet
                        </p>
                        <p className="text-gray-500 text-xs mt-1">
                          The deal narrative will be generated based on activities and insights
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'activity' && (
              <ActivityTimelineTab
                activities={activities}
                meetings={meetings}
                emailActivities={emailActivities}
                isLoadingActivities={isLoadingActivities}
                isLoadingMeetings={isLoadingMeetings}
                isLoadingEmailActivities={isLoadingEmailActivities}
                activitiesError={activitiesError}
                meetingsError={meetingsError}
                emailActivitiesError={emailActivitiesError}
              />
            )}
            
            {activeTab === 'data-room' && (
              <SalesRoomTab opportunityId={opportunityId!} />
            )}

            {activeTab === 'pathways' && (
              currentSalesRoom ? (
                <SalesRoomPathwaysManager salesRoomId={currentSalesRoom._id} />
              ) : (
                <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
                  <MapIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-sm font-medium text-gray-900 mb-2">No Data Room Found</h3>
                  <p className="text-xs text-gray-500 mb-4">
                    You need to create a data room first to manage pathways for this opportunity.
                  </p>
                  <button
                    onClick={() => setActiveTab('data-room')}
                    className="px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors"
                  >
                    Go to Data Room
                  </button>
                </div>
              )
            )}
            
            {activeTab === 'overview' && opportunity?.description && (
              <div className="space-y-4 mt-4">
                {/* Opportunity Intelligence Section (Collapsible) */}
                <div className="bg-white rounded-lg border border-gray-200">
                  <button
                    onClick={() => setIsIntelligenceExpanded(!isIntelligenceExpanded)}
                    className="w-full p-4 border-b border-gray-200 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-purple-600" />
                        <Lightbulb className="h-4 w-4 text-gray-600" />
                        <h3 className="text-sm font-medium text-gray-900">Business Intelligence</h3>
                      </div>
                      {isIntelligenceExpanded ? (
                        <ChevronUp className="h-4 w-4 text-gray-600" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-600" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Research and insights about the prospect
                    </p>
                  </button>
                  {isIntelligenceExpanded && (
                    <div className="p-4 text-sm leading-relaxed text-gray-900">
                      <div
                        dangerouslySetInnerHTML={{
                          __html: convertMarkdownToHtml(opportunity.description || ''),
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OpportunityViewPage;
