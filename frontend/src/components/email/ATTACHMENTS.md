# Email Attachments Implementation

This document describes the email attachment functionality implemented in the frontend to work with the backend's multipart/form-data upload system.

## Overview

The email attachment system provides a complete solution for:
- Uploading files with drag & drop or file selection
- Validating file types and sizes
- Managing attachment metadata
- Displaying attachments in emails
- Handling upload progress and errors

## Components

### 1. AttachmentManager

The main component for managing file uploads and attachments in the email editor.

```tsx
import { AttachmentManager } from '@/components/email';

<AttachmentManager
  attachments={emailData.attachments || []}
  onAttachmentsChange={(attachments) => updateField('attachments', attachments)}
  organizationId={organizationId}
  onUpload={onUploadAttachments}
  onDelete={onDeleteAttachment}
  isUploading={isUploadingAttachments}
  disabled={isLoading}
/>
```

**Features:**
- Drag & drop file upload area
- File selection button
- Real-time upload progress indicators
- File validation (type, size, count)
- Attachment list with remove buttons
- Error handling and display

**Props:**
- `attachments`: Array of current attachment metadata
- `onAttachmentsChange`: Callback when attachments change
- `organizationId`: Required for backend upload
- `onUpload`: Function to handle file uploads
- `onDelete`: Function to handle attachment deletion
- `isUploading`: Loading state for uploads
- `disabled`: Disable all interactions

### 2. AttachmentList

Component for displaying attachments in email viewers and other read-only contexts.

```tsx
import { AttachmentList } from '@/components/email';

<AttachmentList
  attachments={email.attachments}
  onDownload={handleDownload}
  showDownloadButton={true}
  compact={false}
/>
```

**Features:**
- File icons based on content type
- File size formatting
- Download buttons
- Compact and full display modes

**Props:**
- `attachments`: Array of attachment metadata
- `onDownload`: Optional download handler
- `showDownloadButton`: Show/hide download buttons
- `compact`: Use compact display mode

### 3. Enhanced EmailEditor

The EmailEditor component now includes attachment functionality when `organizationId` is provided.

```tsx
import { EmailEditor } from '@/components/email';

<EmailEditor
  organizationId={organizationId}
  onUploadAttachments={handleUploadAttachments}
  onDeleteAttachment={handleDeleteAttachment}
  isUploadingAttachments={isUploadingAttachments}
  // ... other props
/>
```

## Hook Integration

### useEmailOperations

The `useEmailOperations` hook has been extended with attachment operations:

```tsx
import { useEmailOperations } from '@/hooks/useEmailOperations';

const {
  // Existing operations...
  
  // New attachment operations
  uploadAttachments,
  deleteAttachment,
  getAttachmentMetadata,
  isUploadingAttachments,
  isDeletingAttachment,
  isLoadingAttachmentMetadata,
} = useEmailOperations();
```

**New Functions:**
- `uploadAttachments(files: File[], organizationId: string)`: Upload files and return metadata
- `deleteAttachment(attachmentId: string)`: Delete a specific attachment
- `getAttachmentMetadata(activityId: string)`: Get attachment metadata for an email

## Data Types

### AttachmentMetadata

```tsx
interface AttachmentMetadata {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  url?: string;        // For downloading
  filePath?: string;   // Backend storage path
}
```

### Updated EmailData

```tsx
interface EmailData {
  // ... existing fields
  attachments?: AttachmentMetadata[];
}
```

## File Validation

### Supported File Types
- **Documents**: PDF, Word, Excel, PowerPoint, Plain Text, CSV
- **Images**: JPEG, PNG, GIF, WebP, SVG
- **Archives**: ZIP, RAR, 7Z

### Limits
- **File Size**: 25MB per file (configurable)
- **File Count**: 10 files per email (configurable)
- **Total Size**: 250MB per email (10 × 25MB)

### Validation Rules
- File type checking against allowed MIME types
- File size validation
- Duplicate file detection (name + size)
- Total file count limits

## Usage Examples

### Basic Implementation

```tsx
import { useEmailOperations } from '@/hooks/useEmailOperations';
import { EmailEditor } from '@/components/email';

const MyEmailComponent = () => {
  const {
    uploadAttachments,
    deleteAttachment,
    isUploadingAttachments,
  } = useEmailOperations();

  const handleUploadAttachments = async (files: File[]) => {
    try {
      const result = await uploadAttachments(files, organizationId);
      return result;
    } catch (error) {
      return { success: false, error: 'Upload failed' };
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    try {
      const result = await deleteAttachment(attachmentId);
      return result;
    } catch (error) {
      return { success: false, error: 'Delete failed' };
    }
  };

  return (
    <EmailEditor
      organizationId={organizationId}
      onUploadAttachments={handleUploadAttachments}
      onDeleteAttachment={handleDeleteAttachment}
      isUploadingAttachments={isUploadingAttachments}
      // ... other props
    />
  );
};
```

### Displaying Attachments

```tsx
import { AttachmentList } from '@/components/email';

const EmailViewer = ({ email }) => {
  const handleDownload = (attachment) => {
    // Handle download logic
    window.open(attachment.url, '_blank');
  };

  return (
    <div>
      {/* Email content */}
      
      {email.attachments && email.attachments.length > 0 && (
        <AttachmentList
          attachments={email.attachments}
          onDownload={handleDownload}
        />
      )}
    </div>
  );
};
```

## Backend Integration

The frontend integrates with the backend's attachment system:

1. **Upload**: `POST /api/email-activities/attachments/upload`
   - Sends multipart/form-data with files
   - Returns attachment metadata

2. **Delete**: `DELETE /api/email-activities/attachments/:attachmentId`
   - Removes attachment from storage

3. **Download**: `GET /api/email-activities/attachments/:activityId/:attachmentId`
   - Downloads attachment file

4. **Metadata**: `GET /api/email-activities/attachments/:activityId`
   - Gets attachment metadata for an email

## Error Handling

The system handles various error scenarios:

- **Upload Errors**: Network failures, file validation errors, storage errors
- **Delete Errors**: Network failures, permission errors
- **Validation Errors**: File type, size, count violations
- **UI Feedback**: Progress indicators, error messages, retry options

## Performance Considerations

- **Immediate Upload**: Files are uploaded as soon as selected for better UX
- **Progress Indicators**: Visual feedback during upload process
- **Optimistic Updates**: UI updates immediately with rollback on errors
- **File Streaming**: Backend streams files to Nylas without loading into memory
- **Cleanup**: Temporary files are automatically cleaned up after email sending

## Security Features

- **File Type Validation**: Only allowed MIME types accepted
- **Size Limits**: Prevents oversized uploads
- **Filename Sanitization**: Safe filename handling
- **Path Traversal Protection**: Secure file storage paths
- **Organization Isolation**: Files scoped to organization

## Testing

See `EmailEditorExample.tsx` for a complete working example with attachment functionality.

## Future Enhancements

Potential improvements:
- Image preview thumbnails
- Drag & drop reordering
- Attachment templates
- Bulk upload progress
- Cloud storage integration
- Virus scanning integration
