import {
  useEffect,
  useRef,
  useMemo,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { User, Pencil } from 'lucide-react';
import { SpeakerReassignPopover } from '@/components/meetings/SpeakerReassignPopover';
import { cn } from '@/lib/utils';

interface TranscriptSegment {
  timestamp: number; // in seconds
  speaker: string;
  text: string;
  speakerNumber?: number;
  dirty?: boolean;
}

interface MeetingTranscriptProps {
  transcriptionText?: string;
  currentTime: number;
  onSeek: (time: number) => void;
  editMode?: boolean;
  onSegmentsChange?: (segments: TranscriptSegment[]) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export interface MeetingTranscriptHandle {
  getModifiedTranscript: () => string;
  resetEdits: () => void;
  hasEdits: () => boolean;
}

// Parse transcript from normalized JSON, VTT, or plain text into structured segments
function parseTranscript(transcriptionText: string): TranscriptSegment[] {
  if (!transcriptionText || !transcriptionText.trim()) {
    return [];
  }

  const segments: TranscriptSegment[] = [];
  
  // Try to parse as JSON first (normalized or Fireflies/Gladia format)
  try {
    const parsed = JSON.parse(transcriptionText);
    
    // Normalized shape: { transcript: [{ speaker, start, end, text }] }
    if (parsed && parsed.transcript && Array.isArray(parsed.transcript)) {
      // Map speaker names to numbers for consistent coloring
      const speakerMap = new Map<string, number>();
      let speakerCounter = 1;
      
      return parsed.transcript.map((item: any) => {
        // Get or assign speaker number
        if (!speakerMap.has(item.speaker)) {
          speakerMap.set(item.speaker, speakerCounter++);
        }
        
        return {
          timestamp: item.start
            ? item.start >= 10000
              ? item.start / 1000
              : item.start
            : 0, // default to 0 when missing
          speaker: item.speaker || 'Unknown',
          text: item.text || '',
          speakerNumber: speakerMap.get(item.speaker),
        };
      });
    }
  } catch (e) {
    // Not JSON, continue to other formats
  }
  
  // Check if it's VTT format
  if (transcriptionText.includes('WEBVTT') || transcriptionText.includes('-->')) {
    // VTT format parsing
    const lines = transcriptionText.split('\n');
    let currentSegment: Partial<TranscriptSegment> | null = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines and WEBVTT header
      if (!line || line === 'WEBVTT' || line.startsWith('NOTE')) {
        continue;
      }
      
      // Timestamp line (e.g., "00:05:32 --> 00:05:35")
      const timestampMatch = line.match(/(\d{2}):(\d{2}):(\d{2}(?:\.\d{3})?)\s*-->/);
      if (timestampMatch) {
        const hours = parseInt(timestampMatch[1], 10);
        const minutes = parseInt(timestampMatch[2], 10);
        const seconds = parseFloat(timestampMatch[3]);
        const timestamp = hours * 3600 + minutes * 60 + seconds;
        
        currentSegment = { timestamp };
        continue;
      }
      
      // Speaker identification (e.g., "<v Speaker 2>")
      const speakerMatch = line.match(/<v\s+([^>]+)>/);
      if (speakerMatch && currentSegment) {
        currentSegment.speaker = speakerMatch[1];
        
        // Extract speaker number if present
        const speakerNumberMatch = speakerMatch[1].match(/Speaker\s+(\d+)/i);
        if (speakerNumberMatch) {
          currentSegment.speakerNumber = parseInt(speakerNumberMatch[1], 10);
        }
        
        // Get text after speaker tag
        const text = line.replace(/<v\s+[^>]+>/, '').replace(/<\/v>/, '').trim();
        if (text) {
          currentSegment.text = text;
          segments.push(currentSegment as TranscriptSegment);
          currentSegment = null;
        }
        continue;
      }
      
      // Regular text line
      if (currentSegment && !currentSegment.text) {
        currentSegment.text = line;
        if (!currentSegment.speaker) {
          currentSegment.speaker = 'Unknown';
        }
        segments.push(currentSegment as TranscriptSegment);
        currentSegment = null;
      }
    }
  } else {
    // Plain text format - try to parse simple format
    // Format: "HH:MM:SS Speaker: Text" or just "Speaker: Text"
    const lines = transcriptionText.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      // Try to match timestamp at start
      const timestampMatch = trimmedLine.match(/^(\d{2}):(\d{2}):(\d{2})\s+(.+)/);
      if (timestampMatch) {
        const hours = parseInt(timestampMatch[1], 10);
        const minutes = parseInt(timestampMatch[2], 10);
        const seconds = parseInt(timestampMatch[3], 10);
        const timestamp = hours * 3600 + minutes * 60 + seconds;
        const rest = timestampMatch[4];
        
        // Try to extract speaker
        const speakerMatch = rest.match(/^([^:]+):\s*(.+)/);
        if (speakerMatch) {
          const speaker = speakerMatch[1].trim();
          const text = speakerMatch[2].trim();
          const speakerNumberMatch = speaker.match(/Speaker\s+(\d+)/i);
          
          segments.push({
            timestamp,
            speaker,
            text,
            speakerNumber: speakerNumberMatch ? parseInt(speakerNumberMatch[1], 10) : undefined
          });
        } else {
          segments.push({
            timestamp,
            speaker: 'Unknown',
            text: rest
          });
        }
      } else {
        // No timestamp - just try to parse speaker
        const speakerMatch = trimmedLine.match(/^([^:]+):\s*(.+)/);
        if (speakerMatch) {
          const speaker = speakerMatch[1].trim();
          const text = speakerMatch[2].trim();
          const speakerNumberMatch = speaker.match(/Speaker\s+(\d+)/i);
          
          segments.push({
            timestamp: segments.length > 0 ? segments[segments.length - 1].timestamp + 5 : 0,
            speaker,
            text,
            speakerNumber: speakerNumberMatch ? parseInt(speakerNumberMatch[1], 10) : undefined
          });
        }
      }
    }
  }
  
  return segments;
}

