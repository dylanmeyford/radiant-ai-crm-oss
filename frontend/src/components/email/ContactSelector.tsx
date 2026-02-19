import React, { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, X, User, Mail } from 'lucide-react';
import { Contact } from '@/types/prospect';
import { EmailRecipient } from './EmailEditor';

export interface ContactSelectorProps {
  /** Available contacts to choose from */
  contacts: Contact[];
  /** Currently selected recipients */
  selectedRecipients: EmailRecipient[];
  /** Callback when selection changes */
  onSelectionChange: (recipients: EmailRecipient[]) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Maximum number of recipients */
  maxRecipients?: number;
  /** Whether to allow custom email addresses */
  allowCustomEmails?: boolean;
}

export const ContactSelector: React.FC<ContactSelectorProps> = ({
  contacts,
  selectedRecipients,
  onSelectionChange,
  placeholder = "Select contacts...",
  disabled = false,
  maxRecipients,
  allowCustomEmails = true
}) => {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [customEmail, setCustomEmail] = useState('');

  // Convert contact to recipient
  const contactToRecipient = useCallback((contact: Contact): EmailRecipient => {
    const primaryEmail = contact.emails.find(e => e.isPrimary) || contact.emails[0];
    return {
      email: primaryEmail?.address || '',
      name: `${contact.firstName} ${contact.lastName}`.trim(),
      contactId: contact._id
    };
  }, []);

  // Get available contacts (not already selected)
  const availableContacts = useMemo(() => {
    const selectedContactIds = new Set(
      selectedRecipients
        .filter(r => r.contactId)
        .map(r => r.contactId)
    );
    
    return contacts.filter(contact => !selectedContactIds.has(contact._id));
  }, [contacts, selectedRecipients]);

  // Filter contacts based on search
  const filteredContacts = useMemo(() => {
    if (!searchValue) return availableContacts;
    
    const search = searchValue.toLowerCase();
    return availableContacts.filter(contact => {
      const name = `${contact.firstName} ${contact.lastName}`.toLowerCase();
      const emails = contact.emails.map(e => e.address.toLowerCase());
      const role = (contact.role || '').toLowerCase();
      
      return name.includes(search) || 
             emails.some(email => email.includes(search)) ||
             role.includes(search);
    });
  }, [availableContacts, searchValue]);

  // Validate email format
  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Handle contact selection
  const handleContactSelect = useCallback((contact: Contact) => {
    if (maxRecipients && selectedRecipients.length >= maxRecipients) {
      return;
    }

    const recipient = contactToRecipient(contact);
    if (recipient.email) {
      onSelectionChange([...selectedRecipients, recipient]);
    }
    setSearchValue('');
  }, [selectedRecipients, onSelectionChange, maxRecipients, contactToRecipient]);

  // Handle custom email addition
  const handleCustomEmailAdd = useCallback(() => {
    if (!allowCustomEmails || !customEmail.trim()) return;
    
    const email = customEmail.trim();
    if (!isValidEmail(email)) return;
    
    if (maxRecipients && selectedRecipients.length >= maxRecipients) {
      return;
    }

    // Check if email already exists
    const exists = selectedRecipients.some(r => r.email.toLowerCase() === email.toLowerCase());
    if (exists) {
      setCustomEmail('');
      return;
    }

    const recipient: EmailRecipient = {
      email,
      name: email // Use email as name for custom recipients
    };
    
    onSelectionChange([...selectedRecipients, recipient]);
    setCustomEmail('');
    setOpen(false);
  }, [allowCustomEmails, customEmail, selectedRecipients, onSelectionChange, maxRecipients]);

  // Handle recipient removal
  const handleRecipientRemove = useCallback((index: number) => {
    const updated = selectedRecipients.filter((_, i) => i !== index);
    onSelectionChange(updated);
  }, [selectedRecipients, onSelectionChange]);

  // Handle enter key for custom email
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && customEmail.trim()) {
      e.preventDefault();
      handleCustomEmailAdd();
    }
  }, [customEmail, handleCustomEmailAdd]);

  return (
    <div className="space-y-2">
      {/* Contact Selector with Recipients Inside */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div
            className="min-h-[40px] w-full border border-input bg-background px-3 py-2 text-sm ring-offset-background rounded-md cursor-text flex items-center gap-1 flex-wrap focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
            onClick={() => setOpen(true)}
          >
            {/* Selected Recipients as Chips */}
            {selectedRecipients.map((recipient, index) => (
              <Badge
                key={`${recipient.email}-${index}`}
                variant="secondary"
                className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200"
              >
                <span className="truncate max-w-[120px]">
                  {recipient.name && recipient.name !== recipient.email 
                    ? recipient.name 
                    : recipient.email
                  }
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-3 w-3 p-0 hover:bg-gray-300 rounded-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRecipientRemove(index);
                  }}
                  disabled={disabled}
                >
                  <X className="h-2 w-2" />
                </Button>
              </Badge>
            ))}
            
            {/* Placeholder or Add More Button */}
            <div className="flex-1 min-w-[100px] flex items-center justify-between">
              <span className={`text-sm ${selectedRecipients.length === 0 ? 'text-muted-foreground' : 'text-transparent'}`}>
                {maxRecipients && selectedRecipients.length >= maxRecipients
                  ? `Maximum ${maxRecipients} recipients selected`
                  : selectedRecipients.length === 0 
                    ? placeholder
                    : ''
                }
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
            </div>
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput 
              placeholder="Search contacts..." 
              value={searchValue}
              onValueChange={setSearchValue}
            />
            <CommandList>
              <CommandEmpty>
                {allowCustomEmails && searchValue && isValidEmail(searchValue) ? (
                  <div className="p-2">
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-left"
                      onClick={() => {
                        setCustomEmail(searchValue);
                        handleCustomEmailAdd();
                      }}
                    >
                      <Mail className="mr-2 h-4 w-4" />
                      Add "{searchValue}"
                    </Button>
                  </div>
                ) : (
                  <div className="py-6 px-6 text-center text-sm">
                    No contacts found.
                    {allowCustomEmails && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        Type a valid email address to add it directly.
                      </div>
                    )}
                  </div>
                )}
              </CommandEmpty>
              
              {filteredContacts.length > 0 && (
                <CommandGroup>
                  {filteredContacts.map((contact) => {
                    const primaryEmail = contact.emails.find(e => e.isPrimary) || contact.emails[0];
                    const displayName = `${contact.firstName} ${contact.lastName}`.trim();
                    
                    return (
                      <CommandItem
                        key={contact._id}
                        value={`${displayName} ${primaryEmail?.address} ${contact.role || ''}`}
                        onSelect={() => handleContactSelect(contact)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleContactSelect(contact);
                          setOpen(false);
                        }}
                        className="flex items-center space-x-2 cursor-pointer"
                      >
                        <div className="flex items-center justify-center w-8 h-8 bg-gray-100 rounded-full">
                          <User className="h-4 w-4 text-gray-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {displayName}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {primaryEmail?.address}
                          </div>
                          {contact.role && (
                            <div className="text-xs text-muted-foreground truncate">
                              {contact.role}
                            </div>
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}

              {/* Custom Email Input */}
              {allowCustomEmails && (
                <CommandGroup heading="Add Custom Email">
                  <div className="p-2">
                    <Input
                      placeholder="Enter email address..."
                      value={customEmail}
                      onChange={(e) => setCustomEmail(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="text-sm"
                    />
                    {customEmail && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-2"
                        onClick={handleCustomEmailAdd}
                        disabled={!isValidEmail(customEmail)}
                      >
                        <Mail className="mr-2 h-4 w-4" />
                        Add "{customEmail}"
                      </Button>
                    )}
                  </div>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default ContactSelector;
