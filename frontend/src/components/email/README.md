# Email Editor Components

A comprehensive set of React components for composing and sending emails with contact selection, rich text editing, and advanced features.

## Components

### EmailEditor

The main email composition component with full functionality.

#### Features
- Contact selection from prospect contacts
- To, CC, BCC recipient management
- Rich text editor with formatting
- Custom email address support
- Form validation
- Send, save draft, and schedule actions
- Mobile-responsive design

#### Props

```typescript
interface EmailEditorProps {
  initialData?: Partial<EmailData>;
  prospectId?: string;
  opportunityId?: string;
  onSend?: (emailData: EmailData) => Promise<void>;
  onSaveDraft?: (emailData: EmailData) => Promise<void>;
  onSchedule?: (emailData: EmailData, scheduledFor: Date) => Promise<void>;
  onClose?: () => void;
  isModal?: boolean;
  isLoading?: boolean;
  error?: string | null;
  title?: string;
}
```

#### Usage

```typescript
import { EmailEditor } from '@/components/email';

const MyComponent = () => {
  const handleSend = async (emailData: EmailData) => {
    // Send email via API
    await sendEmail(emailData);
  };

  return (
    <EmailEditor
      prospectId="prospect-123"
      onSend={handleSend}
      onClose={() => setShowEditor(false)}
      title="Compose Email"
    />
  );
};
```

### ContactSelector

A smart contact selection component with search, filtering, and custom email support.

#### Features
- Search contacts by name, email, or role
- Visual contact cards with avatars
- Custom email address input
- Multi-select with badges
- Maximum recipient limits
- Keyboard navigation

#### Props

```typescript
interface ContactSelectorProps {
  contacts: Contact[];
  selectedRecipients: EmailRecipient[];
  onSelectionChange: (recipients: EmailRecipient[]) => void;
  placeholder?: string;
  disabled?: boolean;
  maxRecipients?: number;
  allowCustomEmails?: boolean;
}
```

#### Usage

```typescript
import { ContactSelector } from '@/components/email';

const MyComponent = () => {
  const [recipients, setRecipients] = useState<EmailRecipient[]>([]);

  return (
    <ContactSelector
      contacts={contacts}
      selectedRecipients={recipients}
      onSelectionChange={setRecipients}
      placeholder="Select recipients..."
      allowCustomEmails={true}
    />
  );
};
```

### EmailField

A complete email field component combining label, contact selector, and validation.

#### Features
- Field labels with required indicators
- Integrated contact selection
- Error message display
- Removable CC/BCC fields
- Recipient count display

#### Props

```typescript
interface EmailFieldProps {
  label: string;
  recipients: EmailRecipient[];
  contacts: Contact[];
  onChange: (recipients: EmailRecipient[]) => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
  onRemove?: () => void;
  disabled?: boolean;
  maxRecipients?: number;
}
```

#### Usage

```typescript
import { EmailField } from '@/components/email';

const MyComponent = () => {
  const [toRecipients, setToRecipients] = useState<EmailRecipient[]>([]);

  return (
    <EmailField
      label="To"
      recipients={toRecipients}
      contacts={contacts}
      onChange={setToRecipients}
      required={true}
      error={validationError}
    />
  );
};
```

## Data Types

### EmailRecipient

```typescript
interface EmailRecipient {
  email: string;
  name?: string;
  contactId?: string;
}
```

### EmailData

```typescript
interface EmailData {
  to: EmailRecipient[];
  cc: EmailRecipient[];
  bcc: EmailRecipient[];
  subject: string;
  body: string;
  scheduledFor?: Date;
}
```

## Integration with useContactOperations

The components integrate seamlessly with the `useContactOperations` hook:

```typescript
import { useContactOperations } from '@/hooks/useContactOperations';
import { EmailEditor } from '@/components/email';

const OpportunityEmailView = ({ prospectId }: { prospectId: string }) => {
  const { useContactsByProspect } = useContactOperations();
  const contactsQuery = useContactsByProspect(prospectId);

  return (
    <EmailEditor
      prospectId={prospectId}
      // Contacts are automatically loaded via the hook
      onSend={handleSend}
    />
  );
};
```

## Styling

The components follow the project's design system:

- Uses shadcn/ui components for consistency
- Mobile-first responsive design
- Consistent spacing with `space-y-4` and `gap-2`
- Standard color palette (gray-900, gray-600, gray-500)
- Proper focus states and accessibility

## Examples

See `EmailEditorExample.tsx` for a complete working example with all features demonstrated.

## Best Practices

1. **Contact Loading**: Always provide a `prospectId` to load relevant contacts
2. **Error Handling**: Implement proper error handling in callback functions
3. **Validation**: Let the component handle validation, but provide custom error messages
4. **Performance**: The ContactSelector efficiently filters large contact lists
5. **Accessibility**: All components support keyboard navigation and screen readers

## Dependencies

- React 18+
- TanStack Query (for contact operations)
- shadcn/ui components
- TipTap editor
- Lucide React icons
