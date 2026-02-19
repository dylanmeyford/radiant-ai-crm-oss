import React, { useState, useEffect } from 'react';
import { Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { PipelineStage } from '@/types/pipeline';
import { usePipelineStages } from '@/hooks/usePipelineStages';

interface StageEditDropdownProps {
  stage: PipelineStage;
  onClose: () => void;
  pipelineId?: string;
}

export const StageEditDropdown: React.FC<StageEditDropdownProps> = ({
  stage,
  onClose,
  pipelineId,
}) => {
  const [name, setName] = useState(stage.name);
  const [description, setDescription] = useState(stage.description || '');
  const [error, setError] = useState<string | null>(null);
  
  const { updateStage, isUpdating } = usePipelineStages(pipelineId);

  // Reset when stage changes
  useEffect(() => {
    setName(stage.name);
    setDescription(stage.description || '');
    setError(null);
  }, [stage]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Stage name is required');
      return;
    }

    if (name.length > 50) {
      setError('Name must be 50 characters or less');
      return;
    }

    if (description.length > 200) {
      setError('Description must be 200 characters or less');
      return;
    }

    setError(null);
    const result = await updateStage(stage._id, {
      name: name.trim(),
      description: description.trim(),
    });

    if (result.success) {
      onClose();
    } else {
      setError(result.error || 'Failed to update stage');
    }
  };

  const handleCancel = () => {
    setName(stage.name);
    setDescription(stage.description || '');
    setError(null);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSave();
    }
  };

  const isProtected = stage.isClosedWon || stage.isClosedLost;

  return (
    <div 
      className="absolute top-full right-0 mt-1 w-80 bg-white rounded-lg border border-gray-200 shadow-lg z-50 p-4"
      onKeyDown={handleKeyDown}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-900">Edit Stage</h3>
          <button
            onClick={handleCancel}
            disabled={isUpdating}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">
              Stage Name
            </label>
            <Input
              placeholder="Enter stage name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              disabled={isUpdating || isProtected}
              autoFocus
              maxLength={50}
            />
          </div>
          
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">
              Description <span className="text-gray-400 font-normal">(Tell AI when to move)</span>
            </label>
            <Textarea
              placeholder="Add a description..."
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setError(null);
              }}
              disabled={isUpdating}
              className="resize-none text-sm"
              rows={3}
              maxLength={200}
            />
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
            {error}
          </p>
        )}

        {isProtected && (
          <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded px-2 py-1">
            Stage name cannot be changed for protected stages
          </p>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleSave}
            disabled={isUpdating || !name.trim()}
            size="sm"
            className="flex-1"
          >
            {isUpdating && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
            Save
          </Button>
          <Button
            onClick={handleCancel}
            disabled={isUpdating}
            variant="outline"
            size="sm"
          >
            Cancel
          </Button>
        </div>

        <p className="text-xs text-gray-500 text-center">
          ⌘+Enter to save • Esc to cancel
        </p>
      </div>
    </div>
  );
};

