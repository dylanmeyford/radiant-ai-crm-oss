import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useProspectOperations } from "@/hooks/useProspectOperations";
import type { Prospect } from "@/types/prospect";
import { Check, ChevronsUpDown, Loader2, PlusCircle, X } from "lucide-react";

const isValidDomain = (domain: string): boolean => {
  const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  return domainRegex.test(domain.trim());
};

interface MeetingProspectSelectProps {
  meetingId: string;
  value?: Prospect | null;
  onAssign: (prospect: Prospect) => Promise<{ success: boolean; error?: string }>;
  isUpdating?: boolean;
}

export function MeetingProspectSelect({
  value,
  onAssign,
  isUpdating,
}: MeetingProspectSelectProps) {
  const {
    prospects,
    createProspect,
    isLoading: isProspectRequestLoading,
  } = useProspectOperations();

  const [isEditing, setIsEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newProspectName, setNewProspectName] = useState("");
  const [domainInput, setDomainInput] = useState("");
  const [domains, setDomains] = useState<string[]>([]);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (value?.domains && value.domains.length > 0) {
      setDomains(value.domains);
    }
  }, [value]);

  const isBusy = isSubmitting || isUpdating || isProspectRequestLoading;

  const sortedProspects = useMemo(() => {
    return [...prospects].sort((a, b) => a.name.localeCompare(b.name));
  }, [prospects]);

  const resetCreateForm = () => {
    setNewProspectName("");
    setDomainInput("");
    setDomains([]);
    setDomainError(null);
    setInlineError(null);
    setShowCreateForm(false);
  };

  const finishEditing = () => {
    setIsEditing(false);
    setShowCreateForm(false);
    setOpen(false);
    setInlineError(null);
  };

  const handleAssignExisting = async (prospect: Prospect) => {
    setInlineError(null);
    setIsSubmitting(true);
    try {
      const result = await onAssign(prospect);
      if (!result.success) {
        setInlineError(result.error || "Failed to assign prospect");
      } else {
        finishEditing();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to assign prospect";
      setInlineError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddDomain = () => {
    const formatted = domainInput.trim().toLowerCase();
    if (!formatted) {
      setDomainError("Domain cannot be empty");
      return;
    }
    if (!isValidDomain(formatted)) {
      setDomainError("Enter a valid domain (example.com)");
      return;
    }
    if (domains.includes(formatted)) {
      setDomainError("Domain already added");
      return;
    }
    setDomains((prev) => [...prev, formatted]);
    setDomainInput("");
    setDomainError(null);
  };

  const handleRemoveDomain = (domainToRemove: string) => {
    setDomains((prev) => prev.filter((domain) => domain !== domainToRemove));
  };

  const handleCreateProspect = async () => {
    if (!newProspectName.trim()) {
      setInlineError("Prospect name is required");
      return;
    }
    if (domains.length === 0) {
      setInlineError("Add at least one domain");
      return;
    }

    setInlineError(null);
    setIsSubmitting(true);

    try {
      const result = await createProspect({
        name: newProspectName.trim(),
        domains,
        status: "lead",
        website: "",
        industry: "",
        size: "",
        description: "",
      });

      if (!result.success || !result.data) {
        setInlineError(result.error || "Failed to create prospect");
        return;
      }

      const assignResult = await onAssign(result.data);
      if (!assignResult.success) {
        setInlineError(assignResult.error || "Failed to assign new prospect");
        return;
      }

      resetCreateForm();
      finishEditing();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create prospect";
      setInlineError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="space-y-2"
      ref={containerRef}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={cn(
          "w-full rounded-md bg-transparent px-0 py-1 text-left",
          (isUpdating || isSubmitting) && "ring-2 ring-blue-200"
        )}
        onClick={() => {
          setIsEditing(true);
          setShowCreateForm(false);
        }}
        disabled={isBusy}
      >
        {value ? (
          <div className="inline-flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-900 px-2 py-1 text-xs font-medium transition-colors hover:bg-gray-900 hover:text-white">
              {value.name}
            </span>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Assign prospect</p>
        )}
      </button>

      {isEditing && (
        <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">
                {value ? "Change prospect" : "Assign prospect"}
              </p>
              <p className="text-xs text-gray-500">Select an existing prospect or create a new one</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={finishEditing}
            >
              Cancel
            </Button>
          </div>

          {showCreateForm ? (
            <div className="space-y-3">
              <Input
                placeholder="Company name"
                value={newProspectName}
                onChange={(e) => setNewProspectName(e.target.value)}
                disabled={isBusy}
              />

              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600">Website domains *</label>
                {domains.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-1">
                    {domains.map((domain) => (
                      <span
                        key={domain}
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs"
                      >
                        {domain}
                        <button
                          type="button"
                          onClick={() => handleRemoveDomain(domain)}
                          className="text-blue-600 hover:text-blue-800"
                          disabled={isBusy}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    placeholder="example.com"
                    value={domainInput}
                    onChange={(e) => {
                      setDomainInput(e.target.value);
                      setDomainError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddDomain();
                      }
                    }}
                    disabled={isBusy}
                    className={domainError ? "border-red-300 focus:border-red-500" : ""}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddDomain}
                    disabled={isBusy || !domainInput.trim()}
                  >
                    Add
                  </Button>
                </div>
                {domainError && (
                  <p className="text-xs text-red-600">{domainError}</p>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    resetCreateForm();
                    setShowCreateForm(false);
                  }}
                  className="text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  disabled={isBusy}
                >
                  Back
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreateProspect}
                  disabled={isBusy}
                  className="px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 bg-gray-900 text-white hover:bg-gray-800"
                >
                  {(isSubmitting || isProspectRequestLoading) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create & Assign
                </Button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className={cn(
                  "w-full justify-between",
                  !value && "text-muted-foreground",
                  (isUpdating || isSubmitting) && "ring-2 ring-blue-200"
                )}
                onClick={() => setOpen((prev) => !prev)}
                disabled={isBusy}
              >
                {value ? (
                  <span className="text-sm font-medium text-gray-900">{value.name}</span>
                ) : (
                  <span>Choose prospect</span>
                )}
                <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
              </Button>

              {open && (
                <div className="absolute z-20 mt-2 w-full shadow-lg border border-gray-200 rounded-lg bg-white">
                  <Command className="rounded-lg">
                    <CommandInput placeholder="Search prospects..." className="h-9" autoFocus />
                    <CommandList>
                      <CommandEmpty className="py-3 px-4 text-xs text-gray-500">
                        No prospects found
                      </CommandEmpty>
                      <CommandGroup heading="Prospects">
                        {sortedProspects.map((prospect) => (
                          <CommandItem
                            key={prospect._id}
                            value={`${prospect.name}-${prospect._id}`}
                            onSelect={() => {
                              setOpen(false);
                              handleAssignExisting(prospect);
                            }}
                            className="flex items-center gap-2"
                          >
                            <span className="text-sm text-gray-900">{prospect.name}</span>
                            <Check
                              className={cn(
                                "ml-auto h-4 w-4",
                                value?._id === prospect._id ? "opacity-100" : "opacity-0"
                              )}
                            />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      <CommandSeparator />
                      <CommandGroup>
                        <CommandItem
                          onSelect={() => {
                            setOpen(false);
                            setShowCreateForm(true);
                            setNewProspectName(value?.name || "");
                          }}
                          className="gap-2 text-sm text-gray-700"
                        >
                          <PlusCircle className="h-4 w-4 text-gray-500" />
                          Create new prospect
                        </CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </div>
              )}
            </div>
          )}

          {inlineError && (
            <div className="flex items-center gap-2 text-xs text-red-600">
              <span>{inlineError}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

