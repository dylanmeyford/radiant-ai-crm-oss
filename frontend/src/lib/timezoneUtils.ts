/**
 * Timezone utilities for handling timezone conversions and selections
 */

export interface TimezoneOption {
  value: string;
  label: string;
  offset: string;
}

/**
 * Get the user's browser timezone
 */
export const getBrowserTimezone = (): string => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
};

/**
 * Common timezone options with their labels and current offsets
 */
export const getTimezoneOptions = (): TimezoneOption[] => {
  const now = new Date();
  
  const timezones = [
    'America/New_York',
    'America/Chicago', 
    'America/Denver',
    'America/Los_Angeles',
    'America/Toronto',
    'America/Vancouver',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Europe/Madrid',
    'Europe/Rome',
    'Europe/Amsterdam',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Asia/Seoul',
    'Asia/Kolkata',
    'Asia/Dubai',
    'Australia/Sydney',
    'Australia/Melbourne',
    'Pacific/Auckland',
    'UTC'
  ];

  return timezones.map(tz => {
    try {
      const formatter = new Intl.DateTimeFormat('en', {
        timeZone: tz,
        timeZoneName: 'short'
      });
      
      // Get the timezone abbreviation
      const parts = formatter.formatToParts(now);
      const timeZoneName = parts.find(part => part.type === 'timeZoneName')?.value || '';
      
      // Calculate offset
      const date1 = new Date(now.toLocaleString("en-US", {timeZone: "UTC"}));
      const date2 = new Date(now.toLocaleString("en-US", {timeZone: tz}));
      const offset = (date2.getTime() - date1.getTime()) / (1000 * 60 * 60);
      const offsetStr = `GMT${offset >= 0 ? '+' : ''}${offset}`;
      
      // Format display name
      const displayNameParts = tz.replace(/_/g, ' ').split('/');
      const displayName = displayNameParts[displayNameParts.length - 1];
      
      return {
        value: tz,
        label: `${displayName} (${timeZoneName})`,
        offset: offsetStr
      };
    } catch (error) {
      console.error(`Error processing timezone ${tz}:`, error);
      return {
        value: tz,
        label: tz.replace(/_/g, ' '),
        offset: 'Unknown'
      };
    }
  }).sort((a, b) => a.label.localeCompare(b.label));
};

/**
 * Convert a date to preserve the same display time in a different timezone
 * Example: 9am Sydney -> 9am London (but different UTC times)
 */
export const preserveDisplayTimeInTimezone = (date: Date, fromTimezone: string, toTimezone: string): Date => {
  try {
    // Get the display time components in the source timezone
    const sourceFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: fromTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const dateStr = sourceFormatter.format(date);
    const [datePart, timePart] = dateStr.split(', ');
    
    // Now we want this same display time but in the new timezone
    const localDateTimeStr = `${datePart}T${timePart}`;
    
    // Parse this time as if it were in the target timezone
    return parseLocalDateTimeToTimezone(localDateTimeStr, toTimezone);
  } catch (error) {
    console.error('Error preserving display time in timezone:', error);
    return date;
  }
};

/**
 * Extract timezone from a Date object if it was created with timezone info
 * Falls back to browser timezone
 * Note: Date objects don't contain timezone info, so this needs to be stored separately in real apps
 */
export const extractTimezoneFromDate = (_date: Date, storedTimezone?: string): string => {
  // If we have a stored timezone from the data, use that
  if (storedTimezone) {
    return storedTimezone;
  }
  
  // Otherwise, fall back to browser timezone
  // In a real app, you would store the timezone info alongside the date
  return getBrowserTimezone();
};

/**
 * Format a date for display with timezone info
 */
export const formatDateWithTimezone = (date: Date, timezone: string): string => {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    });
    return formatter.format(date);
  } catch (error) {
    console.error('Error formatting date with timezone:', error);
    return date.toLocaleString();
  }
};

/**
 * Convert a local datetime-local input value to a Date object in a specific timezone
 * This interprets the datetime string as if it were in the specified timezone
 */
export const parseLocalDateTimeToTimezone = (localDateTime: string, timezone: string): Date => {
  if (!localDateTime) throw new Error('No datetime provided');
  
  try {
    // The key insight: we need to create a Date that when displayed in the target timezone
    // shows our desired local time. We'll use the inverse of the timezone offset calculation.
    
    // Step 1: Parse the input as if it were UTC
    const utcDate = new Date(localDateTime + 'Z'); // Adding 'Z' makes it parse as UTC
    
    // Step 2: Find what this UTC time displays as in our target timezone
    const targetFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    const targetDisplay = targetFormatter.format(utcDate);
    
    // Step 3: Find what this same UTC time displays as in UTC
    const utcFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit', 
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    const utcDisplay = utcFormatter.format(utcDate);
    
    // Step 4: Calculate the difference and adjust
    const targetTime = new Date(targetDisplay.replace(', ', 'T') + 'Z');
    const utcTime = new Date(utcDisplay.replace(', ', 'T') + 'Z');
    const offsetMs = utcTime.getTime() - targetTime.getTime();
    
    // Step 5: Apply the offset to get our final date
    return new Date(utcDate.getTime() + offsetMs);
  } catch (error) {
    console.error('Error parsing local datetime to timezone:', error);
    throw error;
  }
};

/**
 * Convert a Date object to local datetime-local format string for a specific timezone
 */
export const formatDateForLocalInput = (date: Date, timezone: string): string => {
  try {
    // Get the date in the specified timezone
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    const hour = parts.find(p => p.type === 'hour')?.value;
    const minute = parts.find(p => p.type === 'minute')?.value;

    return `${year}-${month}-${day}T${hour}:${minute}`;
  } catch (error) {
    console.error('Error formatting date for local input:', error);
    // Fallback to ISO string slice
    return date.toISOString().slice(0, 16);
  }
};
