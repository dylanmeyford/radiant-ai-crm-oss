import React, { useState } from 'react';
import { Plus, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { usePipelineStages } from '@/hooks/usePipelineStages';

interface AddStageColumnProps {
  nextOrder: number;
  pipelineId?: string;
}

export const AddStageColumn: React.FC<AddStageColumnProps> = ({ nextOrder, pipelineId }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const { createStage, isCreating: isSubmitting } = usePipelineStages(pipelineId);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Stage name is required');
      return;
    }

    setError(null);
    const result = await createStage({
      name: name.trim(),
      order: nextOrder,
      description: description.trim(),
    });

    if (result.success) {
      // Reset form
      setName('');
      setDescription('');
      setIsCreating(false);
    } else {
      setError(result.error || 'Failed to create stage');
    }
  };

  const handleCancel = () => {
    setName('');
    setDescription('');
    setError(null);
    setIsCreating(false);
  };

  if (!isCreating) {
    return (
      <div className="flex-shrink-0 w-72">
        <button
          onClick={() => setIsCreating(true)}
          className="h-full w-full min-h-[300px] rounded-lg border-2 border-dashed border-gray-300 hover:border-gray-400 transition-colors flex flex-col items-center justify-center gap-2 text-gray-400 hover:text-gray-600 group"
        >
          <div className="rounded-full bg-gray-100 group-hover:bg-gray-200 p-3 transition-colors">
            <Plus className="h-6 w-6" />
          </div>
          <span className="text-sm font-medium">Add Stage</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 w-72">
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900">New Stage</h3>
            <button
              onClick={handleCancel}
              disabled={isSubmitting}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2">
            <Input
              placeholder="Stage name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              disabled={isSubmitting}
              autoFocus
              maxLength={50}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleCreate();
                }
              }}
            />
            
            <Textarea
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
              className="resize-none text-sm"
              rows={2}
              maxLength={200}
            />
          </div>

          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleCreate}
              disabled={isSubmitting || !name.trim()}
              size="sm"
              className="flex-1"
            >
              {isSubmitting && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Create
            </Button>
            <Button
              onClick={handleCancel}
              disabled={isSubmitting}
              variant="outline"
              size="sm"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

