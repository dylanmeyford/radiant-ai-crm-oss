import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMeetingOperations } from "@/hooks/useMeetingOperations";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MeetingProspectSelect } from "@/components/meetings/MeetingProspectSelect";
import { MeetingContactsSelect } from "@/components/meetings/MeetingContactsSelect";
import type { CalendarActivity } from "@/types/dashboard";
import type { Contact, Prospect } from "@/types/prospect";
import { AlertCircle, Clock, Loader2, Video } from "lucide-react";
import { usePageActions } from "@/context/PageActionsContext";

export default function MeetingsPage() {
  const navigate = useNavigate();
  const meetingOps = useMeetingOperations();
  const { setActions, clearActions } = usePageActions();

  const [page, setPage] = useState(1);
  const limit = 10;
  const [updatingMeetingId, setUpdatingMeetingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string | null>>({});

  const recordedMeetingsQuery = meetingOps.useRecordedMeetings({ page, limit });
  const {
    data,
    isLoading,
    isFetching,
    error: recordedError,
    refetch,
  } = recordedMeetingsQuery;

  const meetings = (data?.meetings ?? []) as CalendarActivity[];
  const pagination = data?.pagination;

  useEffect(() => {
    setActions([]);
    return () => clearActions();
  }, [setActions, clearActions]);

  const formatDateTime = (date: Date | string | undefined) => {
    if (!date) return "Unknown date";
    const dt = typeof date === "string" ? new Date(date) : date;
    return dt.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatDuration = (meeting: CalendarActivity) => {
    if (!meeting.startTime || !meeting.endTime) return null;
    const start = new Date(meeting.startTime);
    const end = new Date(meeting.endTime);
    const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;
    return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
  };

  const getProspect = (meeting: CalendarActivity): Prospect | null => {
    if (!meeting.prospect) return null;
    if (typeof (meeting.prospect as any)?._id === "string") {
      return meeting.prospect as Prospect;
    }
    return meeting.prospect as Prospect;
  };

  const getContacts = (meeting: CalendarActivity): Contact[] => {
    if (!Array.isArray(meeting.contacts)) return [];
    return meeting.contacts as Contact[];
  };

  const handleAssignProspect = async (meetingId: string, prospect: Prospect) => {
    setUpdatingMeetingId(meetingId);
    setRowErrors((prev) => ({ ...prev, [meetingId]: null }));
    try {
      const result = await meetingOps.assignMeetingProspect(meetingId, prospect);
      if (!result.success) {
        setRowErrors((prev) => ({
          ...prev,
          [meetingId]: result.error || "Failed to assign prospect",
        }));
      }
      return result;
    } finally {
      setUpdatingMeetingId(null);
    }
  };

  const handleAssignContacts = async (meetingId: string, contacts: Contact[]) => {
    setUpdatingMeetingId(meetingId);
    setRowErrors((prev) => ({ ...prev, [meetingId]: null }));
    try {
      const result = await meetingOps.assignMeetingContacts(meetingId, contacts);
      if (!result.success) {
        setRowErrors((prev) => ({
          ...prev,
          [meetingId]: result.error || "Failed to assign contacts",
        }));
      }
      return result;
    } finally {
      setUpdatingMeetingId(null);
    }
  };

  const currentStatusText = useMemo(() => {
    if (!pagination) return null;
    const startItem = (pagination.currentPage - 1) * pagination.itemsPerPage + 1;
    const endItem = Math.min(
      pagination.currentPage * pagination.itemsPerPage,
      pagination.totalItems
    );
    return `Showing ${startItem}-${endItem} of ${pagination.totalItems} meetings`;
  }, [pagination]);

  return (
    <div className="p-4 overflow-hidden flex flex-col h-full">
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Video className="h-5 w-5 text-gray-600" />
          <h1 className="text-xl font-semibold text-gray-900">Recorded Meetings</h1>
        </div>
        <p className="text-sm text-gray-600">
          Review meeting recordings, assign prospects and contacts, and jump into AI insights.
        </p>
      </div>

      {recordedError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span>{recordedError.message || "Failed to load meetings"}</span>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 flex-1 overflow-hidden">
        <div className="overflow-x-auto h-full">
          <Table className="min-w-[1100px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[280px]">Meeting</TableHead>
                <TableHead className="w-[220px]">Prospect</TableHead>
                <TableHead className="w-[280px]">Contacts</TableHead>
                <TableHead className="w-[160px]">Recording</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: limit }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-10 w-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-10 w-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  </TableRow>
                ))
              ) : meetings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-12">
                    <div className="text-center space-y-2">
                      <Video className="h-12 w-12 text-gray-300 mx-auto" />
                      <h3 className="text-sm font-medium text-gray-900">No recorded meetings yet</h3>
                      <p className="text-sm text-gray-500">
                        Once meetings finish processing you&apos;ll see them here.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                meetings.map((meeting: CalendarActivity) => {
                  const prospect = getProspect(meeting);
                  const meetingContacts = getContacts(meeting);
                  const isRowUpdating = updatingMeetingId === meeting._id;
                  const hasRecording = Boolean(meeting.savedRecordingPath);
                  const hasTranscript = Boolean(meeting.savedTranscriptPath || meeting.transcriptionText);

                  return (
                    <TableRow
                      key={meeting._id}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => navigate(`/meetings/${meeting._id}`)}
                      data-state={isRowUpdating ? "updating" : undefined}
                    >
                      <TableCell className="align-top">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                            {meeting.title}
                            {isRowUpdating && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Clock className="h-3 w-3" />
                            <span>{formatDateTime(meeting.startTime)}</span>
                            {formatDuration(meeting) && (
                              <>
                                <span>&middot;</span>
                                <span>{formatDuration(meeting)}</span>
                              </>
                            )}
                          </div>
                          {rowErrors[meeting._id] && (
                            <p className="text-xs text-red-600">{rowErrors[meeting._id]}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <MeetingProspectSelect
                          meetingId={meeting._id}
                          value={prospect}
                          onAssign={(nextProspect) => handleAssignProspect(meeting._id, nextProspect)}
                          isUpdating={isRowUpdating}
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <MeetingContactsSelect
                          meetingId={meeting._id}
                          prospect={prospect}
                          contacts={meetingContacts}
                          onAssignContacts={(nextContacts) =>
                            handleAssignContacts(meeting._id, nextContacts)
                          }
                          isUpdating={isRowUpdating}
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-col gap-1 text-xs">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={hasRecording ? "default" : "outline"}
                              className={hasRecording ? "bg-emerald-100 text-emerald-700" : ""}
                            >
                              Recording {hasRecording ? "ready" : "pending"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={hasTranscript ? "default" : "outline"}
                              className={hasTranscript ? "bg-blue-100 text-blue-700" : ""}
                            >
                              {hasTranscript ? "Transcript available" : "Awaiting transcript"}
                            </Badge>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {meetings.length > 0 && pagination && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-gray-600">
          <span>{currentStatusText}</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              disabled={page === 1 || isFetching}
            >
              Previous
            </Button>
            <span className="text-xs text-gray-500">
              Page {pagination.currentPage} of {pagination.totalPages || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((prev) => prev + 1)}
              disabled={
                isFetching ||
                (pagination.totalPages !== undefined && pagination.currentPage >= pagination.totalPages)
              }
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
