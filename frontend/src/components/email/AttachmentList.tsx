import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, File, Image, FileText } from 'lucide-react';
import { AttachmentMetadata } from '@/hooks/useEmailOperations';

export interface AttachmentListProps {
  attachments: AttachmentMetadata[];
  onDownload?: (attachment: AttachmentMetadata) => void;
  showDownloadButton?: boolean;
  compact?: boolean;
}

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

export const AttachmentList: React.FC<AttachmentListProps> = ({
  attachments,
  onDownload,
  showDownloadButton = true,
  compact = false,
}) => {
  if (!attachments || attachments.length === 0) {
    return null;
  }

  const handleDownload = (attachment: AttachmentMetadata) => {
    if (onDownload) {
      onDownload(attachment);
    } else if (attachment.url) {
      // Fallback to direct URL download
      window.open(attachment.url, '_blank');
    }
  };

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {attachments.map((attachment) => (
          <div
            key={attachment.id}
            className="flex items-center gap-2 px-2 py-1 bg-gray-100 rounded text-xs"
          >
            {getFileIcon(attachment.contentType)}
            <span className="text-gray-700 truncate max-w-[120px]">
              {attachment.filename}
            </span>
            {showDownloadButton && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleDownload(attachment)}
                className="h-5 w-5 p-0 text-gray-400 hover:text-gray-600"
              >
                <Download className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-gray-500" />
        <span className="text-sm font-medium text-gray-900">
          Attachments ({attachments.length})
        </span>
      </div>
      
      <div className="space-y-2">
        {attachments.map((attachment) => (
          <div
            key={attachment.id}
            className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
          >
            {getFileIcon(attachment.contentType)}
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {attachment.filename}
              </p>
              <p className="text-xs text-gray-500">
                {formatFileSize(attachment.size)}
              </p>
            </div>

            {showDownloadButton && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleDownload(attachment)}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AttachmentList;
