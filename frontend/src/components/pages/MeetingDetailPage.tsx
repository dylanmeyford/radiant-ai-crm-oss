import { useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMeetingOperations } from '@/hooks/useMeetingOperations';
import { MeetingTranscript, MeetingTranscriptHandle } from './MeetingTranscript';
import { MeetingMediaPlayer } from './MeetingMediaPlayer';
import { MeetingSummaryView } from './MeetingSummaryView';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  MapPin, 
  Users,
  Video,
  FileText,
  Sparkles,
  AlertCircle
} from 'lucide-react';

export default function MeetingDetailPage() {
  const { meetingId } = useParams<{ meetingId: string }>();
  const navigate = useNavigate();
  const { useMeetingDetails, useRecordingUrl, useTranscriptUrl, useAddTranscript } = useMeetingOperations();
  
  const [currentTime, setCurrentTime] = useState(0);
  const [seekTo, setSeekTo] = useState<number | undefined>(undefined);
  const [manualTranscript, setManualTranscript] = useState<string>('');
  const [isReplaceOpen, setIsReplaceOpen] = useState(false);
  const [isEditingSpeakers, setIsEditingSpeakers] = useState(false);
  const [hasSpeakerEdits, setHasSpeakerEdits] = useState(false);
  const transcriptRef = useRef<MeetingTranscriptHandle>(null);

  // Fetch meeting details
  const { 
    data: meeting, 
    isLoading: isLoadingMeeting, 
    error: meetingError 
  } = useMeetingDetails(meetingId);

  // Mutation for adding/replacing transcript
  const addTranscriptMutation = useAddTranscript(meetingId);

  // Determine if we should fetch media URLs
  const hasRecording = meeting?.savedRecordingPath;
  const hasTranscript = meeting?.savedTranscriptPath || meeting?.transcriptionText;

  // Fetch recording URL if available
  const { 
    data: recordingData, 
    isLoading: isLoadingRecording,
    error: recordingError 
  } = useRecordingUrl(meetingId, !!hasRecording);

  // Fetch transcript URL if needed (for downloadable transcript file)
  useTranscriptUrl(meetingId, !!meeting?.savedTranscriptPath);

  const canSaveTranscript = useMemo(() => manualTranscript.trim().length > 0, [manualTranscript]);

  const handleSeekFromTranscript = (time: number) => {
    setSeekTo(time);
    // Reset seekTo after a brief delay to allow seeking again to the same time
    setTimeout(() => setSeekTo(undefined), 100);
  };

  const formatDateTime = (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };

  const getDuration = () => {
    if (!meeting?.startTime || !meeting?.endTime) return null;
    const start = new Date(meeting.startTime);
    const end = new Date(meeting.endTime);
    const durationMs = end.getTime() - start.getTime();
    const durationMinutes = Math.round(durationMs / (1000 * 60));
    
    if (durationMinutes < 60) {
      return `${durationMinutes} minutes`;
    } else {
      const hours = Math.floor(durationMinutes / 60);
      const minutes = durationMinutes % 60;
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
  };

  // Loading state
  if (isLoadingMeeting) {
    return (
      <div className="h-full flex flex-col bg-gray-50">
        <div className="bg-white border-b border-gray-200 p-4">
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="flex-1 p-4 space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  // Error state
  if (meetingError || !meeting) {
    return (
      <div className="h-full flex flex-col bg-gray-50">
        <div className="bg-white border-b border-gray-200 p-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Failed to Load Meeting
            </h2>
            <p className="text-sm text-gray-500">
              {meetingError?.message || 'Meeting not found'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Determine media type from recording path
  const getMediaType = (): 'video' | 'audio' => {
    if (!meeting.savedRecordingPath) return 'video';
    const ext = meeting.savedRecordingPath.toLowerCase().split('.').pop();
    const audioExts = ['mp3', 'wav', 'm4a', 'aac', 'ogg'];
    return audioExts.includes(ext || '') ? 'audio' : 'video';
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{meeting.title}</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                {formatDateTime(meeting.startTime)}
              </p>
            </div>
          </div>
          {hasTranscript && (
            <div className="flex items-center gap-2">
              {isEditingSpeakers ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    onClick={() => {
                      transcriptRef.current?.resetEdits();
                      setIsEditingSpeakers(false);
                      setHasSpeakerEdits(false);
                    }}
                    disabled={addTranscriptMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 bg-gray-900 text-white hover:bg-gray-800"
                    disabled={!hasSpeakerEdits || addTranscriptMutation.isPending}
                    onClick={async () => {
                      const updated = transcriptRef.current?.getModifiedTranscript();
                      if (!updated) return;
                      try {
                        await addTranscriptMutation.mutateAsync(updated);
                        setIsEditingSpeakers(false);
                        setHasSpeakerEdits(false);
                        transcriptRef.current?.resetEdits();
                      } catch {
                        // handled by mutation lifecycle
                      }
                    }}
                  >
                    {addTranscriptMutation.isPending ? 'Saving...' : 'Save changes'}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200"
                    onClick={() => setIsEditingSpeakers(true)}
                  >
                    Edit speakers
                  </Button>
            <Dialog open={isReplaceOpen} onOpenChange={setIsReplaceOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  className="px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 bg-gray-900 text-white hover:bg-gray-800"
                >
                  Replace transcript
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Replace transcript</DialogTitle>
                  <DialogDescription>
                    This will overwrite the existing transcript for this meeting.
                  </DialogDescription>
                </DialogHeader>
                <div>
                  <Textarea
                    value={manualTranscript}
                    onChange={(e) => setManualTranscript(e.target.value)}
                    placeholder="Paste or type the meeting transcript here..."
                    className="min-h-40"
                  />
                </div>
                <DialogFooter>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setManualTranscript('');
                      setIsReplaceOpen(false);
                    }}
                    className="text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={async () => {
                      if (!canSaveTranscript) return;
                      try {
                        await addTranscriptMutation.mutateAsync(manualTranscript);
                        setIsReplaceOpen(false);
                        setManualTranscript('');
                      } catch {
                        // handled by mutation error and rollback
                      }
                    }}
                    disabled={!canSaveTranscript || addTranscriptMutation.isPending}
                    className="px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 bg-gray-900 text-white hover:bg-gray-800"
                  >
                    {addTranscriptMutation.isPending ? 'Saving...' : 'Save transcript'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <Tabs defaultValue="recording" className="flex-1 flex flex-col overflow-hidden">
          <div className="bg-white border-b border-gray-200 px-4 flex-shrink-0">
            <TabsList className="bg-transparent border-0 h-auto p-0 space-x-6">
              <TabsTrigger 
                value="recording"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-gray-900 rounded-none px-0 py-3"
              >
                Recording & Transcript
              </TabsTrigger>
              <TabsTrigger 
                value="details"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-gray-900 rounded-none px-0 py-3"
              >
                Details
              </TabsTrigger>
              <TabsTrigger 
                value="summary"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-gray-900 rounded-none px-0 py-3"
              >
                AI Summary
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {/* Recording & Transcript Tab */}
            <TabsContent value="recording" className="h-full m-0 p-0 overflow-hidden data-[state=active]:flex">
              <div className="h-full flex overflow-hidden w-full">
                {/* Left: Transcript */}
                <div className="w-1/2 h-full border-r border-gray-200 bg-white overflow-hidden min-h-0">
                  <div className="h-full flex flex-col overflow-hidden min-h-0">
                    {hasTranscript ? (
                      <MeetingTranscript
                        ref={transcriptRef}
                        transcriptionText={meeting.transcriptionText}
                        currentTime={currentTime}
                        onSeek={handleSeekFromTranscript}
                        editMode={isEditingSpeakers}
                        onDirtyChange={setHasSpeakerEdits}
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center p-4">
                        <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors w-full max-w-2xl">
                          <div className="p-4 border-b border-gray-200">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-gray-600" />
                              <h3 className="text-sm font-medium text-gray-900">Add transcript</h3>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Paste or type the transcript text below to process this meeting.</p>
                          </div>
                          <div className="p-4 space-y-3">
                            <Textarea
                              value={manualTranscript}
                              onChange={(e) => setManualTranscript(e.target.value)}
                              placeholder="Paste or type the meeting transcript here..."
                              className="min-h-48"
                            />
                            <div className="flex items-center justify-end">
                              <Button
                                onClick={async () => {
                                  if (!canSaveTranscript) return;
                                  try {
                                    await addTranscriptMutation.mutateAsync(manualTranscript);
                                    setManualTranscript('');
                                  } catch {
                                    // handled by mutation error/rollback
                                  }
                                }}
                                disabled={!canSaveTranscript || addTranscriptMutation.isPending}
                                className="px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 bg-gray-900 text-white hover:bg-gray-800"
                              >
                                {addTranscriptMutation.isPending ? 'Saving...' : 'Save transcript'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Video/Audio Player */}
                <div className="w-1/2 h-full bg-black overflow-hidden">
                  {hasRecording && recordingData?.url ? (
                    <MeetingMediaPlayer
                      mediaUrl={recordingData.url}
                      mediaType={getMediaType()}
                      onTimeUpdate={setCurrentTime}
                      seekTo={seekTo}
                    />
                  ) : isLoadingRecording ? (
                    <div className="h-full flex items-center justify-center bg-gray-900">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-3" />
                        <p className="text-sm text-gray-300">Loading recording...</p>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center bg-gray-900">
                      <div className="text-center p-4">
                        <Video className="h-12 w-12 text-gray-500 mx-auto mb-3" />
                        <p className="text-sm text-gray-300">No recording available</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {recordingError ? 'Failed to load recording' : 'Recording will appear once available'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* Details Tab */}
            <TabsContent value="details" className="h-full m-0 overflow-hidden data-[state=active]:block">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-4 max-w-3xl mx-auto">
                  {/* Time & Duration */}
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h3 className="text-sm font-medium text-gray-900 mb-3">Meeting Information</h3>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <Calendar className="h-4 w-4 text-gray-500 mt-0.5" />
                        <div>
                          <p className="text-xs text-gray-500">Date & Time</p>
                          <p className="text-sm text-gray-900">{formatDateTime(meeting.startTime)}</p>
                        </div>
                      </div>
                      {getDuration() && (
                        <div className="flex items-start gap-3">
                          <Clock className="h-4 w-4 text-gray-500 mt-0.5" />
                          <div>
                            <p className="text-xs text-gray-500">Duration</p>
                            <p className="text-sm text-gray-900">{getDuration()}</p>
                          </div>
                        </div>
                      )}
                      {meeting.location && (
                        <div className="flex items-start gap-3">
                          <MapPin className="h-4 w-4 text-gray-500 mt-0.5" />
                          <div>
                            <p className="text-xs text-gray-500">Location</p>
                            <p className="text-sm text-gray-900">{meeting.location}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Attendees */}
                  {meeting.attendees && meeting.attendees.length > 0 && (
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Users className="h-4 w-4 text-gray-600" />
                        <h3 className="text-sm font-medium text-gray-900">Attendees</h3>
                      </div>
                      <div className="space-y-2">
                        {meeting.attendees.map((attendee, index) => (
                          <div key={index} className="flex items-center justify-between text-sm">
                            <div>
                              <p className="text-gray-900">{attendee.name || attendee.email}</p>
                              {attendee.name && (
                                <p className="text-xs text-gray-500">{attendee.email}</p>
                              )}
                            </div>
                            <span className={`
                              text-xs px-2 py-1 rounded-full
                              ${attendee.responseStatus === 'accepted' ? 'bg-green-50 text-green-700' :
                                attendee.responseStatus === 'declined' ? 'bg-red-50 text-red-700' :
                                attendee.responseStatus === 'tentative' ? 'bg-yellow-50 text-yellow-700' :
                                'bg-gray-50 text-gray-700'}
                            `}>
                              {attendee.responseStatus}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Description */}
                  {meeting.description && (
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                      <h3 className="text-sm font-medium text-gray-900 mb-2">Description</h3>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">
                        {meeting.description}
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* AI Summary Tab */}
            <TabsContent value="summary" className="h-full m-0 overflow-hidden data-[state=active]:block">
              <ScrollArea className="h-full">
                <div className="p-4 max-w-4xl mx-auto">
                  {meeting.aiSummary?.summary ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-4">
                        <Sparkles className="h-5 w-5 text-purple-600" />
                        <h2 className="text-base font-semibold text-gray-900">AI-Generated Meeting Analysis</h2>
                      </div>
                      <MeetingSummaryView 
                        summaryData={meeting.aiSummary.summary}
                        generatedDate={meeting.aiSummary.date}
                      />
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg border border-gray-200 p-8">
                      <div className="text-center">
                        <Sparkles className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                        <p className="text-sm text-gray-600">No AI summary available</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Summary will be generated after the meeting is processed
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

