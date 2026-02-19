import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { OpportunityForm } from '@/components/opportunities/OpportunityForm';

const NewOpportunityPage: React.FC = () => {
  const navigate = useNavigate();
  const { pipelineId } = useParams<{ pipelineId: string }>();

  const handleSuccess = () => {
    // Navigate back to pipeline after successful creation
    navigate(`/pipeline/${pipelineId}`);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Form Content - Scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-4">
          <div className="mb-4">
            <h1 className="text-sm font-medium text-gray-900">Add New Opportunity</h1>
            <p className="text-xs text-gray-500 mt-1">
              Create a new sales opportunity and track it through your pipeline
            </p>
          </div>
          <OpportunityForm onSuccess={handleSuccess} pipelineId={pipelineId} />
        </div>
      </div>
    </div>
  );
};

export default NewOpportunityPage;
