// src/types/notetaker.ts

export interface Participant {
  id: string;
  name: string;
  email?: string;
}

export interface Meeting {
  _id: string;
  title: string;
  startTime: string; // ISO 8601 date-time string
  endTime?: string; // ISO 8601 date-time string, optional if meeting is ongoing or duration is used
  durationMinutes?: number; // Optional, can be calculated if startTime and endTime are present
  participants: Participant[];
  status: 'processing' | 'completed' | 'failed' | 'scheduled'; // Example statuses
  aiSummarySnippet?: string; // Short snippet of the AI summary
  // Add other relevant fields like meetingLink, recordingUrl (if available directly in list)
  // notetakerId might also be useful if different from meeting id for management purposes
  notetakerId?: string; 
}

// Represents the full details of a single meeting, extending the base Meeting type
export interface MeetingDetail extends Meeting {
  mediaUrl?: string; // URL for audio/video playback
  aiSummary?: string | Record<string, any>; // Allow string or object for aiSummary
  transcription?: {
    segments: TranscriptionSegment[]; // Array of transcription segments
    fullText: string; // The entire transcription as a single string
  };
  recordingUrl?: string;
  transcriptUrl?: string; // Or the transcript itself if fetched together
  // Consider adding specific structure for aiSummary if known, e.g., ParsedMeetingSummary from AISummaryDisplay
  fullTranscript?: TranscriptionSegment[]; // Optional: if full transcript is part of detail
  // Any other detailed fields, e.g., action items, key topics, etc.
}

// Represents a single segment of the transcription, with timestamps
export interface TranscriptionSegment {
  startTime: number; // Start time of the segment in seconds from the beginning of the media
  endTime: number;   // End time of the segment in seconds
  text: string;      // Text content of the segment
  speaker?: string;   // Optional: identifier for the speaker
}

export type MeetingStatus = Meeting['status']; // Exporting the MeetingStatus type

export interface MeetingListResponse {
  data: Meeting[];
  totalCount: number;
  page: number;
  pageSize: number;
}

// You might also want a type for the API call to fetch meetings if it takes parameters like pagination, filters etc.
export interface GetMeetingsParams {
  page?: number;
  pageSize?: number;
  sortBy?: keyof Meeting | string; // Allow sorting by meeting fields or custom string for backend
  sortOrder?: 'asc' | 'desc';
  dateFrom?: string; // ISO 8601 date string
  dateTo?: string; // ISO 8601 date string
  status?: Meeting['status'];
  // Add other filter parameters as needed
}

// Types for inviteNotetaker
export interface InviteNotetakerPayload {
  inviteUrl: string;
  // title?: string; // Optional: If you want to allow setting title during ad-hoc invite
  // startTime?: string; // Optional: ISO 8601, if you want to specify start time
  // endTime?: string;   // Optional: ISO 8601, if you want to specify end time
}

export interface InviteNotetakerResponse {
  message: string;
  notetakerId?: string; // Or meetingId, depending on what backend returns
  // other relevant fields from the response
}

// Types for cancelNotetaker
export interface CancelNotetakerResponse {
  message: string;
  // other relevant fields from the response
} 