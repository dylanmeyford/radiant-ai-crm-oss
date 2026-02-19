import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useActivityOperations } from '@/hooks/useActivityOperations';
import { ActivityType } from '@/types/prospect';
import { OpportunityData } from '@/types/pipeline';
import { Loader2, AlertCircle } from 'lucide-react';

// Activity form schema
const activitySchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  date: z.string().min(1, 'Date is required'),
  time: z.string().min(1, 'Time is required'),
  type: z.nativeEnum(ActivityType),
  duration: z.string().optional(),
  status: z.enum(['to_do', 'scheduled', 'completed', 'cancelled', 'draft']),
});

type ActivityFormValues = z.infer<typeof activitySchema>;

interface ActivityFormProps {
  opportunityId: string;
  opportunity: OpportunityData;
  onSuccess: () => void;
  onCancel: () => void;
}

export function ActivityForm({ opportunityId, opportunity, onSuccess, onCancel }: ActivityFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { createActivity } = useActivityOperations({ 
    entityType: 'opportunity', 
    entityId: opportunityId 
  });
  
  const form = useForm<ActivityFormValues>({
    resolver: zodResolver(activitySchema),
    defaultValues: {
      title: '',
      description: '',
      date: new Date().toISOString().split('T')[0], // Today's date
      time: new Date().toTimeString().slice(0, 5), // Current time
      type: ActivityType.NOTE,
      duration: '',
      status: 'to_do',
    },
  });

  const activityTypeOptions = [
    { value: ActivityType.NOTE, label: 'Note' },
    { value: ActivityType.CALL, label: 'Call' },
    { value: ActivityType.EMAIL, label: 'Email' },
    { value: ActivityType.MEETING_NOTES, label: 'Meeting Notes' },
    { value: ActivityType.TASK, label: 'Task' },
    { value: ActivityType.SMS, label: 'SMS' },
    { value: ActivityType.LINKEDIN, label: 'LinkedIn' },
    { value: ActivityType.OTHER, label: 'Other' },
  ];

  const statusOptions = [
    { value: 'to_do', label: 'To Do' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'completed', label: 'Completed' },
    { value: 'draft', label: 'Draft' },
  ];

  const onSubmit = async (values: ActivityFormValues) => {
    setError(null);
    setIsSubmitting(true);

    try {
      // Combine date and time into a Date object
      const dateTime = new Date(`${values.date}T${values.time}`);
      
      // Prepare activity data
      const activityData = {
        title: values.title,
        description: values.description || '',
        date: dateTime,
        type: values.type,
        duration: values.duration ? parseInt(values.duration) : undefined,
        status: values.status,
        contacts: [], // Will be populated based on opportunity contacts if needed
        tags: [],
        metadata: {
          opportunityId: opportunityId,
          createdVia: 'opportunity_activity_form'
        }
      } as any;

      // Add prospect field if available (needed by API but not in ActivityFormData interface)
      if (opportunity.prospect) {
        activityData.prospect = opportunity.prospect._id || opportunity.prospect;
      }

      const result = await createActivity(activityData);
      
      if (result.success) {
        onSuccess();
      } else {
        setError(result.error || 'Failed to create activity');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create activity';
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="title" className="text-sm font-medium text-gray-900">
          Title <span className="text-red-500">*</span>
        </Label>
        <Input
          id="title"
          {...form.register('title')}
          placeholder="Enter activity title"
          className={form.formState.errors.title ? 'border-red-500' : ''}
        />
        {form.formState.errors.title && (
          <p className="text-red-600 text-xs">{form.formState.errors.title.message}</p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description" className="text-sm font-medium text-gray-900">
          Description
        </Label>
        <Textarea
          id="description"
          {...form.register('description')}
          placeholder="Enter activity description (optional)"
          rows={4}
        />
      </div>

      {/* Activity Type */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-gray-900">
          Activity Type <span className="text-red-500">*</span>
        </Label>
        <Select
          value={form.watch('type')}
          onValueChange={(value) => form.setValue('type', value as ActivityType)}
        >
          <SelectTrigger className={form.formState.errors.type ? 'border-red-500' : ''}>
            <SelectValue placeholder="Select activity type" />
          </SelectTrigger>
          <SelectContent>
            {activityTypeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.type && (
          <p className="text-red-600 text-xs">{form.formState.errors.type.message}</p>
        )}
      </div>

      {/* Date and Time */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="date" className="text-sm font-medium text-gray-900">
            Date <span className="text-red-500">*</span>
          </Label>
          <Input
            id="date"
            type="date"
            {...form.register('date')}
            className={form.formState.errors.date ? 'border-red-500' : ''}
          />
          {form.formState.errors.date && (
            <p className="text-red-600 text-xs">{form.formState.errors.date.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="time" className="text-sm font-medium text-gray-900">
            Time <span className="text-red-500">*</span>
          </Label>
          <Input
            id="time"
            type="time"
            {...form.register('time')}
            className={form.formState.errors.time ? 'border-red-500' : ''}
          />
          {form.formState.errors.time && (
            <p className="text-red-600 text-xs">{form.formState.errors.time.message}</p>
          )}
        </div>
      </div>

      {/* Duration and Status */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="duration" className="text-sm font-medium text-gray-900">
            Duration (minutes)
          </Label>
          <Input
            id="duration"
            type="number"
            {...form.register('duration')}
            placeholder="e.g., 30"
            min="1"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-gray-900">
            Status
          </Label>
          <Select
            value={form.watch('status')}
            onValueChange={(value) => form.setValue('status', value as any)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-4 pt-4 border-t border-gray-200">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            'Create Activity'
          )}
        </Button>
        
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
