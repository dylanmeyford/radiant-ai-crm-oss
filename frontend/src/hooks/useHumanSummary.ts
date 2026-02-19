import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { requestWithAuth } from './requestWithAuth';
// import { queryKeys } from './queryKeys';

export interface HumanSummaryData {
  emailFrom: string;
  emailTo: Array<{ name: string; email: string }>;
  emailCc: Array<{ name: string; email: string }>;
  emailBcc: Array<{ name: string; email: string }>;
  keyMessage: string;
  context: string;
  salesCycleStage: 'Discovery' | 'Qualification' | 'Proposal' | 'Negotiation' | 'Closed';
  sentimentAnalysis: string;
  MEDDPICC: {
    Metrics: Array<{ metric: string; reason: string; confidence: 'High' | 'Medium' | 'Low' }>;
    "Economic Buyer": Array<{ name: string; reason: string; confidence: 'High' | 'Medium' | 'Low' }>;
    "Decision Criteria": Array<{ criteria: string; reason: string; confidence: 'High' | 'Medium' | 'Low' }>;
    "Decision Process": Array<{ process: string; reason: string; confidence: 'High' | 'Medium' | 'Low' }>;
    "Paper Process": Array<{ process: string; reason: string; confidence: 'High' | 'Medium' | 'Low' }>;
    "Identified Pain": Array<{ pain: string; reason: string; confidence: 'High' | 'Medium' | 'Low' }>;
    Champion: Array<{ name: string; reason: string; confidence: 'High' | 'Medium' | 'Low' }>;
    Competition: Array<{ competition: string; reason: string; confidence: 'High' | 'Medium' | 'Low' }>;
  };
}

export const useHumanSummary = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const saveSummaryMutation = useMutation({
    mutationFn: async ({ emailId, payload }: { emailId: string; payload: HumanSummaryData }) => {
      const { error: requestError } = await requestWithAuth(
        `api/admin/${emailId}/human-summary`,
        'POST',
        payload
      );
      if (requestError) throw new Error(requestError);
    },
    onSuccess: (_data, variables) => {
      // Invalidate any email-activity detail queries tied to this email
      queryClient.invalidateQueries({ queryKey: [{ scope: 'email-activities', entity: 'detail', emailId: variables.emailId }] });
    },
  });

  const saveHumanSummary = async (emailId: string, summaryData: HumanSummaryData) => {
    setIsLoading(true);
    setError(null);

    try {
      // Filter out empty objects from arrays
      const cleanedData = {
        ...summaryData,
        emailTo: summaryData.emailTo.filter(item => item.email.trim() !== ''),
        emailCc: summaryData.emailCc.filter(item => item.email.trim() !== ''),
        emailBcc: summaryData.emailBcc.filter(item => item.email.trim() !== ''),
        MEDDPICC: {
          Metrics: summaryData.MEDDPICC.Metrics.filter(item => item.metric.trim() !== ''),
          "Economic Buyer": summaryData.MEDDPICC["Economic Buyer"].filter(item => item.name.trim() !== ''),
          "Decision Criteria": summaryData.MEDDPICC["Decision Criteria"].filter(item => item.criteria.trim() !== ''),
          "Decision Process": summaryData.MEDDPICC["Decision Process"].filter(item => item.process.trim() !== ''),
          "Paper Process": summaryData.MEDDPICC["Paper Process"].filter(item => item.process.trim() !== ''),
          "Identified Pain": summaryData.MEDDPICC["Identified Pain"].filter(item => item.pain.trim() !== ''),
          Champion: summaryData.MEDDPICC.Champion.filter(item => item.name.trim() !== ''),
          Competition: summaryData.MEDDPICC.Competition.filter(item => item.competition.trim() !== ''),
        }
      };

      await saveSummaryMutation.mutateAsync({ emailId, payload: cleanedData });

      return { success: true };
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to save human summary';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const clearError = () => setError(null);

  return {
    saveHumanSummary,
    isLoading,
    error,
    clearError,
  };
}; 