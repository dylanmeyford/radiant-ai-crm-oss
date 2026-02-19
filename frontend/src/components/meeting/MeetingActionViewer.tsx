import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import TipTapEditor, { isHTML, plainTextToHTML } from '@/components/ui/TipTapEditor';
import { EmailField } from '@/components/email/EmailField';
import { useNylasConnections } from '@/hooks/useNylasConnections';
import { useCalendars } from '@/hooks/useCalendars';
import { useContactOperations } from '@/hooks/useContactOperations';
import {
  extractTimezoneFromDate,
  formatDateForLocalInput,
  formatDateWithTimezone,
  getBrowserTimezone,
  getTimezoneOptions,
  parseLocalDateTimeToTimezone
} from '@/lib/timezoneUtils';

type MeetingMode = 'create' | 'update' | 'cancel';

type MeetingActionViewerProps = {
  action: any;
  onChange: (field: string, value: any) => void;
  isDisabled?: boolean;
};

const modeMeta: Record<MeetingMode, { label: string; badgeClass: string }> = {
  create: {
    label: 'New Meeting',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200'
  },
  update: {
    label: 'Update Meeting',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200'
  },
  cancel: {
    label: 'Cancel Meeting',
    badgeClass: 'bg-red-50 text-red-700 border-red-200'
  }
};

const processContentForEditor = (content: string | undefined | null): string => {
  if (!content) return '';
  return isHTML(content) ? content : plainTextToHTML(content);
};

const baseRowClass = 'flex items-start gap-3 group -mx-2 px-2 py-1 rounded transition-colors';

