import React, { useState } from 'react';
import {
  Pickaxe,
  Mail,
  Clock,
  Users,
  Globe,
  MessageSquare,
  Check,
  X,
  AlarmClock,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MinedDeal } from '@/types/minedDeal';
import { useMinedDealOperations } from '@/hooks/useMinedDealOperations';
import { usePipelines } from '@/hooks/usePipelines';
import { usePipelineStages } from '@/hooks/usePipelineStages';
import { PipelineStage } from '@/types/pipeline';

interface MinedDealViewerProps {
  deal: MinedDeal;
  onClose: () => void;
}

// Helper to format date
const formatDate = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

// Helper to format relative time
const formatRelativeTime = (date: Date | string): string => {
  const now = new Date();
  const then = typeof date === 'string' ? new Date(date) : date;
  const diffMs = now.getTime() - then.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
};

export const MinedDealViewer: React.FC<MinedDealViewerProps> = ({ deal, onClose }) => {
  const [confirmingDismiss, setConfirmingDismiss] = useState(false);
  const [stagePickerOpen, setStagePickerOpen] = useState(false);
  
  // Editable fields for prospect and opportunity names
  const [prospectName, setProspectName] = useState(deal.companyName);
  const [opportunityName, setOpportunityName] = useState(`${deal.companyName} - Opportunity`);

  const { acceptMinedDeal, dismissMinedDeal, snoozeMinedDeal, isAccepting, isDismissing, isSnoozing } =
    useMinedDealOperations();

  // Get all pipelines and allow user to select which one
  const { pipelines, defaultPipeline, isLoadingPipelines } = usePipelines();
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | undefined>(undefined);
  
  // Track selected stage (user selects before clicking Add)
  const [selectedStageId, setSelectedStageId] = useState<string | undefined>(undefined);
  
  // Use selected pipeline or fall back to default
  const activePipelineId = selectedPipelineId || defaultPipeline?._id;
  const { pipelineStages, isLoadingStages } = usePipelineStages(activePipelineId);
  
  // Set default pipeline when it loads
  React.useEffect(() => {
    if (defaultPipeline && !selectedPipelineId) {
      setSelectedPipelineId(defaultPipeline._id);
    }
  }, [defaultPipeline, selectedPipelineId]);
  
  // Auto-select first stage when stages load or pipeline changes
  React.useEffect(() => {
    if (pipelineStages.length > 0 && !selectedStageId) {
      setSelectedStageId(pipelineStages[0]._id);
    }
  }, [pipelineStages, selectedStageId]);
  
  // Reset selected stage when pipeline changes
  React.useEffect(() => {
    if (pipelineStages.length > 0) {
      setSelectedStageId(pipelineStages[0]._id);
    } else {
      setSelectedStageId(undefined);
    }
  }, [selectedPipelineId]);

  const handleAccept = async () => {
    if (!selectedStageId) return;
    
    setStagePickerOpen(false);
    const result = await acceptMinedDeal(deal._id, {
      stageId: selectedStageId,
      pipelineId: selectedPipelineId,
      prospectName: prospectName.trim() || undefined,
      opportunityName: opportunityName.trim() || undefined,
    });
    if (result.success) {
      onClose();
    }
  };

  const handleDismiss = async () => {
    const result = await dismissMinedDeal(deal._id);
    if (result.success) {
      onClose();
    }
  };

  const handleSnooze = async (days: number) => {
    const result = await snoozeMinedDeal(deal._id, days);
    if (result.success) {
      onClose();
    }
  };

  const isProcessing = isAccepting || isDismissing || isSnoozing;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center">
            <Pickaxe className="h-4 w-4 text-gray-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{deal.companyName}</h1>
            {deal.status === 'SNOOZED' && deal.snoozeUntil && (
              <p className="text-xs text-gray-500 mt-0.5">
                Snoozed until {formatDate(deal.snoozeUntil)}
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Dismiss */}
          {confirmingDismiss ? (
            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDismiss}
                disabled={isProcessing}
              >
                {isDismissing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <X className="h-4 w-4 mr-1" />
                )}
                Confirm
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingDismiss(false)}
                disabled={isProcessing}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmingDismiss(true)}
              disabled={isProcessing}
              className="border-red-300 text-red-700 hover:bg-red-50"
            >
              <X className="h-4 w-4 mr-1" />
              Dismiss
            </Button>
          )}

          {/* Snooze */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={isProcessing}>
                {isSnoozing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <AlarmClock className="h-4 w-4 mr-1" />
                )}
                Snooze
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleSnooze(7)}>1 week</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSnooze(14)}>2 weeks</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSnooze(30)}>1 month</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSnooze(90)}>3 months</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Accept with Stage Picker */}
          <Popover open={stagePickerOpen} onOpenChange={setStagePickerOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" disabled={isProcessing}>
                {isAccepting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Check className="h-4 w-4 mr-1" />
                )}
                Accept
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-0">
              <div className="p-3 border-b border-gray-100">
                <h4 className="text-sm font-medium text-gray-900">Create As</h4>
                <p className="text-xs text-gray-500 mt-0.5">Customize names before accepting</p>
              </div>
              
              <div className="p-3 space-y-3 border-b border-gray-100">
                <div>
                  <Label htmlFor="popover-prospect-name" className="text-xs text-gray-500">
                    Prospect Name
                  </Label>
                  <Input
                    id="popover-prospect-name"
                    value={prospectName}
                    onChange={(e) => setProspectName(e.target.value)}
                    placeholder={deal.companyName}
                    className="mt-1 h-8 text-sm"
                    disabled={isProcessing}
                  />
                </div>
                <div>
                  <Label htmlFor="popover-opportunity-name" className="text-xs text-gray-500">
                    Opportunity Name
                  </Label>
                  <Input
                    id="popover-opportunity-name"
                    value={opportunityName}
                    onChange={(e) => setOpportunityName(e.target.value)}
                    placeholder={`${deal.companyName} - Opportunity`}
                    className="mt-1 h-8 text-sm"
                    disabled={isProcessing}
                  />
                </div>
              </div>

              {/* Pipeline Selector */}
              <div className="p-3 border-b border-gray-100">
                <Label className="text-xs text-gray-500 block mb-1.5">Pipeline</Label>
                {isLoadingPipelines ? (
                  <div className="h-8 flex items-center">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                  </div>
                ) : pipelines.length > 1 ? (
                  <div className="flex flex-wrap gap-1">
                    {pipelines.map((pipeline) => (
                      <button
                        key={pipeline._id}
                        onClick={() => setSelectedPipelineId(pipeline._id)}
                        disabled={isProcessing}
                        className={`px-2 py-1 text-xs rounded-md transition-colors ${
                          selectedPipelineId === pipeline._id
                            ? 'bg-gray-900 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {pipeline.name}
                        {pipeline.isDefault && (
                          <span className="ml-1 opacity-60">(default)</span>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-900">
                    {pipelines[0]?.name || 'Default Pipeline'}
                  </p>
                )}
              </div>

              <div className="p-2 border-b border-gray-100">
                <Label className="text-xs text-gray-500 px-2 block mb-1">Select Stage</Label>
                {isLoadingStages ? (
                  <div className="p-2 text-center">
                    <Loader2 className="h-4 w-4 animate-spin mx-auto text-gray-400" />
                  </div>
                ) : pipelineStages.length === 0 ? (
                  <div className="p-2 text-center text-sm text-gray-500">
                    No stages in this pipeline
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto">
                    {pipelineStages.map((stage: PipelineStage) => (
                      <button
                        key={stage._id}
                        onClick={() => setSelectedStageId(stage._id)}
                        disabled={isProcessing}
                        className={`w-full text-left px-2 py-1.5 text-sm rounded transition-colors flex items-center justify-between ${
                          selectedStageId === stage._id
                            ? 'bg-gray-900 text-white'
                            : stage.isClosedWon 
                              ? 'text-green-700 hover:bg-gray-100' 
                              : stage.isClosedLost 
                                ? 'text-red-700 hover:bg-gray-100' 
                                : 'hover:bg-gray-100'
                        }`}
                      >
                        <span>{stage.name}</span>
                        {stage.isClosedWon && (
                          <span className={`text-xs ${selectedStageId === stage._id ? 'text-green-300' : 'text-green-600'}`}>Won</span>
                        )}
                        {stage.isClosedLost && (
                          <span className={`text-xs ${selectedStageId === stage._id ? 'text-red-300' : 'text-red-600'}`}>Lost</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Add Button */}
              <div className="p-3">
                <Button
                  onClick={handleAccept}
                  disabled={isProcessing || !selectedStageId}
                  className="w-full"
                  size="sm"
                >
                  {isAccepting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  Add to Pipeline
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Domain Info */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-gray-600" />
              <h3 className="text-sm font-medium text-gray-900">Company Domain</h3>
            </div>
          </div>
          <div className="p-4">
            <div className="flex flex-wrap gap-2">
              {deal.domains.map((domain) => (
                <Badge key={domain} variant="secondary" className="text-xs">
                  {domain}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/* Evidence Summary */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-gray-600" />
              <h3 className="text-sm font-medium text-gray-900">Email Evidence</h3>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-gray-500">Threads</Label>
                <p className="text-sm font-medium text-gray-900">{deal.threadCount}</p>
              </div>
              <div>
                <Label className="text-xs text-gray-500">Messages</Label>
                <p className="text-sm font-medium text-gray-900">{deal.totalMessages}</p>
              </div>
            </div>

            <div className="flex items-center gap-1 text-sm text-gray-600">
              <Clock className="h-3.5 w-3.5" />
              <span>
                Activity from {formatDate(deal.firstActivityDate)} to{' '}
                {formatDate(deal.lastActivityDate)}
              </span>
            </div>

            <div className="text-xs text-gray-500">
              Last contact {formatRelativeTime(deal.lastActivityDate)}
            </div>
          </div>
        </div>

        {/* Participants */}
        {deal.participants.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-600" />
                <h3 className="text-sm font-medium text-gray-900">
                  Participants ({deal.participants.length})
                </h3>
              </div>
            </div>
            <div className="p-4">
              <div className="space-y-2">
                {deal.participants.slice(0, 5).map((participant, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <div className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-600">
                      {(participant.name || participant.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      {participant.name ? (
                        <>
                          <span className="font-medium text-gray-900">{participant.name}</span>
                          <span className="text-gray-500 ml-1 text-xs">{participant.email}</span>
                        </>
                      ) : (
                        <span className="text-gray-900">{participant.email}</span>
                      )}
                    </div>
                  </div>
                ))}
                {deal.participants.length > 5 && (
                  <p className="text-xs text-gray-500">
                    +{deal.participants.length - 5} more participants
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Representative Thread */}
        {deal.representativeThread && (
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-gray-600" />
                <h3 className="text-sm font-medium text-gray-900">Sample Thread</h3>
              </div>
            </div>
            <div className="p-4">
              {deal.representativeThread.subject && (
                <div className="mb-2">
                  <Label className="text-xs text-gray-500">Subject</Label>
                  <p className="text-sm font-medium text-gray-900">
                    {deal.representativeThread.subject}
                  </p>
                </div>
              )}
              {deal.representativeThread.snippet && (
                <div>
                  <Label className="text-xs text-gray-500">Preview</Label>
                  <p className="text-sm text-gray-600 italic">
                    "{deal.representativeThread.snippet}"
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Suggested By */}
        {deal.suggestedBy && (
          <div className="text-xs text-gray-500 text-center">
            Suggested by {deal.suggestedBy.firstName} {deal.suggestedBy.lastName} ·{' '}
            {formatDate(deal.createdAt)}
          </div>
        )}
      </div>
    </div>
  );
};
