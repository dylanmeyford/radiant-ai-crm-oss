import React from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmailFromRecipient } from './EmailEditor';

interface ConnectedAccount {
  _id: string;
  email: string;
  provider: string;
  syncStatus: "active" | "disconnected" | "error" | "expired";
  grantId: string;
  calendars: string[];
  emailSignature?: string;
}

export interface FromFieldProps {
  /** Currently selected from address */
  value?: EmailFromRecipient;
  /** Available email connections */
  connections: ConnectedAccount[];
  /** Callback when selection changes */
  onChange: (from: EmailFromRecipient | undefined) => void;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Error message to display */
  error?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Whether to show the label (default: true) */
  showLabel?: boolean;
}

export const FromField: React.FC<FromFieldProps> = ({
  value,
  connections,
  onChange,
  disabled = false,
  error,
  required = false,
  showLabel = true,
}) => {
  // Filter connections that are active (all Nylas connections support email)
  const emailConnections = connections.filter(
    (conn) => conn.syncStatus === 'active'
  );

  const handleValueChange = (connectionId: string) => {
    if (!connectionId) {
      onChange(undefined);
      return;
    }

    const selectedConnection = emailConnections.find(conn => conn._id === connectionId);
    if (selectedConnection) {
      onChange({
        email: selectedConnection.email,
        connectionId: selectedConnection._id,
        name: selectedConnection.email // Could be enhanced with display name
      });
    }
  };

  return (
    <div className="space-y-2">
      {showLabel && (
        <Label className="text-sm font-medium text-gray-900">
          From {required && <span className="text-red-500">*</span>}
        </Label>
      )}
      <Select
        value={value?.connectionId || ''}
        onValueChange={handleValueChange}
        disabled={disabled || emailConnections.length === 0}
      >
        <SelectTrigger className={`w-full ${error ? 'border-red-300' : ''}`}>
          <SelectValue 
            placeholder={
              emailConnections.length === 0 
                ? "No email accounts connected" 
                : "Select email account..."
            } 
          />
        </SelectTrigger>
        <SelectContent>
          {emailConnections.map((connection) => (
            <SelectItem key={connection._id} value={connection._id}>
              <div className="flex items-center justify-between w-full">
                <span>{connection.email}</span>
                <span className="text-xs text-gray-500 ml-2">
                  {connection.provider}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
      {emailConnections.length === 0 && (
        <p className="text-xs text-gray-500">
          No email accounts are connected. Please connect an email account in settings.
        </p>
      )}
    </div>
  );
};

export default FromField;