// Format timestamp for display
function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Get speaker color based on speaker number
function getSpeakerColor(speakerNumber?: number): string {
  const colors = [
    'bg-pink-100 text-pink-700',
    'bg-blue-100 text-blue-700',
    'bg-green-100 text-green-700',
    'bg-purple-100 text-purple-700',
    'bg-orange-100 text-orange-700',
    'bg-teal-100 text-teal-700',
  ];
  
  if (speakerNumber === undefined) {
    return 'bg-gray-100 text-gray-700';
  }
  
  return colors[(speakerNumber - 1) % colors.length];
}

export const MeetingTranscript = forwardRef<MeetingTranscriptHandle, MeetingTranscriptProps>(
  ({ transcriptionText, currentTime, onSeek, editMode = false, onSegmentsChange, onDirtyChange }, ref) => {
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const activeSegmentRef = useRef<HTMLDivElement>(null);
    const [activePopoverIndex, setActivePopoverIndex] = useState<number | null>(null);

    const baseSegments = useMemo(() => {
      return parseTranscript(transcriptionText || '').map((seg) => ({ ...seg, dirty: false }));
    }, [transcriptionText]);

    const [editedSegments, setEditedSegments] = useState<TranscriptSegment[]>(baseSegments);
    const [dirty, setDirty] = useState(false);

    // Reset edits when underlying transcript changes or edit mode toggles off
    useEffect(() => {
      setEditedSegments(baseSegments);
      setDirty(false);
      setActivePopoverIndex(null);
    }, [baseSegments]);

    useEffect(() => {
      if (!editMode) {
        setEditedSegments(baseSegments);
        setDirty(false);
        setActivePopoverIndex(null);
      }
    }, [editMode, baseSegments]);

    useEffect(() => {
      onSegmentsChange?.(editMode ? editedSegments : baseSegments);
    }, [editedSegments, baseSegments, editMode, onSegmentsChange]);

    useEffect(() => {
      onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);

    const displayedSegments = editMode ? editedSegments : baseSegments;

    // Find active segment based on current playback time
    const activeSegmentIndex = useMemo(() => {
      if (displayedSegments.length === 0) return -1;
      
      for (let i = displayedSegments.length - 1; i >= 0; i--) {
        if (currentTime >= displayedSegments[i].timestamp) {
          return i;
        }
      }
      
      return -1;
    }, [displayedSegments, currentTime]);

    // Auto-scroll to active segment
    useEffect(() => {
      if (activeSegmentRef.current && scrollAreaRef.current) {
        activeSegmentRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }, [activeSegmentIndex]);

    const speakerOptions = useMemo(() => {
      const set = new Set<string>();
      baseSegments.forEach((s) => set.add(s.speaker));
      editedSegments.forEach((s) => set.add(s.speaker));
      return Array.from(set);
    }, [baseSegments, editedSegments]);

    const updateSpeakerAt = (index: number, speaker: string) => {
      setEditedSegments((prev) => {
        const next = [...prev];
        const target = next[index];
        if (!target) return prev;
        next[index] = { ...target, speaker, dirty: true };
        setDirty(true);
        return next;
      });
    };

    const updateSpeakerAll = (currentSpeaker: string, newSpeaker: string) => {
      setEditedSegments((prev) => {
        const next = prev.map((seg) =>
          seg.speaker === currentSpeaker && !seg.dirty
            ? { ...seg, speaker: newSpeaker, dirty: true }
            : seg
        );
        setDirty(true);
        return next;
      });
    };

    useImperativeHandle(ref, () => ({
      getModifiedTranscript: () => {
        const segmentsToUse = editMode ? editedSegments : baseSegments;
        const normalized = {
          transcript: segmentsToUse.map((seg) => ({
            speaker: seg.speaker,
            start: Math.max(0, Math.round((seg.timestamp ?? 0) * 1000)),
            text: seg.text,
          })),
          metadata: {
            originalFormat: 'json',
            normalizedAt: new Date().toISOString(),
          },
        };
        return JSON.stringify(normalized);
      },
      resetEdits: () => {
        setEditedSegments(baseSegments);
        setDirty(false);
        setActivePopoverIndex(null);
      },
      hasEdits: () => dirty,
    }), [editMode, editedSegments, baseSegments, dirty]);

    if (!transcriptionText || displayedSegments.length === 0) {
      return (
        <div className="flex items-center justify-center h-full text-gray-500">
          <div className="text-center">
            <p className="text-sm">No transcript available</p>
            <p className="text-xs mt-1">Transcript will appear here once processing is complete</p>
          </div>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col overflow-hidden min-h-0">
        <ScrollArea className="flex-1" ref={scrollAreaRef}>
          <div className="space-y-2 p-4">
            {displayedSegments.map((segment, index) => {
              const isActive = index === activeSegmentIndex;
              const isEdited =
                editMode && (segment.dirty || segment.speaker !== (baseSegments[index]?.speaker ?? segment.speaker));

              return (
                <div
                  key={`${segment.timestamp}-${index}`}
                  ref={isActive ? activeSegmentRef : null}
                  className={cn(
                    'flex gap-3 p-3 rounded-lg transition-all duration-200 border-l-4',
                    isActive ? 'bg-blue-50 border-blue-500' : 'hover:bg-gray-50 border-transparent',
                    editMode ? 'cursor-pointer' : 'cursor-pointer'
                  )}
                  onClick={() => {
                    if (editMode) {
                      setActivePopoverIndex(index === activePopoverIndex ? null : index);
                    } else {
                      onSeek(segment.timestamp);
                    }
                  }}
                >
                  {/* Timestamp */}
                  <div className="flex-shrink-0 w-16">
                    <button
                      className="text-xs text-blue-600 hover:text-blue-700 font-mono"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSeek(segment.timestamp);
                      }}
                    >
                      {formatTimestamp(segment.timestamp)}
                    </button>
                  </div>

                  {/* Speaker Avatar */}
                  <div className="flex-shrink-0">
                    <div
                      className={cn(
                        'h-8 w-8 rounded-full flex items-center justify-center',
                        getSpeakerColor(segment.speakerNumber)
                      )}
                    >
                      <User className="h-4 w-4" />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-900">
                        {segment.speaker}
                      </span>
                      {isEdited && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                          Edited
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {segment.text}
                    </p>
                  </div>

                  {editMode && (
                    <div className="flex-shrink-0">
                      <SpeakerReassignPopover
                        trigger={
                          <button
                            className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-50 px-2 py-1 rounded-md"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActivePopoverIndex(index === activePopoverIndex ? null : index);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                        }
                        currentSpeaker={segment.speaker}
                        speakers={speakerOptions}
                        open={activePopoverIndex === index}
                        onOpenChange={(open) => {
                          if (open) {
                            setActivePopoverIndex(index);
                          } else {
                            setActivePopoverIndex(null);
                          }
                        }}
                        onReassignLine={(speaker) => updateSpeakerAt(index, speaker)}
                        onReassignAll={(speaker) => updateSpeakerAll(segment.speaker, speaker)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    );
  }
);

MeetingTranscript.displayName = 'MeetingTranscript';

