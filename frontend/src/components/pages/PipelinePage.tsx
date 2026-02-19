import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Skeleton } from '../ui/skeleton';
import { useOpportunityOperations } from '../../hooks/useOpportunityOperations';
import { usePipelineStages } from '../../hooks/usePipelineStages';
import { Plus, Loader2, GripVertical } from 'lucide-react';
import { usePageActions } from '@/context/PageActionsContext';
import { Opportunity, PipelineStage } from '@/types/pipeline';
import { StageMenu } from '@/components/pipeline/StageMenu';
import { DeleteStageDialog } from '@/components/pipeline/DeleteStageDialog';
import { AddStageColumn } from '@/components/pipeline/AddStageColumn';

// Color scheme for stages
const getStageColor = (stage: PipelineStage, index: number) => {
  if (stage.isClosedWon) return 'bg-green-400';
  if (stage.isClosedLost) return 'bg-red-400';
  // Generate from palette based on index
  const colors = ['bg-blue-400', 'bg-purple-400', 'bg-orange-400', 'bg-yellow-400', 'bg-pink-400', 'bg-indigo-400'];
  return colors[index % colors.length];
};

const OpportunityCard: React.FC<{ 
  opportunity: Opportunity; 
  index: number; 
  isUpdating?: boolean;
  onCardClick?: (opportunityId: string) => void;
}> = ({ 
  opportunity, 
  index,
  isUpdating = false,
  onCardClick
}) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <Draggable draggableId={opportunity._id} index={index}>
      {(provided, snapshot) => {
        const handleCardClick = (e: React.MouseEvent) => {
          // Only trigger click if not dragging and onCardClick is provided
          if (!snapshot.isDragging && onCardClick) {
            e.stopPropagation();
            onCardClick(opportunity._id);
          }
        };

        return (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={handleCardClick}
          className={`mb-3 p-3 rounded-lg border cursor-grab active:cursor-grabbing transition-all duration-200 bg-white ${
            snapshot.isDragging ? 'shadow-lg border-gray-300' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
          } ${isUpdating ? 'ring-1 ring-blue-300 bg-blue-50/50' : ''} ${onCardClick ? 'hover:cursor-pointer' : ''}`}
        >
          <div className="space-y-2">
            {/* Title and Amount */}
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2 flex-1 pr-2">
                <h3 className="font-medium text-sm text-gray-900 leading-tight">
                  {opportunity.name}
                </h3>
                {isUpdating && (
                  <Loader2 className="h-3 w-3 text-blue-500 animate-spin flex-shrink-0" />
                )}
              </div>
              <div className="text-gray-900 font-medium text-sm">
                {formatCurrency(opportunity.amount)}
              </div>
            </div>

            {/* Company */}
            <div className="text-gray-600 text-xs">
              {opportunity.prospect?.name}
            </div>
          </div>
        </div>
        );
      }}
    </Draggable>
  );
};

