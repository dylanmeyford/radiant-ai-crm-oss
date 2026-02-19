export interface NotetakerRule {
  // Define structure based on what Nylas expects for calendar metadata rules
  [key: string]: string;
}

export interface NotetakerConfig {
  enabled: boolean;
  rules?: NotetakerRule | Record<string, string>;
  // any other default settings for the notetaker
}

export interface MeetingParticipant {
  email: string;
  name?: string;
}

export interface MeetingDetails {
  title: string;
  startTime: number; // Unix timestamp in seconds
  endTime: number;   // Unix timestamp in seconds
  participants?: MeetingParticipant[];
}

// Interface for the Nylas Notetaker invite API response data object
export interface NylasNotetakerInviteResponseData {
  id: string; // This is the notetaker_id
  grant_id: string;
  status: string; // e.g., "pending"
  invite_url: string;
  meeting_details: {
    title: string;
    start_time: number;
    end_time: number;
    participants?: Array<{ email: string; name?: string }>;
  };
  created_at: number;
  updated_at: number;
}

// Interface for the data returned by the Nylas SDK nylas.notetakers.create()
// This is based on the SDK's `Notetaker` type structure.
export interface NylasSDKNotetaker {
  id: string;
  eventId?: string; // this is the event id of the event that the notetaker is associated with
  calendarId?: string; // this is the calendar id of the calendar that the notetaker is associated with
  name?: string; // Name of the notetaker bot
  state: string; // e.g., "pending", "active", "completed", "failed"
  meetingLink: string;
  joinTime?: number; // Unix timestamp, when the notetaker joined (if it has)
  // Other properties like meetingProvider, meetingSettings might exist
  // but we only map what's essential for our InviteNotetakerSuccessData
}

// Updated: Interface for the data field in the successful response of inviteNotetakerToMeeting
// This will now be constructed from the SDK response and input parameters.
export interface InviteNotetakerSuccessData {
  notetakerId: string;    // from SDKNotetaker.id
  grantId: string;        // from function input
  status: string;         // from SDKNotetaker.state
  returnedMeetingLink: string; // from SDKNotetaker.meetingLink
  // The original meeting details that were requested to be invited to.
  // These are NOT from the Nylas response directly, but are part of the successful operation context.
  // requestedMeetingDetails: MeetingDetails; 

  joinTime?: number;       // from SDKNotetaker.joinTime, can be undefined if not joined yet
  // We no longer expect created_at, updated_at from the immediate SDK create response for notetaker.
}

// Params for nylas.notetakers.downloadMedia()
// Based on DownloadNotetakerMediaParams from the SDK reference
export interface DownloadNotetakerMediaParams {
  identifier: string; // grantId
  notetakerId: string;
}

// Structure for individual media items (recording, transcript)
// Based on the expected structure of NotetakerMedia from the SDK reference
export interface MediaItem {
  url: string;
  size: number; // Size in bytes
  filename?: string; 
  contentType?: string;
}

// The structure of the 'data' field in the NylasResponse for downloadMedia
// Based on NotetakerMedia from the SDK reference
export interface NotetakerMedia {
  recording?: MediaItem;
  transcript?: MediaItem;
  // Potentially other media types if applicable
}

// Specific return type for the getNotetakerMedia service function
export interface GetNotetakerMediaResponse {
  success: boolean;
  data?: NotetakerMedia;
  error?: any;
  message?: string;
}

// Params for nylas.notetakers.cancel()
// Based on CancelNotetakerParams from the SDK reference
export interface CancelNotetakerParams {
  identifier: string; // grantId
  notetakerId: string;
}

// Specific return type for the cancelScheduledNotetaker service function
// Nylas SDK's cancel method returns NylasBaseResponse which often means just success/failure and requestId.
export interface CancelNotetakerResponse {
  success: boolean;
  requestId?: string; // From NylasBaseResponse
  message?: string;   // Custom message from our service
  error?: any;        // For detailed error reporting
}

// Specific return type for the inviteNotetakerToMeeting service function
export interface InviteNotetakerToMeetingResponse {
  success: boolean;
  data?: InviteNotetakerSuccessData;
  error?: any; // Can be a NylasApiError or other error types
  message?: string;
}

// Specific return type for the listNotetakers service function
export interface ListNotetakersResponse {
  success: boolean;
  data?: NylasSDKNotetaker[];
  nextCursor?: string;
  error?: any;
  message?: string;
}

// Specific return type for the findNotetakerById service function
export interface FindNotetakerByIdResponse {
  success: boolean;
  data?: NylasSDKNotetaker;
  error?: any;
  message?: string;
} 