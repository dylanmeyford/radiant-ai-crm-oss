import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queryKeys';
import { requestWithAuth } from '@/hooks/requestWithAuth';
import { usePageActions } from '@/context/PageActionsContext';
import { ActivityForm } from '@/components/opportunities/ActivityForm';
import { OpportunityData } from '@/types/pipeline';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';

const AddActivityPage: React.FC = () => {
  const navigate = useNavigate();
  const { opportunityId, pipelineId } = useParams<{ opportunityId: string; pipelineId: string }>();
  const { clearActions } = usePageActions();

  // Fetch opportunity details for context
  const { 
    data: opportunity, 
    isLoading, 
    error 
  } = useQuery<OpportunityData>({
    queryKey: queryKeys.opportunities.detail(opportunityId || ''),
    queryFn: async () => {
      if (!opportunityId) throw new Error('No opportunity ID provided');
      
      const { data, error: apiError } = await requestWithAuth(
        `api/opportunities/${opportunityId}`, 
        "GET", 
        null
      );
      
      if (apiError) throw new Error(apiError);
      
      // Handle nested data structure
      if (data && data.data && data.data._id) {
        return data.data as OpportunityData;
      }
      if (data && data._id) {
        return data as OpportunityData;
      }
      
      throw new Error('Invalid opportunity data received');
    },
    enabled: !!opportunityId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Clear any page actions since this is a form page
  useEffect(() => {
    clearActions();
    return () => {
      clearActions();
    };
  }, [clearActions]);

  const handleSuccess = () => {
    // Navigate back to the opportunity view page
    navigate(`/pipeline/${pipelineId}/opportunity/${opportunityId}`);
  };

  const handleCancel = () => {
    // Navigate back to the opportunity view page
    navigate(`/pipeline/${pipelineId}/opportunity/${opportunityId}`);
  };

  if (isLoading) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4 max-w-4xl mx-auto">
            <div className="space-y-2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="space-y-4 max-w-2xl">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-10 w-24" />
                <Skeleton className="h-10 w-24" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !opportunity) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="h-8 w-8 text-red-400 mb-3" />
              <p className="text-red-600 text-sm font-medium">
                Error loading opportunity
              </p>
              <p className="text-red-500 text-xs mt-1">
                {error?.message || 'Unable to load opportunity details'}
              </p>
              <button
                onClick={handleCancel}
                className="mt-4 text-blue-600 hover:text-blue-700 text-sm underline"
              >
                Go back to opportunity
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4 max-w-4xl mx-auto">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-gray-900">Add Activity</h1>
            <p className="text-gray-600">
              Add a new activity for <span className="font-medium">{opportunity.name}</span>
            </p>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <ActivityForm
              opportunityId={opportunityId!}
              opportunity={opportunity}
              onSuccess={handleSuccess}
              onCancel={handleCancel}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddActivityPage;

