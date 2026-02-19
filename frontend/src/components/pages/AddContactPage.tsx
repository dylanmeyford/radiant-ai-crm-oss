import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ContactForm } from '@/components/opportunities/ContactForm';
import { useContactOperations } from '@/hooks/useContactOperations';
import { useOpportunityOperations } from '@/hooks/useOpportunityOperations';
import { Contact } from '@/types/prospect';
import { 
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, PlusCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOnClickOutside } from "@/hooks/useOnClickOutside";

const AddContactPage: React.FC = () => {
  const navigate = useNavigate();
  const { opportunityId, pipelineId } = useParams<{ opportunityId: string; pipelineId: string }>();
  const [searchTerm, setSearchTerm] = useState('');
  const [availableContacts, setAvailableContacts] = useState<Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);
  const [showContactSelector] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [openContactSearch, setOpenContactSearch] = useState(false);
  const [prospectId, setProspectId] = useState<string>('');
  
  const { fetchContactsForProspect, updateOpportunityContacts, isLoading, isSubmitting } = useContactOperations();
  const { getOpportunityById } = useOpportunityOperations();
  const searchRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(searchRef, () => setOpenContactSearch(false));

  // Get the current opportunity with full details including contacts
  const opportunityQuery = getOpportunityById(opportunityId || '');
  const { data: currentOpportunity, isLoading: isLoadingOpportunity } = opportunityQuery;
  

  useEffect(() => {
    // Handle both populated and unpopulated prospect
    const prospectId = typeof currentOpportunity?.prospect === 'string' 
      ? currentOpportunity.prospect 
      : currentOpportunity?.prospect?._id;
    
    if (prospectId) {
      setProspectId(prospectId);
      loadAvailableContacts(prospectId);
    }
  }, [currentOpportunity]);

  const loadAvailableContacts = async (prospectId: string) => {
    try {
      const contacts = await fetchContactsForProspect(prospectId);
      
      // Show all contacts, don't filter out existing ones
      setAvailableContacts(contacts);
      
      // Pre-tick contacts that are already associated with this opportunity
      const currentContactIds = currentOpportunity?.contacts?.map((c: any) => c._id) || [];
      const preSelectedContacts = contacts.filter((contact: any) => currentContactIds.includes(contact._id));
      
      setSelectedContacts(preSelectedContacts);
    } catch (error) {
      console.error('Failed to load contacts:', error);
    }
  };

  const handleAddSelectedContacts = async () => {
    if (!opportunityId) return;

    try {
      // Update opportunity with the currently selected contacts
      const selectedContactIds = selectedContacts.map(c => c._id);
      await updateOpportunityContacts(opportunityId, selectedContactIds);
      
      // Navigate back to opportunity view
      navigate(`/pipeline/${pipelineId}/opportunity/${opportunityId}`);
    } catch (error) {
      console.error('Failed to update contacts for opportunity:', error);
    }
  };

  const handleCreateContactSuccess = () => {
    // Navigate back to opportunity view after creating contact
    navigate(`/pipeline/${pipelineId}/opportunity/${opportunityId}`);
  };

  const filteredContacts = availableContacts.filter(contact =>
    `${contact.firstName} ${contact.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.emails.some(email => email.address.toLowerCase().includes(searchTerm.toLowerCase()))
  );


  if (isLoadingOpportunity) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading opportunity...</p>
        </div>
      </div>
    );
  }

  if (!currentOpportunity) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Opportunity not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-4">
          <div className="mb-4">
            <h1 className="text-sm font-medium text-gray-900">Manage Contacts</h1>
            <p className="text-xs text-gray-500 mt-1">
              Select contacts to associate with the opportunity "{currentOpportunity.name}"
            </p>
          </div>

          {showContactSelector && !showCreateForm && (
            <div className="space-y-4">
              {/* Contact Search */}
              <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                <div className="p-4 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-gray-900">Search Existing Contacts</h3>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Search for contacts from {currentOpportunity.prospect?.name}
                  </p>
                </div>
                <div className="p-4">
                  <div className="relative" ref={searchRef}>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={openContactSearch}
                    className={cn(
                      "justify-between w-full",
                      !searchTerm && "text-muted-foreground"
                    )}
                    onClick={() => setOpenContactSearch(!openContactSearch)}
                  >
                    {isLoading ? (
                      <div className="flex items-center">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading contacts...
                      </div>
                    ) : searchTerm ? (
                      <span className="truncate">{searchTerm}</span>
                    ) : (
                      <span className="text-muted-foreground">Search for contacts by name or email...</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>

                  {openContactSearch && (
                    <div className="absolute top-full mt-1 w-full z-10">
                      <Command className="rounded-lg border shadow-md">
                        <CommandInput 
                          placeholder="Search contacts..." 
                          className="h-9"
                          value={searchTerm}
                          onValueChange={setSearchTerm}
                        />
                        <CommandList>
                          <CommandEmpty className="py-3 px-4 text-center">
                            <div className="text-sm text-muted-foreground py-2">
                              No contacts found.
                            </div>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="w-full mt-2"
                              onClick={() => {
                                setShowCreateForm(true);
                                setOpenContactSearch(false);
                              }}
                            >
                              <PlusCircle className="mr-2 h-4 w-4 text-primary" />
                              <span>Create new contact</span>
                            </Button>
                          </CommandEmpty>
                          <CommandGroup>
                            {filteredContacts.map((contact) => {
                              const isSelected = selectedContacts.some(c => c._id === contact._id);
                              return (
                                <CommandItem
                                  key={contact._id}
                                  value={`${contact.firstName} ${contact.lastName} ${contact.emails.map(e => e.address).join(' ')}`}
                                  onSelect={() => {
                                    if (isSelected) {
                                      setSelectedContacts(prev => prev.filter(c => c._id !== contact._id));
                                    } else {
                                      setSelectedContacts(prev => [...prev, contact]);
                                    }
                                  }}
                                >
                                  <div className="flex-1">
                                    <div className="font-medium">{contact.firstName} {contact.lastName}</div>
                                    <div className="text-sm text-muted-foreground">
                                      {contact.emails.find(e => e.isPrimary)?.address || contact.emails[0]?.address}
                                    </div>
                                    {contact.role && (
                                      <div className="text-xs text-muted-foreground">{contact.role}</div>
                                    )}
                                  </div>
                                  <Check
                                    className={cn(
                                      "ml-auto h-4 w-4",
                                      isSelected ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                          {filteredContacts.length > 0 && (
                            <>
                              <CommandSeparator />
                              <CommandGroup>
                                <CommandItem onSelect={() => {
                                  setShowCreateForm(true);
                                  setOpenContactSearch(false);
                                }}>
                                  <PlusCircle className="mr-2 h-4 w-4 text-primary" />
                                  <span>Create new contact</span>
                                </CommandItem>
                              </CommandGroup>
                            </>
                          )}
                        </CommandList>
                      </Command>
                    </div>
                  )}
                  </div>
                </div>
              </div>

              {/* Selected Contacts */}
              {selectedContacts.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                  <div className="p-4 border-b border-gray-200">
                    <h3 className="text-sm font-medium text-gray-900">Selected Contacts ({selectedContacts.length})</h3>
                  </div>
                  <div className="p-4">
                    <div className="space-y-2">
                      {selectedContacts.map((contact) => (
                        <div key={contact._id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{contact.firstName} {contact.lastName}</div>
                            <div className="text-xs text-gray-500">
                              {contact.emails.find(e => e.isPrimary)?.address || contact.emails[0]?.address}
                            </div>
                            {contact.role && (
                              <div className="text-xs text-gray-500">{contact.role}</div>
                            )}
                          </div>
                          <button
                            onClick={() => setSelectedContacts(prev => prev.filter(c => c._id !== contact._id))}
                            className="px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end pt-4 border-t border-gray-200">
                <button
                  onClick={handleAddSelectedContacts}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {selectedContacts.length > 0 
                    ? `Update Contacts (${selectedContacts.length})` 
                    : 'Update Contacts'
                  }
                </button>
              </div>
            </div>
          )}

          {showCreateForm && (
            <div className="space-y-4">
              <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                <div className="p-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-gray-900">Create New Contact</h3>
                      <p className="text-xs text-gray-500 mt-1">
                        This contact will be added to {currentOpportunity.prospect?.name}
                      </p>
                    </div>
                    <button
                      onClick={() => setShowCreateForm(false)}
                      className="px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    >
                      Back to Search
                    </button>
                  </div>
                </div>
                <div className="p-4">
                  <ContactForm
                    prospectId={prospectId}
                    onSuccess={handleCreateContactSuccess}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddContactPage;
