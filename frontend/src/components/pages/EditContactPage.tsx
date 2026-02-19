import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ContactForm } from '@/components/opportunities/ContactForm';
import { useOpportunityOperations } from '@/hooks/useOpportunityOperations';
import { Contact } from '@/types/prospect';
import { Loader2 } from "lucide-react";
import { requestWithAuth } from '@/hooks/requestWithAuth';

const EditContactPage: React.FC = () => {
  const navigate = useNavigate();
  const { opportunityId, contactId, pipelineId } = useParams<{ opportunityId: string; contactId: string; pipelineId: string }>();
  const [contact, setContact] = useState<Contact | null>(null);
  const [prospectId, setProspectId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { getOpportunityById } = useOpportunityOperations();

  // Get the current opportunity to extract prospect ID
  const opportunityQuery = getOpportunityById(opportunityId || '');
  const { data: currentOpportunity, isLoading: isLoadingOpportunity } = opportunityQuery;

  useEffect(() => {
    // Handle both populated and unpopulated prospect
    const prospectId = typeof currentOpportunity?.prospect === 'string' 
      ? currentOpportunity.prospect 
      : currentOpportunity?.prospect?._id;
    
    if (prospectId) {
      setProspectId(prospectId);
    }
  }, [currentOpportunity]);

  useEffect(() => {
    const fetchContact = async () => {
      if (!contactId) {
        setError('No contact ID provided');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const { data, error: apiError } = await requestWithAuth(
          `api/contacts/${contactId}`,
          'GET',
          null
        );

        if (apiError) {
          throw new Error(apiError);
        }

        // Handle different possible data structures from API
        const contactData = data?.data || data;
        setContact(contactData);
        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load contact';
        setError(errorMessage);
        console.error('Error fetching contact:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchContact();
  }, [contactId]);

  const handleUpdateSuccess = () => {
    // Navigate back to opportunity view
    navigate(`/pipeline/${pipelineId}/opportunity/${opportunityId}`);
  };

  const handleDelete = () => {
    // Navigate back to opportunity view after deletion
    navigate(`/pipeline/${pipelineId}/opportunity/${opportunityId}`);
  };

  if (isLoadingOpportunity || isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading contact...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <button
            onClick={() => navigate(`/pipeline/${pipelineId}/opportunity/${opportunityId}`)}
            className="px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors"
          >
            Back to Opportunity
          </button>
        </div>
      </div>
    );
  }

  if (!currentOpportunity) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Opportunity not found</p>
        </div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Contact not found</p>
          <button
            onClick={() => navigate(`/pipeline/${pipelineId}/opportunity/${opportunityId}`)}
            className="mt-4 px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors"
          >
            Back to Opportunity
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-4">
          <div className="mb-4">
            <h1 className="text-sm font-medium text-gray-900">Edit Contact</h1>
            <p className="text-xs text-gray-500 mt-1">
              Update contact information for {contact.firstName} {contact.lastName}
            </p>
          </div>

          <ContactForm
            contact={contact}
            prospectId={prospectId}
            onSuccess={handleUpdateSuccess}
            onDelete={handleDelete}
          />
        </div>
      </div>
    </div>
  );
};

export default EditContactPage;

