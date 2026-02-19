import React, { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UserPlus, Users } from 'lucide-react';

interface SpeakerReassignPopoverProps {
  trigger: React.ReactNode;
  currentSpeaker: string;
  speakers: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReassignLine: (speaker: string) => void;
  onReassignAll: (speaker: string) => void;
}

export const SpeakerReassignPopover: React.FC<SpeakerReassignPopoverProps> = ({
  trigger,
  currentSpeaker,
  speakers,
  open,
  onOpenChange,
  onReassignLine,
  onReassignAll,
}) => {
  const [newSpeaker, setNewSpeaker] = useState('');

  const availableSpeakers = useMemo(() => {
    const typed = newSpeaker.trim();
    const unique = new Set<string>(speakers);
    if (typed) unique.add(typed);
    return Array.from(unique).filter((s) => s.trim().length > 0);
  }, [speakers, newSpeaker]);

  const handleSelect = (speaker: string) => {
    onReassignLine(speaker);
    onOpenChange(false);
  };

  const handleSelectAll = (speaker: string) => {
    onReassignAll(speaker);
    onOpenChange(false);
  };

  const handleCreate = () => {
    const trimmed = newSpeaker.trim();
    if (!trimmed) return;
    onReassignLine(trimmed);
    setNewSpeaker('');
    onOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="w-72 p-3"
        side="bottom"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-3">
          <div>
            <p className="text-xs text-gray-500 mb-1">Reassign this line</p>
            <ScrollArea className="max-h-40">
              <div className="space-y-1">
                {availableSpeakers.map((speaker) => (
                  <Button
                    key={speaker}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => handleSelect(speaker)}
                  >
                    <Users className="h-4 w-4 text-gray-500 mr-2" />
                    {speaker}
                  </Button>
                ))}
                {availableSpeakers.length === 0 && (
                  <p className="text-xs text-gray-400 px-1">No other speakers yet</p>
                )}
              </div>
            </ScrollArea>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1">Change all occurrences</p>
            <ScrollArea className="max-h-32">
              <div className="space-y-1">
                {availableSpeakers
                  .filter((s) => s !== currentSpeaker)
                  .map((speaker) => (
                    <Button
                      key={`all-${speaker}`}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => handleSelectAll(speaker)}
                    >
                      <Users className="h-4 w-4 text-gray-500 mr-2" />
                      Change all “{currentSpeaker}” to “{speaker}”
                    </Button>
                  ))}
                {availableSpeakers.filter((s) => s !== currentSpeaker).length === 0 && (
                  <p className="text-xs text-gray-400 px-1">No alternate speakers</p>
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-gray-500">Create new speaker</p>
            <div className="flex items-center gap-2">
              <Input
                value={newSpeaker}
                onChange={(e) => setNewSpeaker(e.target.value)}
                placeholder="New speaker name"
                className="text-sm"
              />
              <Button
                size="sm"
                className="px-2 py-1.5 text-sm font-medium rounded-md transition-all duration-200 bg-gray-900 text-white hover:bg-gray-800"
                onClick={handleCreate}
                disabled={!newSpeaker.trim()}
              >
                <UserPlus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

