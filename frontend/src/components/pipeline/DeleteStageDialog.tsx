import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, AlertTriangle } from 'lucide-react';
import { PipelineStage } from '@/types/pipeline';
import { usePipelineStages } from '@/hooks/usePipelineStages';

interface DeleteStageDialogProps {
  stage: PipelineStage | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId?: string;
}

export const DeleteStageDialog: React.FC<DeleteStageDialogProps> = ({
  stage,
  open,
  onOpenChange,
  pipelineId,
}) => {
  const { deleteStage, isDeleting, error } = usePipelineStages(pipelineId);
  const [localError, setLocalError] = React.useState<string | null>(null);

  const opportunityCount = stage?.opportunities?.length || 0;
  const canDelete = opportunityCount === 0 && !stage?.isClosedWon && !stage?.isClosedLost;

  const handleDelete = async () => {
    if (!stage || !canDelete) return;

    setLocalError(null);
    const result = await deleteStage(stage._id);
    
    if (result.success) {
      onOpenChange(false);
    } else {
      setLocalError(result.error || 'Failed to delete stage');
    }
  };

  // Reset error when dialog closes
  React.useEffect(() => {
    if (!open) {
      setLocalError(null);
    }
  }, [open]);

  if (!stage) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Delete Stage
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3 pt-2">
            {canDelete ? (
              <>
                <p>
                  Are you sure you want to delete the stage{' '}
                  <span className="font-semibold text-gray-900">"{stage.name}"</span>?
                </p>
                <p>This action cannot be undone.</p>
              </>
            ) : (
              <>
                {stage.isClosedWon || stage.isClosedLost ? (
                  <p className="text-red-600 font-medium">
                    Cannot delete this stage. {stage.isClosedWon ? 'Closed Won' : 'Closed Lost'}{' '}
                    stages are protected and cannot be removed.
                  </p>
                ) : (
                  <p className="text-red-600 font-medium">
                    Cannot delete this stage. There {opportunityCount === 1 ? 'is' : 'are'}{' '}
                    <span className="font-bold">{opportunityCount}</span>{' '}
                    {opportunityCount === 1 ? 'opportunity' : 'opportunities'} currently in this
                    stage.
                  </p>
                )}
                <p className="text-sm">
                  Please move {opportunityCount === 1 ? 'it' : 'them'} to another stage before
                  deleting.
                </p>
              </>
            )}
            
            {(localError || error) && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                {localError || error}
              </p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          {canDelete && (
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Stage
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

