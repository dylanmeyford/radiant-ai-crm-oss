import { useState } from "react";
import { useForm } from "react-hook-form";
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
import { Switch } from "@/components/ui/switch";
import { Contact, EmailEntry } from "@/types/prospect";
import { useContactOperations } from "@/hooks/useContactOperations";
import { Loader2, Trash2, Plus, X, Star } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const contactFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().optional(),
  role: z.string().optional(),
  isPrimary: z.boolean(),
  notes: z.string().optional(),
});

type ContactFormValues = z.infer<typeof contactFormSchema>;

interface ContactFormProps {
  contact?: Contact;
  prospectId: string;
  onSuccess?: () => void;
  onDelete?: () => void;
}

export function ContactForm({ contact, prospectId, onSuccess, onDelete }: ContactFormProps) {
  const { createContact, updateContact, deleteContact, isSubmitting, isDeleting, error } = useContactOperations();
  
  // State for managing email addresses
  const [emails, setEmails] = useState<EmailEntry[]>(() => {
    if (contact?.emails && contact.emails.length > 0) {
      return contact.emails.map(email => ({
        _id: email._id,
        address: email.address,
        category: email.category,
        isPrimary: email.isPrimary
      }));
    }
    return [{ address: "", isPrimary: true }];
  });

  const [emailErrors, setEmailErrors] = useState<string[]>([]);

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema) as any,
    defaultValues: {
      firstName: contact?.firstName || "",
      lastName: contact?.lastName || "",
      phone: contact?.phone || "",
      role: contact?.role || "",
      isPrimary: contact?.isPrimary || false,
      notes: contact?.notes || "",
    },
  });

  // Validate email format
  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Validate all emails
  const validateEmails = () => {
    const errors: string[] = [];
    const filledEmails = emails.filter(email => email.address.trim() !== "");
    
    if (filledEmails.length === 0) {
      errors.push("At least one email address is required");
      setEmailErrors(errors);
      return false;
    }

    let hasPrimary = false;
    const addressSet = new Set();

    filledEmails.forEach((email, index) => {
      if (!isValidEmail(email.address)) {
        errors[index] = "Invalid email format";
      }
      
      if (addressSet.has(email.address.toLowerCase())) {
        errors[index] = "Duplicate email address";
      } else {
        addressSet.add(email.address.toLowerCase());
      }
      
      if (email.isPrimary) {
        hasPrimary = true;
      }
    });

    if (!hasPrimary && filledEmails.length > 0) {
      errors.push("One email must be marked as primary");
    }

    setEmailErrors(errors);
    return errors.filter(Boolean).length === 0;
  };

  // Add new email field
  const addEmail = () => {
    setEmails([...emails, { address: "", isPrimary: false }]);
  };

  // Remove email field
  const removeEmail = (index: number) => {
    if (emails.length <= 1) return; // Keep at least one email field
    
    const newEmails = emails.filter((_, i) => i !== index);
    
    // If we removed the primary email, make the first one primary
    if (emails[index].isPrimary && newEmails.length > 0) {
      newEmails[0].isPrimary = true;
    }
    
    setEmails(newEmails);
  };

  // Update email address
  const updateEmailAddress = (index: number, address: string) => {
    const newEmails = [...emails];
    newEmails[index].address = address;
    setEmails(newEmails);
  };

  // Set primary email
  const setPrimaryEmail = (index: number) => {
    const newEmails = emails.map((email, i) => ({
      ...email,
      isPrimary: i === index
    }));
    setEmails(newEmails);
  };

  async function onSubmit(data: ContactFormValues) {
    if (!validateEmails()) {
      return;
    }

    try {
      // Filter out empty email addresses
      const validEmails = emails.filter(email => email.address.trim() !== "");
      
      const contactData = {
        ...data,
        prospectId,
        emails: validEmails
      };

      if (contact) {
        await updateContact(contact._id, contactData);
      } else {
        await createContact(contactData);
      }
      
      onSuccess?.();
    } catch (err) {
      console.error("Error submitting contact form:", err);
      // Error handling is managed by the hook
    }
  }

  async function handleDelete() {
    if (!contact) return;
    
    try {
      await deleteContact(contact._id, prospectId);
      onDelete?.();
    } catch (err) {
      console.error("Error deleting contact:", err);
      // Error handling is managed by the hook
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
      <div className="p-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit as any)} className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }: { field: any }) => (
              <FormItem>
                <FormLabel>First Name</FormLabel>
                <FormControl>
                  <Input placeholder="John" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="lastName"
            render={({ field }: { field: any }) => (
              <FormItem>
                <FormLabel>Last Name</FormLabel>
                <FormControl>
                  <Input placeholder="Doe" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Email Addresses Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <FormLabel className="text-base">Email Addresses</FormLabel>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addEmail}
              className="h-8"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Email
            </Button>
          </div>
          
          <div className="space-y-3">
            {emails.map((email, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="flex-1">
                  <Input
                    type="email"
                    placeholder="email@example.com"
                    value={email.address}
                    onChange={(e) => updateEmailAddress(index, e.target.value)}
                    className={emailErrors[index] ? "border-destructive" : ""}
                  />
                  {emailErrors[index] && (
                    <p className="text-sm text-destructive mt-1">{emailErrors[index]}</p>
                  )}
                </div>
                
                <Button
                  type="button"
                  variant={email.isPrimary ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPrimaryEmail(index)}
                  className="h-10 px-3"
                  disabled={email.isPrimary}
                >
                  <Star className={`h-4 w-4 ${email.isPrimary ? "fill-current" : ""}`} />
                  {email.isPrimary && <span className="ml-1 text-xs">Primary</span>}
                </Button>
                
                {emails.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeEmail(index)}
                    className="h-10 px-3 text-destructive hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          
          {emailErrors.length > 0 && emailErrors.some(err => err === "At least one email address is required" || err === "One email must be marked as primary") && (
            <div className="text-sm text-destructive">
              {emailErrors.find(err => err === "At least one email address is required" || err === "One email must be marked as primary")}
            </div>
          )}
        </div>

        <FormField
          control={form.control}
          name="phone"
          render={({ field }: { field: any }) => (
            <FormItem>
              <FormLabel>Phone</FormLabel>
              <FormControl>
                <Input type="tel" placeholder="+1 (555) 000-0000" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="role"
          render={({ field }: { field: any }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <FormControl>
                <Input placeholder="e.g. CEO, CTO, etc." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isPrimary"
          render={({ field }: { field: any }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Primary Contact</FormLabel>
                <div className="text-sm text-muted-foreground">
                  This contact will be shown as the main contact for this prospect
                </div>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }: { field: any }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Add any additional notes about this contact..."
                  className="resize-none"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

            <div className="flex justify-between items-center pt-4 border-t border-gray-200">
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {contact ? "Update Contact" : "Create Contact"}
              </button>
              
              {contact && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center"
                >
                  {isDeleting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Delete Contact
                </button>
              )}
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
