import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmailEditor, EmailData } from '@/components/email';
// import { useEmailOperations } from '@/hooks/useEmailOperations';
import { Mail } from 'lucide-react';

export const EmailEditorExample: React.FC = () => {
  const [showEditor, setShowEditor] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mock prospect ID and organization ID - replace with actual IDs
  const mockProspectId = "example-prospect-id";
  const mockOrganizationId = "example-org-id";

  // Email operations hook is available if needed for other functionality
  // const { uploadAttachments, deleteAttachment } = useEmailOperations();

  // Handle email send
  const handleSend = async (emailData: EmailData) => {
    console.log('Sending email:', emailData);
    setIsLoading(true);
    setError(null);

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Mock success
      console.log('Email sent successfully!');
      setShowEditor(false);
    } catch (err) {
      setError('Failed to send email. Please try again.');
      console.error('Send error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle save draft
  const handleSaveDraft = async (emailData: EmailData) => {
    console.log('Saving draft:', emailData);
    setIsLoading(true);
    setError(null);

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock success
      console.log('Draft saved successfully!');
    } catch (err) {
      setError('Failed to save draft. Please try again.');
      console.error('Save draft error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle schedule email
  const handleSchedule = async (emailData: EmailData, scheduledFor: Date) => {
    console.log('Scheduling email:', emailData, 'for:', scheduledFor);
    setIsLoading(true);
    setError(null);

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mock success
      console.log('Email scheduled successfully!');
      setShowEditor(false);
    } catch (err) {
      setError('Failed to schedule email. Please try again.');
      console.error('Schedule error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (showEditor) {
    return (
      <div className="h-screen flex flex-col">
        <EmailEditor
          prospectId={mockProspectId}
          organizationId={mockOrganizationId}
          onSend={handleSend}
          onSaveDraft={handleSaveDraft}
          onSchedule={handleSchedule}
          onClose={() => setShowEditor(false)}
          isModal={true}
          isLoading={isLoading}
          error={error}
          title="Compose Email"
          initialData={{
            subject: "Follow up on our conversation",
            body: "<p>Hi there,</p><p>I wanted to follow up on our recent conversation...</p><p>Best regards,<br/>Your Name</p>",
            attachments: []
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Editor Example
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            This example demonstrates the EmailEditor component with contact selection,
            rich text editing, file attachments, and email actions (send, save draft, schedule).
          </p>
          
          <div className="space-y-2">
            <h3 className="font-medium">Features:</h3>
            <ul className="text-sm text-gray-600 space-y-1 ml-4">
              <li>• Contact selection with search and filtering</li>
              <li>• To, CC, BCC fields with easy management</li>
              <li>• Rich text editor with formatting options</li>
              <li>• File attachments with drag & drop upload</li>
              <li>• Attachment validation and progress indicators</li>
              <li>• Custom email address support</li>
              <li>• Form validation and error handling</li>
              <li>• Send, save draft, and schedule actions</li>
              <li>• Responsive design with mobile support</li>
            </ul>
          </div>

          <Button 
            onClick={() => setShowEditor(true)}
            className="w-full flex items-center gap-2"
          >
            <Mail className="h-4 w-4" />
            Open Email Editor
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmailEditorExample;
