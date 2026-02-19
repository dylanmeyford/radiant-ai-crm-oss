import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Prospect } from "@/types/prospect";
import { useOpportunityOperations } from "@/hooks/useOpportunityOperations";
import { useProspectOperations } from "@/hooks/useProspectOperations";
import { usePipelineStages } from "@/hooks/usePipelineStages";
import { PipelineStage } from "@/types/pipeline";
import { Loader2, Check, ChevronsUpDown, PlusCircle, X, AlertCircle } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useOnClickOutside } from "@/hooks/useOnClickOutside";

// Domain validation utility
const isValidDomain = (domain: string): boolean => {
  const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  return domainRegex.test(domain.trim());
};

const opportunitySchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  amount: z.string().min(1, "Amount is required"),
  stage: z.string().min(1, "Stage is required"),
  createdDate: z.string().min(1, "Date of first opportunity communication is required"),
  prospect: z.string().optional(), // Will be handled in custom validation
});

type OpportunityFormValues = z.infer<typeof opportunitySchema>;

interface OpportunityFormProps {
  onSuccess?: () => void;
  pipelineId?: string;
}

export function OpportunityForm({ onSuccess, pipelineId }: OpportunityFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Use the operation hooks
  const opportunityOps = useOpportunityOperations();
  const prospectOps = useProspectOperations();
  const { pipelineStages, isLoadingStages } = usePipelineStages(pipelineId);
  
  // State for prospect selection
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [previousSelectedProspect, setPreviousSelectedProspect] = useState<Prospect | null>(null);
  const [openProspectSearch, setOpenProspectSearch] = useState(false);
  
  // Ref for the search input
  const prospectSearchRef = useRef<HTMLDivElement>(null);
  
  // State for inline prospect creation
  const [showCreateProspect, setShowCreateProspect] = useState(false);
  const [newProspectName, setNewProspectName] = useState("");
  const [newProspectDomains, setNewProspectDomains] = useState<string[]>([]);
  const [currentDomainInput, setCurrentDomainInput] = useState("");
  const [domainError, setDomainError] = useState<string | null>(null);
  const [creatingProspect, setCreatingProspect] = useState(false);
  const [prospectCreationError, setProspectCreationError] = useState<string | null>(null);
  
  // Close prospect search on outside click
  useOnClickOutside(prospectSearchRef, () => setOpenProspectSearch(false));

  // Get prospects data from TanStack Query hook
  const { prospects, isLoadingProspects } = prospectOps;

  const form = useForm<OpportunityFormValues>({
    resolver: zodResolver(opportunitySchema),
    mode: "onSubmit",
    reValidateMode: "onSubmit",
    shouldFocusError: false,
    defaultValues: {
      name: "",
      description: "",
      amount: "",
      stage: pipelineStages[0]?._id || "",
      createdDate: new Date().toISOString().split('T')[0],
      prospect: "",
    },
  });

  // Update default stage when pipeline stages load
  useEffect(() => {
    if (pipelineStages.length > 0 && !form.getValues('stage')) {
      form.setValue('stage', pipelineStages[0]._id);
    }
  }, [pipelineStages, form]);

  // Update form when selectedProspect changes
  useEffect(() => {
    if (selectedProspect) {
      form.setValue("prospect", selectedProspect._id);
    }
  }, [selectedProspect, form]);

  // Handle pre-fill from URL parameters (from calendar meeting)
  useEffect(() => {
    if (searchParams.get('prefill') === 'true') {
      const domainsParam = searchParams.get('domains');
      const nameParam = searchParams.get('name');
      const dateParam = searchParams.get('date');
      
      // Pre-fill opportunity name
      if (nameParam) {
        form.setValue('name', nameParam);
      }
      
      // Pre-fill created date
      if (dateParam) {
        form.setValue('createdDate', dateParam);
      }
      
      // Pre-fill domains for new prospect creation
      if (domainsParam) {
        const domains = domainsParam.split(',').filter(d => d.trim());
        
        if (domains.length > 0) {
          setShowCreateProspect(true);
          setNewProspectDomains(domains);
          
          // Optionally extract company name from first domain
          // e.g., "acme.com" -> "Acme"
          if (!nameParam && domains[0]) {
            const domainParts = domains[0].split('.');
            if (domainParts.length > 0) {
              const companyName = domainParts[0].charAt(0).toUpperCase() + domainParts[0].slice(1);
              setNewProspectName(companyName);
            }
          }
        }
      }
      
      // Clear URL params to avoid re-triggering
      setSearchParams({});
    }
  }, [searchParams, setSearchParams, form]);

  const onSubmit = async (values: OpportunityFormValues) => {
    setIsLoading(true);
    setError(null);
    let prospectToUse: Prospect | null = selectedProspect;

    try {
      // Step 1: Create prospect if necessary
      if (showCreateProspect && newProspectName.trim()) {
        // Validate domains are provided
        if (newProspectDomains.length === 0) {
          setError("At least one domain is required when creating a new prospect.");
          setIsLoading(false);
          return;
        }
        
        setCreatingProspect(true);
        const prospectResult = await prospectOps.createProspect({
          name: newProspectName.trim(),
          domains: newProspectDomains,
          status: "lead",
          website: "",
          industry: "",
          size: "",
          description: "",
        });
        setCreatingProspect(false);
        
        if (!prospectResult.success) {
          throw new Error(prospectResult.error || "Failed to create prospect or prospect data is invalid.");
        }
        
        prospectToUse = prospectResult.data;
        setSelectedProspect(prospectToUse);
      }

      // Step 2: Validate we have a prospect
      if (!prospectToUse?._id) {
        setError("A prospect is required. Please select one or create a new one.");
        setIsLoading(false);
        return;
      }

      // Step 3: Create the opportunity
      const formattedValues = {
        ...values,
        amount: parseFloat(values.amount),
        probability: 50,
        expectedCloseDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        createdDate: new Date(values.createdDate),
        prospect: prospectToUse._id,
        contacts: prospectToUse.contacts?.map((c: any) => c._id) || [],
        opportunityStartDate: new Date(values.createdDate),
        pipeline: pipelineId, // Include the pipeline ID for the backend
      };

      const oppResult = await opportunityOps.createOpportunity(formattedValues);

      if (!oppResult.success) {
        throw new Error(oppResult.error);
      }

      // Step 4: Success
      if (oppResult.data) {
        if (showCreateProspect) {
          setShowCreateProspect(false);
          setNewProspectName("");
          setNewProspectDomains([]);
          setCurrentDomainInput("");
          setDomainError(null);
          setPreviousSelectedProspect(null);
        }
        onSuccess?.();
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create opportunity");
    } finally {
      setIsLoading(false);
      setCreatingProspect(false); // ensure this is always reset
    }
  };

  const handleCancelCreateProspect = () => {
    setShowCreateProspect(false);
    setNewProspectName("");
    setNewProspectDomains([]);
    setCurrentDomainInput("");
    setDomainError(null);
    setProspectCreationError(null);
    
    // Restore previous selection if there was one
    if (previousSelectedProspect) {
      setSelectedProspect(previousSelectedProspect);
      form.setValue("prospect", previousSelectedProspect._id);
    }
    setPreviousSelectedProspect(null);
  };

  const handleAddDomain = () => {
    const domain = currentDomainInput.trim();
    
    if (!domain) {
      setDomainError("Domain cannot be empty");
      return;
    }
    
    if (!isValidDomain(domain)) {
      setDomainError("Please enter a valid domain (e.g., example.com)");
      return;
    }
    
    if (newProspectDomains.includes(domain)) {
      setDomainError("Domain already added");
      return;
    }
    
    setNewProspectDomains(prev => [...prev, domain]);
    setCurrentDomainInput("");
    setDomainError(null);
  };

  const handleRemoveDomain = (domainToRemove: string) => {
    setNewProspectDomains(prev => prev.filter(domain => domain !== domainToRemove));
  };

  const handleDomainKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddDomain();
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
      <div className="p-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Prospect Selection */}
        <FormField
          control={form.control}
          name="prospect"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Prospect *</FormLabel>
              
              {/* Show create prospect form if enabled */}
              {showCreateProspect ? (
                <div className="space-y-3 p-4 border border-gray-200 rounded-lg bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">Create New Prospect</h4>
                      <p className="text-xs text-gray-500">This prospect will be created when you submit the opportunity</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleCancelCreateProspect}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="space-y-2">
                    <Input
                      placeholder="Company name"
                      value={newProspectName}
                      onChange={(e) => setNewProspectName(e.target.value)}
                      disabled={creatingProspect}
                    />
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Website Domains *</label>
                      
                      {/* Display existing domains as chips */}
                      {newProspectDomains.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {newProspectDomains.map((domain, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-sm rounded-md"
                            >
                              <span>{domain}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveDomain(domain)}
                                className="ml-1 text-primary/70 hover:text-primary"
                                disabled={creatingProspect}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Domain input */}
                      <div className="flex gap-2">
                        <Input
                          placeholder="example.com"
                          value={currentDomainInput}
                          onChange={(e) => {
                            setCurrentDomainInput(e.target.value);
                            setDomainError(null);
                          }}
                          onKeyPress={handleDomainKeyPress}
                          disabled={creatingProspect}
                          className={domainError ? "border-red-300 focus:border-red-500" : ""}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleAddDomain}
                          disabled={creatingProspect || !currentDomainInput.trim()}
                        >
                          Add
                        </Button>
                      </div>
                      
                      {domainError && (
                        <p className="text-xs text-red-600">{domainError}</p>
                      )}
                      
                      <p className="text-xs text-gray-500">
                        Type a domain and press Enter or click Add. At least one domain is required.
                      </p>
                    </div>
                  </div>
                  
                  {prospectCreationError && (
                    <div className="text-sm text-destructive">
                      {prospectCreationError}
                    </div>
                  )}
                  
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCancelCreateProspect}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                /* Regular prospect selection */
                <FormControl>
                  <div className="relative" ref={prospectSearchRef}>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={openProspectSearch}
                      className={cn(
                        "justify-between w-full",
                        !field.value && "text-muted-foreground"
                      )}
                      onClick={(e) => {
                        e.preventDefault();
                        setOpenProspectSearch(!openProspectSearch);
                      }}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    >
                      {isLoadingProspects ? (
                        <div className="flex items-center">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 
                          Loading prospects...
                        </div>
                      ) : selectedProspect && selectedProspect.name ? (
                        <div className="flex items-center justify-between w-full">
                          <span className="truncate">{selectedProspect.name}</span>
                          <div className="ml-2 px-2 py-1 bg-primary/10 text-primary text-xs rounded">
                            Selected
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Select or create a prospect</span>
                      )}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>

                    {openProspectSearch && (
                      <div className="absolute top-full mt-1 w-full z-10">
                        <Command className="rounded-lg border shadow-md">
                          <CommandInput 
                            placeholder="Search prospects..." 
                            className="h-9"
                          />
                          <CommandList>
                            <CommandEmpty className="py-3 px-4 text-center">
                              <div className="text-sm text-muted-foreground py-2">
                                No prospects found.
                              </div>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="w-full mt-2"
                                onClick={() => {
                                  // Store current selection before clearing
                                  setPreviousSelectedProspect(selectedProspect);
                                  setShowCreateProspect(true);
                                  setOpenProspectSearch(false);
                                  // Clear selected prospect when switching to create mode
                                  setSelectedProspect(null);
                                  form.setValue("prospect", "");
                                }}
                              >
                                <PlusCircle className="mr-2 h-4 w-4 text-primary" />
                                <span>Create new prospect</span>
                              </Button>
                            </CommandEmpty>
                            <CommandGroup>
                              {prospects.map((prospect: Prospect) => (
                                <CommandItem
                                  key={prospect._id}
                                  value={prospect.name}
                                  onSelect={() => {
                                    setSelectedProspect(prospect);
                                    field.onChange(prospect._id);
                                    setOpenProspectSearch(false);
                                  }}
                                >
                                  {prospect.name}
                                  <Check
                                    className={cn(
                                      "ml-auto h-4 w-4",
                                      field.value === prospect._id
                                        ? "opacity-100"
                                        : "opacity-0"
                                    )}
                                  />
                                </CommandItem>
                              ))}
                            </CommandGroup>
                            {prospects.length > 0 && (
                              <>
                                <CommandSeparator />
                                <CommandGroup>
                                  <CommandItem onSelect={() => {
                                    // Store current selection before clearing
                                    setPreviousSelectedProspect(selectedProspect);
                                    setShowCreateProspect(true);
                                    setOpenProspectSearch(false);
                                    // Clear selected prospect when switching to create mode
                                    setSelectedProspect(null);
                                    form.setValue("prospect", "");
                                  }}>
                                    <PlusCircle className="mr-2 h-4 w-4 text-primary" />
                                    <span>Create new prospect</span>
                                  </CommandItem>
                                </CommandGroup>
                              </>
                            )}
                          </CommandList>
                        </Command>
                      </div>
                    )}
                  </div>
                </FormControl>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Opportunity Name *</FormLabel>
              <FormControl>
                <Input placeholder="Enter opportunity name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Enter opportunity description"
                  className="resize-none"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Amount *</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="Enter amount (USD)"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="stage"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Stage *</FormLabel>
              <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingStages}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={isLoadingStages ? "Loading stages..." : "Select stage"} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {pipelineStages.map((stage: PipelineStage) => (
                    <SelectItem key={stage._id} value={stage._id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="createdDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-orange-500" />
                Date of First Opportunity Communication *
              </FormLabel>
              <FormControl>
                <Input 
                  type="date" 
                  {...field} 
                  className="border-orange-200 focus:border-orange-400 focus:ring-orange-400"
                />
              </FormControl>
              <p className="text-xs text-orange-600 mt-1">
                This is the date when you first communicated about this opportunity with the prospect
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        {error && (
          <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

            <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
              <button
                type="submit" 
                disabled={isLoading || opportunityOps.isLoading}
                className="px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors disabled:opacity-50 min-w-[140px]"
              >
                {(isLoading || opportunityOps.isLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {showCreateProspect && newProspectName.trim()
                  ? "Create Prospect & Opportunity"
                  : "Create Opportunity"
                }
              </button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
