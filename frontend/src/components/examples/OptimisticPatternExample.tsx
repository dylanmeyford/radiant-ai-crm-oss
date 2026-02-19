// Example: How to implement TanStack Query optimistic UI patterns in new components
// This file demonstrates the REQUIRED patterns all components must follow
// NOTE: This is an EXAMPLE file - some imports may not exist in your project

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Skeleton } from '../ui/skeleton';
import { Loader2, RefreshCw } from 'lucide-react';
import { requestWithAuth } from '../../hooks/requestWithAuth';
// import { queryKeys } from '../../hooks/queryKeys';

// Example: Task Management with Proper TanStack Query Optimistic Updates
interface Task {
  _id: string;
  title: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  createdAt: Date;
}

interface TaskFormData {
  title: string;
  priority: 'low' | 'medium' | 'high';
}

// REQUIRED PATTERN: Operations Hook with TanStack Query
export function useTaskOperations() {
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // 1. Use useQuery for fetching data (single source of truth)
  const tasksQuery = useQuery({
    queryKey: ['tasks'], // Replace with: queryKeys.tasks?.list() || ['tasks'],
    queryFn: async () => {
      const { data, error: apiError } = await requestWithAuth("api/tasks", "GET", null);
      if (apiError) throw new Error(apiError);
      
      // Process and return clean data structure
      const tasksData = Array.isArray(data) ? data : (data?.data || []);
      return tasksData.map((task: any) => ({
        ...task,
        createdAt: new Date(task.createdAt), // Process dates
      }));
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // 2. Create mutation with PROPER optimistic updates
  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, updates }: { taskId: string; updates: Partial<Task> }) => {
      const { data, error: apiError } = await requestWithAuth(
        `api/tasks/${taskId}`,
        "PUT",
        updates
      );
      if (apiError) throw new Error(apiError);
      return data;
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: ['tasks'] });

      // Snapshot the previous value for rollback
      const previousTasks = queryClient.getQueryData(['tasks']);

      // CRITICAL: Optimistically update cache - match your query structure exactly
      queryClient.setQueryData(['tasks'], (old: Task[]) => {
        if (!old || !Array.isArray(old)) return old; // Direct array check
        
        return old.map((task: Task) =>
          task._id === variables.taskId
            ? { ...task, ...variables.updates }
            : task
        );
      });

      return { previousTasks }; // For rollback
    },
    onError: (_err, _variables, context) => {
      // Rollback on failure - TanStack Query handles this automatically
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks'], context.previousTasks);
      }
    },
    onSettled: () => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (taskData: TaskFormData) => {
      const { data, error: apiError } = await requestWithAuth(
        "api/tasks",
        "POST",
        taskData
      );
      if (apiError) throw new Error(apiError);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error: apiError } = await requestWithAuth(
        `api/tasks/${taskId}`,
        "DELETE",
        null
      );
      if (apiError) throw new Error(apiError);
    },
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      const previousTasks = queryClient.getQueryData(['tasks']);

      // Optimistically remove from cache
      queryClient.setQueryData(['tasks'], (old: Task[]) => {
        if (!old || !Array.isArray(old)) return old;
        return old.filter((task: Task) => task._id !== taskId);
      });

      return { previousTasks };
    },
    onError: (_err, _taskId, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks'], context.previousTasks);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  // 3. Wrapper functions for easier usage
  const updateTask = async (taskId: string, updates: Partial<Task>) => {
    setError(null);
    try {
      const data = await updateTaskMutation.mutateAsync({ taskId, updates });
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update task";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const createTask = async (taskData: TaskFormData) => {
    setError(null);
    try {
      const data = await createTaskMutation.mutateAsync(taskData);
      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create task";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const deleteTask = async (taskId: string) => {
    setError(null);
    try {
      await deleteTaskMutation.mutateAsync(taskId);
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete task";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  return {
    // Query data and states (single source of truth)
    tasks: tasksQuery.data || [],
    isLoadingTasks: tasksQuery.isLoading,
    tasksError: tasksQuery.error,
    refetchTasks: tasksQuery.refetch,
    
    // Mutation states
    isUpdating: updateTaskMutation.isPending,
    isCreating: createTaskMutation.isPending,
    isDeleting: deleteTaskMutation.isPending,
    error,
    
    // Actions
    updateTask,
    createTask,
    deleteTask,
    clearError: () => setError(null),
  };
}

// REQUIRED PATTERN: Component using TanStack Query data directly
export function TaskListExample() {
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  const { 
    tasks,
    isLoadingTasks,
    tasksError,
    updateTask,
    deleteTask,
    refetchTasks
  } = useTaskOperations();

  // Handle task toggle with visual feedback
  const handleTaskToggle = async (taskId: string) => {
    const task = tasks.find((t: Task) => t._id === taskId);
    if (!task) return;

    setUpdatingTaskId(taskId);
    try {
      // TanStack Query handles optimistic updates automatically
      const result = await updateTask(taskId, { completed: !task.completed });
      if (!result.success) {
        console.error('Failed to toggle task:', result.error);
      }
    } catch (error) {
      console.error('Error toggling task:', error);
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const handlePriorityChange = async (taskId: string, priority: Task['priority']) => {
    setUpdatingTaskId(taskId);
    try {
      const result = await updateTask(taskId, { priority });
      if (!result.success) {
        console.error('Failed to update priority:', result.error);
      }
    } catch (error) {
      console.error('Error updating priority:', error);
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    setDeletingTaskId(taskId);
    try {
      const result = await deleteTask(taskId);
      if (!result.success) {
        console.error('Failed to delete task:', result.error);
      }
    } catch (error) {
      console.error('Error deleting task:', error);
    } finally {
      setDeletingTaskId(null);
    }
  };

  if (tasksError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-600 font-medium">Error loading tasks</p>
          <p className="text-gray-500 text-sm mt-1">{tasksError.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Task Management Example</CardTitle>
            <div className="flex gap-2">
              <button
                onClick={() => refetchTasks()}
                className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoadingTasks ? (
            // Loading skeletons
            Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-lg" />
            ))
          ) : tasks.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              No tasks found
            </div>
          ) : (
            tasks.map((task: Task) => (
              <TaskCard
                key={task._id}
                task={task}
                isUpdating={updatingTaskId === task._id}
                isDeleting={deletingTaskId === task._id}
                onToggle={handleTaskToggle}
                onPriorityChange={handlePriorityChange}
                onDelete={handleDeleteTask}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// REQUIRED PATTERN: Individual item component with loading states
interface TaskCardProps {
  task: Task;
  isUpdating: boolean;
  isDeleting: boolean;
  onToggle: (taskId: string) => void;
  onPriorityChange: (taskId: string, priority: Task['priority']) => void;
  onDelete: (taskId: string) => void;
}

function TaskCard({ 
  task, 
  isUpdating, 
  isDeleting, 
  onToggle, 
  onPriorityChange, 
  onDelete 
}: TaskCardProps) {
  return (
    <div className={`
      p-4 border rounded-lg transition-all duration-200
      ${isUpdating ? 'ring-2 ring-blue-200 bg-blue-50/30' : ''}
      ${isDeleting ? 'ring-2 ring-red-200 bg-red-50/30' : ''}
    `}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Checkbox with loading indicator */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={task.completed}
              onChange={() => onToggle(task._id)}
              className="h-4 w-4 text-blue-600 rounded"
              disabled={isUpdating || isDeleting}
            />
            {isUpdating && (
              <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
            )}
            {isDeleting && (
              <Loader2 className="h-3 w-3 text-red-500 animate-spin" />
            )}
          </div>
          
          <span className={`font-medium ${task.completed ? 'line-through text-gray-500' : ''}`}>
            {task.title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Priority selector */}
          <select
            value={task.priority}
            onChange={(e) => onPriorityChange(task._id, e.target.value as Task['priority'])}
            className="text-sm border rounded px-2 py-1"
            disabled={isUpdating || isDeleting}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          
          {/* Delete button */}
          <button
            onClick={() => onDelete(task._id)}
            disabled={isUpdating || isDeleting}
            className="text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// Export the example component
export default TaskListExample;