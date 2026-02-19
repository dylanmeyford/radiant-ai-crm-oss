import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { requestWithAuth } from './requestWithAuth';
import { queryKeys } from './queryKeys';

export interface Task {
  _id: string;
  title: string;
  description?: string;
  date: Date;
  type: 'task';
  status: 'to_do' | 'completed';
  contactId?: string;
  createdBy: {
    _id: string;
    name: string;
    email: string;
  };
  actionType?: string;
  recipients?: string[];
  metadata?: {
    actionType?: string;
    recipients?: string[];
    [key: string]: any;
  };
}

export interface TaskFormData {
  title: string;
  description?: string;
  date: Date;
  contactId?: string;
  type: 'task';
  prospect: string;
  status: 'to_do';
}

export const useTaskOperations = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { data, error } = await requestWithAuth(
        `api/activities/tasks/${taskId}/complete`, 
        "PATCH", 
        null
      );
      if (error) throw new Error(error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [{ scope: 'activities', entity: 'tasks' }] });
    }
  });

  const createTaskMutation = useMutation({
    mutationFn: async (taskData: TaskFormData) => {
      const { error } = await requestWithAuth(
        "api/activities",
        "POST",
        taskData
      );
      if (error) throw new Error(error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [{ scope: 'activities', entity: 'tasks' }] });
    },
  });

  const fetchTasks = async (prospectId: string, contactId?: string): Promise<Task[]> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const { data, error } = await queryClient.ensureQueryData({
        queryKey: queryKeys.activities.tasksByProspect(prospectId),
        queryFn: async () => requestWithAuth(
          `api/activities/prospect/${prospectId}/tasks`, 
          "GET", 
          null
        ),
      });
      
      if (error) throw new Error(error);
      
      if (data) {
        // Convert date strings to Date objects and process metadata
        const tasksWithDates = data.data.map((task: any) => ({
          ...task,
          date: new Date(task.date),
          // Extract actionType and recipients from metadata if available
          actionType: task.metadata?.actionType || task.actionType,
          recipients: task.metadata?.recipients || task.recipients
        }));
        
        // If contactId is provided, filter tasks for that contact
        const filteredTasks = contactId 
          ? tasksWithDates.filter((task: Task) => task.contactId === contactId) 
          : tasksWithDates;
        
        return filteredTasks;
      }
      
      return [];
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch tasks";
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const completeTask = async (taskId: string): Promise<void> => {
    try {
      const data = await completeTaskMutation.mutateAsync(taskId);
      if (data) {
      }
    } catch (err) {
      throw err;
    }
  };

  const createTask = async (taskData: TaskFormData): Promise<void> => {
    try {
      await createTaskMutation.mutateAsync(taskData);

    } catch (error) {
      console.error("Error adding task:", error);
      throw error;
    }
  };

  return {
    isLoading,
    error,
    fetchTasks,
    completeTask,
    createTask,
  };
}; 