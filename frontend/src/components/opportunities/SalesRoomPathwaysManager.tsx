import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { usePathways, PathwayProgress } from '@/hooks/usePathways';
import { PlusCircle, CheckCircle, Circle, Clock, ArrowRight, Loader2 } from 'lucide-react';

interface PathwayStep {
  name: string;
  description: string;
}

interface SalesRoomPathwaysManagerProps {
  salesRoomId: string;
}

export function SalesRoomPathwaysManager({ salesRoomId }: SalesRoomPathwaysManagerProps) {
  const [selectedPathwayId, setSelectedPathwayId] = useState<string>('');
  const [newPathwayName, setNewPathwayName] = useState('');
  const [newPathwayDescription, setNewPathwayDescription] = useState('');
  const [pathwaySteps, setPathwaySteps] = useState<PathwayStep[]>([{ name: '', description: '' }]);
  const [isCreatePathwayMode, setIsCreatePathwayMode] = useState(false);
  
  const { 
    pathways,
    isLoadingPathways,
    pathwaysError,
    getPathwayProgressQuery,
    createPathway,
    assignPathwayToSalesRoom,
    updateSalesRoomPathwayProgress,
    initializePathwayProgress,
    isCreating,
    isAssigning,
    isUpdatingProgress,
    isInitializing,
    error,
  } = usePathways();

  // Get pathway progress for this sales room
  const pathwayProgressQuery = getPathwayProgressQuery(salesRoomId);
  const pathwayProgressData = pathwayProgressQuery.data;
  const isLoadingProgress = pathwayProgressQuery.isLoading;

  // Set selected pathway from progress data
  React.useEffect(() => {
    if (pathwayProgressData?.pathway?.id && !selectedPathwayId) {
      setSelectedPathwayId(pathwayProgressData.pathway.id);
    }
  }, [pathwayProgressData, selectedPathwayId]);

  const handleCreatePathway = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newPathwayName.trim()) {
      return;
    }

    const validSteps = pathwaySteps.filter(step => step.name.trim() !== '');
    
    if (validSteps.length === 0) {
      return;
    }

    const result = await createPathway(newPathwayName, validSteps, newPathwayDescription);
    
    if (result.success) {
      setNewPathwayName('');
      setNewPathwayDescription('');
      setPathwaySteps([{ name: '', description: '' }]);
      setIsCreatePathwayMode(false);
    }
  };

  const handleAssignPathway = async () => {
    if (!salesRoomId || !selectedPathwayId) {
      return;
    }

    const result = await assignPathwayToSalesRoom(salesRoomId, selectedPathwayId);
    
    if (result.success) {
      // Progress data will be automatically updated via TanStack Query
    }
  };

  const handleUpdatePathwayProgress = async (stepId: string, status: 'not_started' | 'in_progress' | 'completed' | 'skipped') => {
    if (!salesRoomId) return;
    
    await updateSalesRoomPathwayProgress(salesRoomId, stepId, status);
  };

  const handleInitializePathway = async () => {
    if (!salesRoomId) return;
    
    await initializePathwayProgress(salesRoomId);
  };

  const addPathwayStep = () => {
    setPathwaySteps([...pathwaySteps, { name: '', description: '' }]);
  };

  const removePathwayStep = (index: number) => {
    const newSteps = [...pathwaySteps];
    newSteps.splice(index, 1);
    setPathwaySteps(newSteps);
  };

  const updatePathwayStep = (index: number, field: 'name' | 'description', value: string) => {
    const newSteps = [...pathwaySteps];
    newSteps[index][field] = value;
    setPathwaySteps(newSteps);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'in_progress':
        return <Clock className="h-5 w-5 text-amber-500" />;
      case 'skipped':
        return <ArrowRight className="h-5 w-5 text-gray-500" />;
      default:
        return <Circle className="h-5 w-5 text-gray-300" />;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'completed':
        return 'default';
      case 'in_progress':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  if (isLoadingPathways || isLoadingProgress) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-6 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between p-3 border rounded-md">
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-5 rounded-full" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-9 w-32" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isCreatePathwayMode) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-medium text-gray-900">Create New Pathway</h3>
          <Button variant="outline" onClick={() => setIsCreatePathwayMode(false)}>
            Cancel
          </Button>
        </div>
        
        <form onSubmit={handleCreatePathway} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pathwayName" className="text-sm font-medium text-gray-900">
              Pathway Name
            </Label>
            <Input
              id="pathwayName"
              value={newPathwayName}
              onChange={(e) => setNewPathwayName(e.target.value)}
              placeholder="Enter pathway name"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="pathwayDescription" className="text-sm font-medium text-gray-900">
              Description (Optional)
            </Label>
            <Textarea
              id="pathwayDescription"
              value={newPathwayDescription}
              onChange={(e) => setNewPathwayDescription(e.target.value)}
              placeholder="Enter a description"
              rows={2}
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label className="text-sm font-medium text-gray-900">Steps</Label>
              <Button type="button" variant="outline" size="sm" onClick={addPathwayStep}>
                <PlusCircle className="h-4 w-4 mr-1" />
                Add Step
              </Button>
            </div>
            
            <div className="space-y-3">
              {pathwaySteps.map((step, index) => (
                <div key={index} className="bg-white rounded-lg border border-gray-200 p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-900">Step {index + 1}</span>
                    {pathwaySteps.length > 1 && (
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => removePathwayStep(index)}
                        className="h-7 text-red-600 hover:text-red-700"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Input
                      value={step.name}
                      onChange={(e) => updatePathwayStep(index, 'name', e.target.value)}
                      placeholder="Step name"
                      required
                    />
                    <Textarea
                      value={step.description}
                      onChange={(e) => updatePathwayStep(index, 'description', e.target.value)}
                      placeholder="Step description (optional)"
                      rows={2}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <Button type="submit" disabled={isCreating} className="w-full">
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Pathway'
            )}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-2 flex-1">
          <Label htmlFor="assignPathway" className="text-sm font-medium text-gray-900">
            Select Pathway
          </Label>
          <div className="flex gap-2">
            <Select value={selectedPathwayId} onValueChange={setSelectedPathwayId}>
              <SelectTrigger className="flex-1 max-w-xs">
                <SelectValue placeholder="Select a pathway" />
              </SelectTrigger>
              <SelectContent>
                {pathways.map((pathway: any) => (
                  <SelectItem key={pathway._id} value={pathway._id}>
                    {pathway.name} {pathway.isDefault && '(Default)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              onClick={handleAssignPathway} 
              disabled={!selectedPathwayId || isAssigning}
              size="sm"
            >
              {isAssigning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Assigning...
                </>
              ) : (
                'Assign'
              )}
            </Button>
          </div>
        </div>
        <Button onClick={() => setIsCreatePathwayMode(true)} variant="outline" size="sm">
          <PlusCircle className="h-4 w-4 mr-2" />
          New Pathway
        </Button>
      </div>
      
      {pathwayProgressData?.steps && pathwayProgressData.steps.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900">Pathway Progress</h3>
            <div className="text-xs text-gray-500">
              {pathwayProgressData.progress.completedSteps} of {pathwayProgressData.progress.totalSteps} completed 
              ({pathwayProgressData.progress.percentComplete}%)
            </div>
          </div>
          
          <div className="space-y-2">
            {pathwayProgressData.steps.map((step: PathwayProgress) => {
              const isUpdating = isUpdatingProgress;
              
              return (
                <div 
                  key={step.stepId} 
                  className={`
                    bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors p-3
                    ${isUpdating ? 'ring-2 ring-blue-200 bg-blue-50/30' : ''}
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(step.status)}
                        {isUpdating && (
                          <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">{step.name}</div>
                        {step.description && (
                          <div className="text-xs text-gray-500 mt-1">{step.description}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant={getStatusBadgeVariant(step.status)} className="text-xs">
                        {step.status.replace('_', ' ')}
                      </Badge>
                      <Select 
                        value={step.status} 
                        onValueChange={(value) => handleUpdatePathwayProgress(step.stepId, value as any)}
                        disabled={isUpdating}
                      >
                        <SelectTrigger className="w-32 h-8">
                          <SelectValue placeholder="Update status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="not_started">Not Started</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="skipped">Skipped</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : selectedPathwayId ? (
        <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
          <p className="text-sm text-gray-600 mb-4">No progress data available. Initialize this pathway to start tracking progress.</p>
          <Button 
            onClick={handleInitializePathway} 
            variant="outline" 
            disabled={isInitializing}
          >
            {isInitializing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Initializing...
              </>
            ) : (
              'Initialize Pathway'
            )}
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
          <p className="text-sm text-gray-600">Select a pathway to view or track progress.</p>
        </div>
      )}

      {(error || pathwaysError) && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <p className="text-sm text-red-600">{error || pathwaysError?.message}</p>
        </div>
      )}
    </div>
  );
}
