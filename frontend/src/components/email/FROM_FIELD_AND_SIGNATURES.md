# Email From Field and Signature Management

This document describes the new functionality for sender selection and intelligent signature management in email components.

## Overview

The email components now support:
1. **From Field**: Select which connected email account to send from
2. **Intelligent Signatures**: Automatic signature detection and management
3. **Nylas Integration**: Uses connected Nylas accounts as sender options

## Components

### FromField Component

A new component that allows users to select from their connected email accounts.

```tsx
import { FromField } from '@/components/email/FromField';

<FromField
  value={emailData.from}
  connections={connections}
  onChange={(from) => updateField('from', from)}
  disabled={isLoadingConnections}
  error={validationErrors.from}
  required
/>
```

**Features:**
- Displays all active email connections (all Nylas connections support email)
- Shows provider information (Gmail, Outlook, etc.)
- Handles loading and error states
- Validates selection when required

### Updated EmailData Interface

The `EmailData` interface now includes a `from` field:

```tsx
interface EmailFromRecipient {
  email: string;
  connectionId: string;
  name?: string;
}

interface EmailData {
  from?: EmailFromRecipient;
  to: EmailRecipient[];
  cc: EmailRecipient[];
  bcc: EmailRecipient[];
  subject: string;
  body: string;
  scheduledFor?: Date;
  attachments?: AttachmentMetadata[];
}
```

## Signature Management

### Intelligent Signature Detection

The system now provides two levels of signature detection:

#### 1. Exact Signature Detection (New)
- **Precise Matching**: Searches for the exact signature content in the email body
- **Format Aware**: Handles both HTML and plain text signatures
- **Whitespace Tolerant**: Normalizes content for reliable matching
- **Prevents Duplicates**: Only adds signature if not already present

#### 2. Generic Signature Detection (Fallback)
- **Pattern Matching**: Detects common signature patterns when exact signature isn't available
- **Common Closings**: "Best regards", "Sincerely", "Thank you", "Thanks", "Regards", "Cheers", etc.

### Signature Operations

Located in `/src/lib/signatureUtils.ts`:

```tsx
import { hasSignature, stripSignature, appendSignature, updateSignature } from '@/lib/signatureUtils';

// Check if content has specific signature
const contentHasSignature = hasSignature(emailBody, signature);

// Check if content has any signature (legacy)
const hasAnySignature = hasSignature(emailBody);

// Remove specific signature
const cleanContent = stripSignature(emailBody, signature);

// Remove any signature (legacy)
const cleanContentGeneric = stripSignature(emailBody);

// Add signature to content (only if not already present)
const contentWithSignature = appendSignature(emailBody, signature);

// Replace old signature with new one
const updatedContent = updateSignature(emailBody, newSignature, oldSignature);
```

### Automatic Signature Updates

When a user changes the "from" email address:

1. **Fetch New Signature**: Retrieves signature for the selected connection
2. **Check for Existing**: Uses exact signature matching to check if new signature already exists
3. **Remove Old Signature**: Precisely removes the old signature if switching between accounts
4. **Add New Signature**: Only adds new signature if not already present
5. **Format Consistency**: Maintains HTML/plain text format consistency
6. **No Duplicates**: Prevents signature duplication through intelligent detection

## Integration Points

### useNylasConnections Hook

```tsx
const { connections, isLoading } = useNylasConnections();
```

Provides:
- `connections`: Array of active email connections
- `isLoading`: Loading state for connections

### useEmailSignature Hook

```tsx
const { getEmailSignatureQuery } = useEmailSignature();
const signatureQuery = getEmailSignatureQuery(connectionId);
const signature = signatureQuery.data?.emailSignature || '';
```

Provides:
- Fetches signature for specific connection
- Caches signature data
- Handles loading and error states

## Usage Examples

### EmailEditor with From Field

```tsx
<EmailEditor
  initialData={{
    from: {
      email: 'user@company.com',
      connectionId: 'conn_123',
      name: 'user@company.com'
    },
    to: [{ email: 'recipient@example.com', name: 'Recipient' }],
    subject: 'Hello',
    body: 'Email content here...'
  }}
  prospectId="prospect_123"
  organizationId="org_456"
  onSend={handleSend}
  onSaveDraft={handleSaveDraft}
/>
```

### EmailActionViewer with From Field

```tsx
<EmailActionViewer
  action={proposedAction}
  onChange={handleActionChange}
  isEditing={true}
  prospectId="prospect_123"
  organizationId="org_456"
  onSend={handleSend}
/>
```

## Validation

Both components now validate:
- **From field is required** when sending emails
- **Connection must be active** (all Nylas connections support email)
- **All existing validations** (to, subject, body) remain

## Error Handling

- **No Connections**: Shows helpful message to connect an email account
- **Loading States**: Disables from field while loading connections
- **Invalid Connections**: Filters out inactive connections
- **Signature Errors**: Gracefully handles missing or invalid signatures

## Backward Compatibility

- Existing email data without `from` field will work normally
- Components degrade gracefully when no connections are available
- Signature management is optional and won't break existing workflows

## Technical Notes

### Signature Format Handling

The signature utilities handle both HTML and plain text:
- **HTML Detection**: Uses `isHTML()` from TipTapEditor
- **Format Conversion**: Converts between HTML and plain text as needed
- **Spacing**: Adds appropriate line breaks/paragraphs

### Performance Considerations

- **Signature Caching**: Uses TanStack Query for efficient caching
- **Connection Caching**: Nylas connections are cached and reused
- **Lazy Loading**: Signatures only load when connection is selected

### Security

- **Connection Validation**: Only shows user's own connections
- **Permission Checks**: Backend validates user owns the connection
- **Data Sanitization**: Signatures are properly escaped in HTML context