const PipelineStageColumn: React.FC<{ 
  stage: PipelineStage; 
  index: number;
  isLoading: boolean;
  isReordering?: boolean;
  updatingOpportunityId?: string;
  onOpportunityClick?: (opportunityId: string) => void;
  onDelete: () => void;
  dragHandleProps?: any;
  pipelineId?: string;
}> = ({ 
  stage, 
  index,
  isLoading, 
  isReordering = false,
  updatingOpportunityId, 
  onOpportunityClick,
  onDelete,
  dragHandleProps,
  pipelineId,
}) => {
  const totalValue = stage.opportunities.reduce((sum, opp) => sum + opp.amount, 0);
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const color = getStageColor(stage, index);

  return (
    <div className={`flex-shrink-0 w-72 transition-all duration-200 ${
      isReordering ? 'ring-2 ring-blue-200' : ''
    }`}>
      <div className="h-full">
        {/* Stage Header */}
        <div className={`mb-4 pb-3 border-b border-gray-200 transition-colors ${
          isReordering ? 'bg-blue-50/30' : ''
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1">
              <div 
                {...(dragHandleProps || {})}
                className="cursor-grab active:cursor-grabbing hover:bg-gray-100 p-1 rounded transition-colors"
              >
                <GripVertical className="h-4 w-4 text-gray-400" />
              </div>
              <div className={`w-2 h-2 rounded-full ${color}`} />
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <h2 className="text-sm font-medium text-gray-900 truncate">{stage.name}</h2>
                {isReordering && (
                  <Loader2 className="h-3 w-3 text-blue-500 animate-spin flex-shrink-0" />
                )}
              </div>
            </div>
            <StageMenu
              stage={stage}
              onDelete={onDelete}
              pipelineId={pipelineId}
            />
          </div>
          <div className="text-xs text-gray-600 mt-1 ml-7">
            {formatCurrency(totalValue)}
          </div>
        </div>
        
        {/* Drop Zone */}
        <Droppable droppableId={stage._id}>
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={`min-h-[300px] transition-colors ${
                snapshot.isDraggingOver ? 'bg-gray-50/50 rounded-lg' : ''
              }`}
            >
              {isLoading ? (
                // Loading skeletons
                Array.from({ length: 2 }).map((_, index) => (
                  <div key={index} className="mb-3">
                    <Skeleton className="h-20 w-full rounded-lg" />
                  </div>
                ))
              ) : stage.opportunities.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  Drop opportunity here
                </div>
              ) : (
                stage.opportunities.map((opportunity, index) => (
                  <OpportunityCard
                    key={opportunity._id}
                    opportunity={opportunity}
                    index={index}
                    isUpdating={updatingOpportunityId === opportunity._id}
                    onCardClick={onOpportunityClick}
                  />
                ))
              )}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </div>
    </div>
  );
};

const PipelinePage: React.FC = () => {
  const [updatingOpportunityId, setUpdatingOpportunityId] = useState<string | null>(null);
  const [deletingStage, setDeletingStage] = useState<PipelineStage | null>(null);
  const [reorderingStageId, setReorderingStageId] = useState<string | null>(null);
  
  const navigate = useNavigate();
  const { pipelineId } = useParams<{ pipelineId: string }>();

  const { 
    opportunities,
    isLoadingOpportunities,
    opportunitiesError,
    updateOpportunityStage
  } = useOpportunityOperations();
  
  const {
    pipelineStages,
    isLoadingStages,
    stagesError,
    reorderStages,
  } = usePipelineStages(pipelineId);
  
  const { setActions, clearActions } = usePageActions();

  // Organize opportunities by stage with colors
  const stages = useMemo(() => {
    return pipelineStages.map((stage: PipelineStage, index: number) => ({
      ...stage,
      opportunities: opportunities.filter((opp: Opportunity) => {
        // Handle both populated stage objects and stage ID strings
        const oppStageId = typeof opp.stage === 'string' ? opp.stage : opp.stage?._id;
        return oppStageId === stage._id;
      }),
      color: getStageColor(stage, index)
    }));
  }, [pipelineStages, opportunities]);

  // Calculate next order for new stages
  const nextOrder = useMemo(() => {
    if (pipelineStages.length === 0) return 1;
    return Math.max(...pipelineStages.map((s: PipelineStage) => s.order)) + 1;
  }, [pipelineStages]);

  // Handle opportunity card click to navigate to opportunity view
  const handleOpportunityClick = (opportunityId: string) => {
    navigate(`/pipeline/${pipelineId}/opportunity/${opportunityId}`);
  };

  // Setup page actions
  useEffect(() => {
    setActions([
      {
        id: 'add-opportunity',
        label: 'Add Opportunity',
        icon: Plus,
        onClick: () => navigate(`/pipeline/${pipelineId}/new-opportunity`),
        variant: 'default'
      }
    ]);

    return () => {
      clearActions();
    };
  }, [navigate, pipelineId, setActions, clearActions]);

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    // If no destination, do nothing
    if (!destination) return;

    // If dropped in the same position, do nothing
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    // Set updating state for visual feedback
    setUpdatingOpportunityId(draggableId);

    try {
      // TanStack Query will handle optimistic updates automatically
      const result = await updateOpportunityStage(draggableId, destination.droppableId);
      if (!result.success) {
        console.error('Failed to update opportunity stage:', result.error);
      }
    } catch (error) {
      console.error('Error updating opportunity stage:', error);
    } finally {
      // Clear the updating state
      setUpdatingOpportunityId(null);
    }
  };

  if (opportunitiesError || stagesError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-600 font-medium">Error loading pipeline</p>
          <p className="text-gray-500 text-sm mt-1">
            {opportunitiesError?.message || stagesError?.message}
          </p>
        </div>
      </div>
    );
  }

  const handleStageDragEnd = async (result: DropResult) => {
    const { destination, source, type } = result;

    // Only handle stage reordering
    if (type !== 'STAGE') return;

    // If no destination, do nothing
    if (!destination) return;

    // If dropped in the same position, do nothing
    if (destination.index === source.index) return;

    // Create new array with reordered stages
    const reorderedStages = Array.from(pipelineStages) as PipelineStage[];
    const [movedStage] = reorderedStages.splice(source.index, 1);
    reorderedStages.splice(destination.index, 0, movedStage);

    // Track which stage is being reordered for visual feedback
    setReorderingStageId(movedStage._id);

    // Create reorder array with new positions
    const reorderArray = reorderedStages.map((stage: PipelineStage, index: number) => ({
      id: stage._id,
      order: index + 1
    }));

    try {
      // TanStack Query will handle optimistic updates automatically
      const result = await reorderStages(reorderArray);
      if (!result.success) {
        console.error('Failed to reorder stages:', result.error);
      }
    } catch (error) {
      console.error('Error reordering stages:', error);
    } finally {
      // Clear the reordering state
      setReorderingStageId(null);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden p-4">
      {/* Pipeline - Scrollable Area */}
      <div className="flex-1 overflow-hidden">
        <DragDropContext 
          onDragEnd={(result) => {
            if (result.type === 'STAGE') {
              handleStageDragEnd(result);
            } else {
              handleDragEnd(result);
            }
          }}
        >
          <Droppable droppableId="all-stages" direction="horizontal" type="STAGE">
            {(provided) => (
              <div 
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="flex gap-6 overflow-x-auto h-full px-6 pb-6"
              >
                {isLoadingStages ? (
                  // Loading skeleton for stages
                  Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="flex-shrink-0 w-72">
                      <Skeleton className="h-full min-h-[400px] rounded-lg" />
                    </div>
                  ))
                ) : (
                  <>
                    {stages.map((stage: PipelineStage, index: number) => (
                      <Draggable 
                        key={stage._id} 
                        draggableId={`stage-${stage._id}`} 
                        index={index}
                        isDragDisabled={stage.isClosedWon || stage.isClosedLost}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`flex-shrink-0 w-72 ${
                              snapshot.isDragging ? 'opacity-50' : ''
                            }`}
                          >
                            <PipelineStageColumn
                              stage={stage}
                              index={index}
                              isLoading={isLoadingOpportunities}
                              isReordering={reorderingStageId === stage._id}
                              updatingOpportunityId={updatingOpportunityId || undefined}
                              onOpportunityClick={handleOpportunityClick}
                              onDelete={() => {
                                setDeletingStage(stage);
                              }}
                              dragHandleProps={provided.dragHandleProps}
                              pipelineId={pipelineId}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    <AddStageColumn nextOrder={nextOrder} pipelineId={pipelineId} />
                  </>
                )}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>

      {/* Dialogs */}
      <DeleteStageDialog
        stage={deletingStage}
        open={!!deletingStage}
        onOpenChange={(open) => !open && setDeletingStage(null)}
        pipelineId={pipelineId}
      />
    </div>
  );
};

export default PipelinePage;
