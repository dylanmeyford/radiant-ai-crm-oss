import React from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { ContactSelector } from './ContactSelector';
import { Contact } from '@/types/prospect';
import { EmailRecipient } from './EmailEditor';

export interface EmailFieldProps {
  /** Field label (To, CC, BCC) */
  label: string;
  /** Current recipients */
  recipients: EmailRecipient[];
  /** Available contacts */
  contacts: Contact[];
  /** Callback when recipients change */
  onChange: (recipients: EmailRecipient[]) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Whether field is required */
  required?: boolean;
  /** Error message */
  error?: string;
  /** Callback when field should be removed (for CC/BCC) */
  onRemove?: () => void;
  /** Whether field is disabled */
  disabled?: boolean;
  /** Maximum number of recipients */
  maxRecipients?: number;
}

export const EmailField: React.FC<EmailFieldProps> = ({
  label,
  recipients,
  contacts,
  onChange,
  placeholder,
  required = false,
  error,
  onRemove,
  disabled = false,
  maxRecipients
}) => {
  return (
    <div className="space-y-2">
      {/* Label and Remove Button - only show if label has content */}
      {label && label.trim() && (
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium text-gray-900">
            {label} {required && <span className="text-red-500">*</span>}
          </Label>
          {onRemove && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onRemove}
              className="h-6 w-6 text-gray-400 hover:text-gray-600"
              title={`Remove ${label}`}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}

      {/* Contact Selector with inline remove button when no label */}
      <div className="relative">
        <ContactSelector
          contacts={contacts}
          selectedRecipients={recipients}
          onSelectionChange={onChange}
          placeholder={placeholder || (label ? `Add ${label.toLowerCase()} recipients...` : 'Add recipients...')}
          disabled={disabled}
          maxRecipients={maxRecipients}
          allowCustomEmails={true}
        />
        {/* Remove button positioned inline when no label */}
        {onRemove && (!label || !label.trim()) && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="absolute top-2 right-8 h-6 w-6 text-gray-400 hover:text-gray-600 z-10"
            title="Remove field"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
};

export default EmailField;