const MeetingActionViewer: React.FC<MeetingActionViewerProps> = ({ action, onChange, isDisabled = false }) => {
  const details = action?.details || {};
  const mode = (details.mode || 'create') as MeetingMode;
  const isCancelMode = mode === 'cancel';
  const isReadOnly = isDisabled || isCancelMode;

  const [editingField, setEditingField] = useState<string | null>(null);
  const [selectedTimezone, setSelectedTimezone] = useState<string>(getBrowserTimezone());
  const [displayDateTime, setDisplayDateTime] = useState<string>('');

  const timezoneOptions = getTimezoneOptions();

  const { connections, isLoading: isLoadingConnections } = useNylasConnections();
  const activeConnections = useMemo(
    () => connections.filter((connection) => connection.syncStatus === 'active'),
    [connections]
  );

  const selectedConnectionId: string = details.connectionId || '';
  const selectedConnection = activeConnections.find((connection) => connection._id === selectedConnectionId);
  const autoLocationLabel = useMemo(() => {
    const provider = (selectedConnection?.provider || '').toLowerCase();
    if (provider.includes('google') || provider.includes('gmail')) return 'Google Meet';
    if (provider.includes('microsoft') || provider.includes('outlook')) return 'Microsoft Teams';
    return 'Video Conferencing';
  }, [selectedConnection?.provider]);

  const { calendars, isLoadingCalendars } = useCalendars(selectedConnectionId);

  const { useContactsByProspect } = useContactOperations();
  const prospectId = action?.opportunity?.prospect?._id || action?.prospectId || '';
  const contactsQuery = useContactsByProspect(prospectId);
  const contacts = contactsQuery.data || [];

  const attendees = useMemo(() => {
    const attendeeEmails = Array.isArray(details.attendees) ? details.attendees : [];
    return attendeeEmails
      .filter((email: string) => !!email?.trim())
      .map((email: string) => {
        const trimmedEmail = email.trim();
        const matchingContact = contacts.find((contact: any) =>
          Array.isArray(contact.emails)
            ? contact.emails.some((contactEmail: any) => contactEmail?.address?.toLowerCase() === trimmedEmail.toLowerCase())
            : false
        );

        if (matchingContact) {
          return {
            email: trimmedEmail,
            name: `${matchingContact.firstName || ''} ${matchingContact.lastName || ''}`.trim(),
            contactId: matchingContact._id
          };
        }

        return {
          email: trimmedEmail,
          name: trimmedEmail
        };
      });
  }, [details.attendees, contacts]);

  useEffect(() => {
    if (details.scheduledFor) {
      const parsedDate = new Date(details.scheduledFor);
      const timezone = extractTimezoneFromDate(parsedDate, details.timezone);
      setSelectedTimezone(timezone);
      setDisplayDateTime(formatDateForLocalInput(parsedDate, timezone));
    } else {
      setSelectedTimezone(getBrowserTimezone());
      setDisplayDateTime('');
    }
  }, [details.scheduledFor, details.timezone]);

  const updateField = useCallback(
    (field: string, value: any) => {
      onChange(field, value);
    },
    [onChange]
  );

  const handleTimezoneChange = useCallback(
    (newTimezone: string) => {
      setSelectedTimezone(newTimezone);
      if (!displayDateTime) return;

      try {
        const newDate = parseLocalDateTimeToTimezone(displayDateTime, newTimezone);
        updateField('scheduledFor', newDate.toISOString());
        updateField('timezone', newTimezone);
      } catch (error) {
        console.error('Error converting meeting timezone:', error);
      }
    },
    [displayDateTime, updateField]
  );

  const handleDateTimeChange = useCallback(
    (dateTimeValue: string) => {
      setDisplayDateTime(dateTimeValue);
      if (!dateTimeValue) {
        updateField('scheduledFor', null);
        return;
      }

      try {
        const parsedDate = parseLocalDateTimeToTimezone(dateTimeValue, selectedTimezone);
        updateField('scheduledFor', parsedDate.toISOString());
        updateField('timezone', selectedTimezone);
      } catch (error) {
        console.error('Error parsing meeting datetime:', error);
        updateField('scheduledFor', new Date(dateTimeValue).toISOString());
      }
    },
    [selectedTimezone, updateField]
  );

  const renderClickableRowClass = (field: string) => {
    const interactive = !isReadOnly;
    return `${baseRowClass} ${interactive ? 'cursor-pointer hover:bg-gray-50' : ''} ${
      editingField === field ? 'bg-gray-50' : ''
    }`;
  };

  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${isDisabled ? 'opacity-60 pointer-events-none' : ''}`}>
      <div className="p-4 space-y-1">
        <div className="flex items-center">
          <Badge variant="outline" className={modeMeta[mode].badgeClass}>
            {modeMeta[mode].label}
          </Badge>
        </div>

        {mode !== 'create' && details.existingCalendarActivityId && (
          <div className={baseRowClass}>
            <Label className="text-sm text-gray-600 w-20 flex-shrink-0 pt-2">Existing</Label>
            <div className="flex-1 min-w-0 text-sm text-gray-900 pt-2 break-all">{details.existingCalendarActivityId}</div>
          </div>
        )}

        <div className={renderClickableRowClass('connectionId')} onClick={() => !isReadOnly && setEditingField('connectionId')}>
          <Label className="text-sm text-gray-600 w-20 flex-shrink-0 pt-2">Account</Label>
          <div className="flex-1 min-w-0">
            {!isReadOnly && editingField === 'connectionId' ? (
              <Select
                value={selectedConnectionId}
                onValueChange={(connectionId) => {
                  updateField('connectionId', connectionId);
                  updateField('calendarId', null);
                }}
                disabled={isLoadingConnections}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={activeConnections.length ? 'Select account...' : 'No active accounts connected'} />
                </SelectTrigger>
                <SelectContent>
                  {activeConnections.map((connection) => (
                    <SelectItem key={connection._id} value={connection._id}>
                      <div className="flex items-center justify-between w-full">
                        <span>{connection.email}</span>
                        <span className="text-xs text-gray-500 ml-2">{connection.provider}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="text-sm text-gray-900 pt-2">
                {selectedConnection ? `${selectedConnection.email} (${selectedConnection.provider})` : 'Click to select account'}
              </div>
            )}
          </div>
        </div>

        <div className={renderClickableRowClass('calendarId')} onClick={() => !isReadOnly && setEditingField('calendarId')}>
          <Label className="text-sm text-gray-600 w-20 flex-shrink-0 pt-2">Calendar</Label>
          <div className="flex-1 min-w-0">
            {!isReadOnly && editingField === 'calendarId' ? (
              <Select
                value={details.calendarId || ''}
                onValueChange={(calendarId) => updateField('calendarId', calendarId)}
                disabled={!selectedConnectionId || isLoadingCalendars}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      !selectedConnectionId
                        ? 'Select account first'
                        : calendars.length
                        ? 'Select calendar...'
                        : 'No calendars available'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {calendars.map((calendar) => (
                    <SelectItem key={calendar.id} value={calendar.id}>
                      <div className="flex items-center justify-between w-full">
                        <span>{calendar.name}</span>
                        {calendar.isSubscribed ? <span className="text-xs text-gray-500 ml-2">Subscribed</span> : null}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="text-sm text-gray-900 pt-2">
                {calendars.find((calendar) => calendar.id === details.calendarId)?.name || details.calendarId || 'Click to select calendar'}
              </div>
            )}
          </div>
        </div>
      </div>

      {!isCancelMode && (
        <>
          <Separator />
          <div className="p-4 space-y-1">
            <div className={renderClickableRowClass('title')} onClick={() => !isReadOnly && setEditingField('title')}>
              <Label className="text-sm text-gray-600 w-20 flex-shrink-0 pt-2">Title</Label>
              <div className="flex-1 min-w-0">
                {!isReadOnly && editingField === 'title' ? (
                  <Input
                    value={details.title || ''}
                    onChange={(event) => updateField('title', event.target.value)}
                    placeholder="Meeting title"
                    className="w-full"
                  />
                ) : (
                  <div className="text-sm text-gray-900 pt-2">{details.title || 'Click to add meeting title'}</div>
                )}
              </div>
            </div>

            <div className={renderClickableRowClass('attendees')} onClick={() => !isReadOnly && setEditingField('attendees')}>
              <Label className="text-sm text-gray-600 w-20 flex-shrink-0 pt-2">Attendees</Label>
              <div className="flex-1 min-w-0">
                {!isReadOnly && editingField === 'attendees' ? (
                  <EmailField
                    label=""
                    recipients={attendees}
                    contacts={contacts}
                    onChange={(recipients) => updateField('attendees', recipients.map((recipient) => recipient.email))}
                    placeholder="Add attendees..."
                    required
                  />
                ) : attendees.length ? (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {attendees.map((attendee: any, index: number) => (
                      <Badge key={`${attendee.email}-${index}`} variant="secondary" className="text-xs">
                        {attendee.name !== attendee.email ? attendee.name : attendee.email}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 pt-2">Click to add attendees</div>
                )}
              </div>
            </div>

            <div className={renderClickableRowClass('duration')} onClick={() => !isReadOnly && setEditingField('duration')}>
              <Label className="text-sm text-gray-600 w-20 flex-shrink-0 pt-2">Duration</Label>
              <div className="flex-1 min-w-0">
                {!isReadOnly && editingField === 'duration' ? (
                  <Input
                    type="number"
                    min="15"
                    max="480"
                    value={details.duration || 60}
                    onChange={(event) => updateField('duration', Number(event.target.value) || 60)}
                    className="w-full"
                  />
                ) : (
                  <div className="text-sm text-gray-900 pt-2">{details.duration ? `${details.duration} minutes` : 'Click to set duration'}</div>
                )}
              </div>
            </div>

            <div className={renderClickableRowClass('scheduledFor')} onClick={() => !isReadOnly && setEditingField('scheduledFor')}>
              <Label className="text-sm text-gray-600 w-20 flex-shrink-0 pt-2">When</Label>
              <div className="flex-1 min-w-0">
                {!isReadOnly && editingField === 'scheduledFor' ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        type="datetime-local"
                        value={displayDateTime}
                        onChange={(event) => handleDateTimeChange(event.target.value)}
                        className="flex-1"
                      />
                      <Select value={selectedTimezone} onValueChange={handleTimezoneChange}>
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="Timezone" />
                        </SelectTrigger>
                        <SelectContent>
                          {timezoneOptions.map((timezoneOption) => (
                            <SelectItem key={timezoneOption.value} value={timezoneOption.value}>
                              {timezoneOption.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {details.scheduledFor && (
                      <div className="text-xs text-gray-500">
                        {formatDateWithTimezone(new Date(details.scheduledFor), selectedTimezone)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-gray-900 pt-2">
                    {details.scheduledFor
                      ? formatDateWithTimezone(new Date(details.scheduledFor), selectedTimezone)
                      : 'Click to schedule meeting'}
                  </div>
                )}
              </div>
            </div>

            <div className={baseRowClass}>
              <Label className="text-sm text-gray-600 w-20 flex-shrink-0 pt-2">Location</Label>
              <div className="flex-1 min-w-0 pt-2">
                <div className="text-sm text-gray-900">{autoLocationLabel}</div>
                <div className="text-xs text-gray-500">Link will be created automatically.</div>
              </div>
            </div>

          </div>

          <Separator />
          <div className="px-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm text-gray-600">Agenda</Label>
              <TipTapEditor
                content={processContentForEditor(details.agenda)}
                onChange={(html) => updateField('agenda', html)}
                placeholder="Meeting agenda and objectives..."
                editable={!isReadOnly}
              />
            </div>
          </div>
        </>
      )}

      {isCancelMode && (
        <>
          <Separator />
          <div className="px-4 py-4">
            <p className="text-sm text-gray-900">This meeting will be cancelled when the action is executed.</p>
          </div>
        </>
      )}
    </div>
  );
};

export default MeetingActionViewer;
