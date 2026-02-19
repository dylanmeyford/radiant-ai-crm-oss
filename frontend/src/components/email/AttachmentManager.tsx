import React, { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
// import { Progress } from '@/components/ui/progress';
import { Alert } from '@/components/ui/alert';
import { Paperclip, Upload, X, File, Image, FileText, AlertCircle } from 'lucide-react';
import { AttachmentMetadata } from '@/hooks/useEmailOperations';

export interface AttachmentManagerProps {
  attachments: AttachmentMetadata[];
  pendingFiles: File[];
  pendingDeletions?: string[]; // Array of attachment IDs marked for deletion
  onAttachmentsChange: (attachments: AttachmentMetadata[]) => void;
  onPendingFilesChange: (files: File[]) => void;
  organizationId: string;
  maxFiles?: number;
  maxFileSize?: number; // in bytes
  disabled?: boolean;
  onMarkForDeletion?: (attachmentId: string) => void;
  compact?: boolean; // Compact mode - just icon button, no upload area
  onDragActive?: (active: boolean) => void; // Callback for drag state
}

// File type validation
const ALLOWED_FILE_TYPES = [
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  // Archives
  'application/zip',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
];

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const MAX_FILES = 10;

// Get file icon based on type
const getFileIcon = (contentType: string) => {
  if (contentType.startsWith('image/')) {
    return <Image className="h-4 w-4 text-blue-500" />;
  }
  if (contentType.includes('pdf')) {
    return <FileText className="h-4 w-4 text-red-500" />;
  }
  if (contentType.includes('word') || contentType.includes('document')) {
    return <FileText className="h-4 w-4 text-blue-600" />;
  }
  if (contentType.includes('excel') || contentType.includes('spreadsheet')) {
    return <FileText className="h-4 w-4 text-green-600" />;
  }
  if (contentType.includes('powerpoint') || contentType.includes('presentation')) {
    return <FileText className="h-4 w-4 text-orange-600" />;
  }
  return <File className="h-4 w-4 text-gray-500" />;
};

// Format file size
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const AttachmentManager: React.FC<AttachmentManagerProps> = ({
  attachments,
  pendingFiles,
  pendingDeletions = [],
  onAttachmentsChange: _onAttachmentsChange,
  onPendingFilesChange,
  organizationId: _organizationId,
  maxFiles = MAX_FILES,
  maxFileSize = MAX_FILE_SIZE,
  disabled = false,
  onMarkForDeletion,
  compact = false,
  onDragActive,
}) => {
  const [dragActive, setDragActive] = useState(false);
  // const [uploadProgress] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validate files
  const validateFiles = useCallback((files: File[]): { valid: File[]; errors: string[] } => {
    const validFiles: File[] = [];
    const validationErrors: string[] = [];

    // Check total file count (uploaded + pending + new files)
    const totalCurrent = attachments.length + pendingFiles.length;
    if (totalCurrent + files.length > maxFiles) {
      validationErrors.push(`Maximum ${maxFiles} files allowed. You can attach ${maxFiles - totalCurrent} more files.`);
      return { valid: [], errors: validationErrors };
    }

    files.forEach((file) => {
      // Check file size
      if (file.size > maxFileSize) {
        validationErrors.push(`${file.name} is too large. Maximum size is ${formatFileSize(maxFileSize)}.`);
        return;
      }

      // Check file type
      if (!ALLOWED_FILE_TYPES.includes(file.type)) {
        validationErrors.push(`${file.name} has an unsupported file type.`);
        return;
      }

      // Check for duplicates in uploaded attachments
      const isDuplicateUploaded = attachments.some(attachment => 
        attachment.filename === file.name && attachment.size === file.size
      );
      // Check for duplicates in pending files
      const isDuplicatePending = pendingFiles.some(pf => pf.name === file.name && pf.size === file.size);
      if (isDuplicateUploaded || isDuplicatePending) {
        validationErrors.push(`${file.name} is already attached.`);
        return;
      }

      validFiles.push(file);
    });

    return { valid: validFiles, errors: validationErrors };
  }, [attachments, pendingFiles, maxFiles, maxFileSize]);

  // Handle file staging (add to pending files)
  const handleFileSelection = useCallback((files: File[]) => {
    if (files.length === 0) return;

    const { valid: validFiles, errors: validationErrors } = validateFiles(files);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    if (validFiles.length === 0) return;

    setErrors([]);
    onPendingFilesChange([...pendingFiles, ...validFiles]);
  }, [pendingFiles, onPendingFilesChange, validateFiles]);

  // Handle file selection
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    handleFileSelection(files);
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleFileSelection]);

  // Handle drag and drop
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
      onDragActive?.(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
      onDragActive?.(false);
    }
  }, [onDragActive]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    onDragActive?.(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    handleFileSelection(files);
  }, [disabled, handleFileSelection, onDragActive]);

  // Handle attachment removal
  const handleRemoveAttachment = useCallback((attachment: AttachmentMetadata) => {
    // Stage deletion: notify parent to mark for deletion (don't remove from UI yet)
    onMarkForDeletion?.(attachment.id);
  }, [onMarkForDeletion]);

  // Handle pending file removal
  const handleRemovePendingFile = useCallback((file: File) => {
    onPendingFilesChange(pendingFiles.filter(f => !(f.name === file.name && f.size === file.size)));
  }, [pendingFiles, onPendingFilesChange]);

  // Calculate total size (uploaded + pending)
  const totalSize = attachments.reduce((sum, attachment) => sum + attachment.size, 0) +
                    pendingFiles.reduce((sum, file) => sum + file.size, 0);

  // Compact mode - just icon button and file list
  if (compact) {
    return (
      <div className="space-y-3">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_FILE_TYPES.join(',')}
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled}
        />

        {/* Paperclip Icon Button */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => !disabled && fileInputRef.current?.click()}
          disabled={disabled}
          className="h-8 w-8 p-0 text-gray-600 hover:text-gray-900"
          title="Attach files"
        >
          <Paperclip className="h-4 w-4" />
        </Button>

        {/* Pending Files */}
        {pendingFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-900">Pending Files</p>
            {pendingFiles.map((file) => (
              <div
                key={`${file.name}-${file.size}`}
                className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200"
              >
                {getFileIcon(file.type)}
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 break-words">
                    {file.name}
                  </p>
                  <p className="text-xs text-blue-600">
                    {formatFileSize(file.size)} • Ready to upload
                  </p>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemovePendingFile(file)}
                  disabled={disabled}
                  className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 flex-shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Error Messages */}
        {errors.length > 0 && (
          <Alert className="border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <div className="ml-2">
              <p className="text-sm font-medium text-red-800">Upload errors:</p>
              <ul className="text-xs text-red-700 mt-1 space-y-1">
                {errors.map((error, index) => (
                  <li key={index}>• {error}</li>
                ))}
              </ul>
            </div>
          </Alert>
        )}

        {/* Attached Files List */}
        {attachments.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900">
                Attachments ({attachments.length})
              </p>
              <p className="text-xs text-gray-500">
                {formatFileSize(totalSize)}
              </p>
            </div>

            <div className="space-y-2">
              {attachments.map((attachment) => {
                const isPendingDeletion = pendingDeletions.includes(attachment.id);
                return (
                  <div
                    key={attachment.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                      isPendingDeletion 
                        ? 'bg-red-50 border-red-200 opacity-60' 
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    {getFileIcon(attachment.contentType)}
                    
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${
                        isPendingDeletion ? 'text-red-700 line-through' : 'text-gray-900'
                      }`}>
                        {attachment.filename}
                      </p>
                      <div className="flex items-center gap-2">
                        <p className={`text-xs ${
                          isPendingDeletion ? 'text-red-600' : 'text-gray-500'
                        }`}>
                          {formatFileSize(attachment.size)} • {isPendingDeletion ? 'Pending deletion' : 'Attached'}
                        </p>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveAttachment(attachment)}
                      disabled={disabled || isPendingDeletion}
                      className={`h-8 w-8 p-0 ${
                        isPendingDeletion 
                          ? "text-gray-400 cursor-not-allowed" 
                          : "text-gray-400 hover:text-red-600"
                      }`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full mode - with upload area
  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        className={`
          relative border-2 border-dashed rounded-lg p-6 text-center transition-colors
          ${dragActive 
            ? 'border-blue-400 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_FILE_TYPES.join(',')}
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled}
        />

        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Paperclip className="h-5 w-5 text-gray-400" />
            <Upload className="h-5 w-5 text-gray-400" />
          </div>
          
          <div>
            <p className="text-sm font-medium text-gray-900">
              {dragActive ? 'Drop files here' : 'Drag files here or click to select'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Up to {maxFiles} files, {formatFileSize(maxFileSize)} each
            </p>
          </div>

          {!disabled && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              <Upload className="h-4 w-4 mr-2" />
              Select Files
            </Button>
          )}
        </div>
      </div>

      {/* Pending Files */}
      {pendingFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-900">Pending Files</p>
          {pendingFiles.map((file) => (
            <div
              key={`${file.name}-${file.size}`}
              className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200"
            >
              {getFileIcon(file.type)}
              
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 break-words">
                  {file.name}
                </p>
                <p className="text-xs text-blue-600">
                  {formatFileSize(file.size)} • Ready to upload
                </p>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleRemovePendingFile(file)}
                disabled={disabled}
                className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Error Messages */}
      {errors.length > 0 && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <div className="ml-2">
            <p className="text-sm font-medium text-red-800">Upload errors:</p>
            <ul className="text-xs text-red-700 mt-1 space-y-1">
              {errors.map((error, index) => (
                <li key={index}>• {error}</li>
              ))}
            </ul>
          </div>
        </Alert>
      )}

      {/* Attached Files List */}
      {(attachments.length > 0 || pendingFiles.length > 0) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900">
              Attached Files ({attachments.length + pendingFiles.length})
            </p>
            <p className="text-xs text-gray-500">
              Total: {formatFileSize(totalSize)}
            </p>
          </div>

                     <div className="space-y-2">
             {attachments.map((attachment) => {
               const isPendingDeletion = pendingDeletions.includes(attachment.id);
               return (
                 <div
                   key={attachment.id}
                   className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                     isPendingDeletion 
                       ? 'bg-red-50 border-red-200 opacity-60' 
                       : 'bg-gray-50 border-gray-200'
                   }`}
                 >
                   {getFileIcon(attachment.contentType)}
                   
                   <div className="flex-1 min-w-0">
                     <p className={`text-sm font-medium truncate ${
                       isPendingDeletion ? 'text-red-700 line-through' : 'text-gray-900'
                     }`}>
                       {attachment.filename}
                     </p>
                     <div className="flex items-center gap-2">
                       <p className={`text-xs ${
                         isPendingDeletion ? 'text-red-600' : 'text-gray-500'
                       }`}>
                         {formatFileSize(attachment.size)} • {isPendingDeletion ? 'Pending deletion' : 'Uploaded'}
                       </p>
                     </div>
                   </div>

                   <Button
                     type="button"
                     variant="ghost"
                     size="sm"
                     onClick={() => handleRemoveAttachment(attachment)}
                     disabled={disabled || isPendingDeletion}
                     className={`h-8 w-8 p-0 ${
                       isPendingDeletion 
                         ? "text-gray-400 cursor-not-allowed" 
                         : "text-gray-400 hover:text-red-600"
                     }`}
                   >
                     <X className="h-4 w-4" />
                   </Button>
                 </div>
               );
             })}
           </div>
        </div>
      )}

      {/* File Limits Info */}
      {(attachments.length > 0 || pendingFiles.length > 0) && (
        <div className="text-xs text-gray-500 space-y-1">
          <p>Files: {attachments.length + pendingFiles.length} / {maxFiles}</p>
          <p>
            Size: {formatFileSize(totalSize)} / {formatFileSize(maxFileSize * maxFiles)}
          </p>
        </div>
      )}
    </div>
  );
};

export default AttachmentManager;
