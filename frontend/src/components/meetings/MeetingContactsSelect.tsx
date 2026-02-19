import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Plus } from "lucide-react";
import { useContactOperations } from "@/hooks/useContactOperations";
import type { Contact, Prospect } from "@/types/prospect";
import { ContactForm } from "@/components/opportunities/ContactForm";

interface MeetingContactsSelectProps {
  meetingId: string;
  prospect?: Prospect | null;
  contacts?: Contact[];
  onAssignContacts: (contacts: Contact[]) => Promise<{ success: boolean; error?: string }>;
  isUpdating?: boolean;
}

export function MeetingContactsSelect({
  prospect,
  contacts = [],
  onAssignContacts,
  isUpdating,
}: MeetingContactsSelectProps) {
  const contactOps = useContactOperations();
  const contactsQuery = contactOps.useContactsByProspect(prospect?._id ?? "");
  const availableContacts = (contactsQuery.data ?? []) as Contact[];
  const isLoadingContacts = contactsQuery.isLoading;

  const [isEditing, setIsEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  useEffect(() => {
    setSelectedIds(contacts.map((contact) => contact._id));
  }, [contacts]);

  useEffect(() => {
    if (!prospect) {
      setIsEditing(false);
      setSelectedIds([]);
    }
  }, [prospect]);

  const hasContacts = contacts.length > 0;
  const isBusy = isSaving || isUpdating;

  const displayContacts = useMemo(() => {
    return contacts.map((contact) => {
      const initials = `${contact.firstName?.[0] || ""}${contact.lastName?.[0] || ""}`.trim();
      const fullName = `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || contact.emails?.[0]?.address || "Contact";
      return { ...contact, initials, fullName };
    });
  }, [contacts]);

  const toggleSelection = (contactId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) {
        return prev.includes(contactId) ? prev : [...prev, contactId];
      }
      return prev.filter((id) => id !== contactId);
    });
  };

  const handleSaveSelection = async () => {
    if (!prospect) {
      setInlineError("Assign a prospect first");
      return;
    }

    setInlineError(null);
    setIsSaving(true);

    try {
      const selectedContacts = selectedIds
        .map((id) => availableContacts.find((contact) => contact._id === id) || contacts.find((contact) => contact._id === id))
        .filter(Boolean) as Contact[];

      const result = await onAssignContacts(selectedContacts);
      if (!result.success) {
        setInlineError(result.error || "Failed to assign contacts");
        return;
      }

      setIsEditing(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to assign contacts";
      setInlineError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleContactCreated = async () => {
    setShowCreateDialog(false);
    await contactsQuery.refetch();
  };

  return (
    <div
      className="space-y-2"
      onClick={(event) => event.stopPropagation()}
    >
      {(isUpdating || isSaving) && (
        <div className="flex items-center gap-2 text-xs text-blue-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Updating...</span>
        </div>
      )}

      {!prospect && (
        <div className="text-xs text-gray-500 rounded-md border border-dashed border-gray-200 p-3 bg-white">
          Assign a prospect first to choose contacts.
        </div>
      )}

      {prospect && !isEditing && (
        <button
          type="button"
          className="w-full rounded-md bg-transparent px-0 py-1 text-left"
          onClick={() => setIsEditing(true)}
          disabled={isUpdating}
        >
          <div className="flex flex-wrap items-center gap-2">
            {hasContacts ? (
              <>
                {displayContacts.slice(0, 4).map((contact) => (
                  <Badge
                    key={contact._id}
                    variant="secondary"
                    className="text-xs transition-colors hover:bg-gray-900 hover:text-white"
                  >
                    {contact.fullName}
                  </Badge>
                ))}
                {displayContacts.length > 4 && (
                  <Badge variant="outline" className="text-xs">
                    +{displayContacts.length - 4}
                  </Badge>
                )}
              </>
            ) : (
              <span className="text-sm text-gray-500">Assign contacts</span>
            )}
          </div>
        </button>
      )}

      {prospect && isEditing && (
        <div className="space-y-3 rounded-lg border border-gray-200 p-3 bg-gray-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Select contacts</p>
              <p className="text-xs text-gray-500">Choose one or more contacts for this meeting</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsEditing(false);
                setInlineError(null);
              }}
            >
              Cancel
            </Button>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
            {isLoadingContacts ? (
              Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))
            ) : availableContacts.length === 0 ? (
              <div className="text-xs text-gray-500 p-3 bg-white rounded-md border border-dashed border-gray-200">
                No contacts for this prospect yet. Add one below.
              </div>
            ) : (
              availableContacts.map((contact) => {
                const contactLabel = `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || contact.emails?.[0]?.address || "Contact";
                return (
                  <label
                    key={contact._id}
                    className="flex items-center gap-3 rounded-md border border-gray-200 bg-white p-2 text-sm text-gray-900"
                  >
                    <Checkbox
                      checked={selectedIds.includes(contact._id)}
                      onCheckedChange={(checked) => toggleSelection(contact._id, Boolean(checked))}
                      className="mt-0.5"
                    />
                    <div className="flex flex-col">
                      <span className="font-medium">{contactLabel}</span>
                      {contact.emails && contact.emails.length > 0 && (
                        <span className="text-xs text-gray-500">{contact.emails[0].address}</span>
                      )}
                    </div>
                  </label>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="h-3 w-3 mr-2" />
              Add contact
            </Button>
            <Button
              size="sm"
              onClick={handleSaveSelection}
              disabled={isBusy}
              className="px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 bg-gray-900 text-white hover:bg-gray-800"
            >
              {(isSaving || isUpdating) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save selection
            </Button>
          </div>

          {inlineError && (
            <p className="text-xs text-red-600">{inlineError}</p>
          )}
        </div>
      )}

      {prospect && (
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add contact for {prospect.name}</DialogTitle>
            </DialogHeader>
            <ContactForm
              prospectId={prospect._id}
              onSuccess={handleContactCreated}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

