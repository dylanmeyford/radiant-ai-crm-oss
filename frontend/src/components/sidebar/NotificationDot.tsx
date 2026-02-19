import React from 'react';
import { cn } from '@/lib/utils';

interface NotificationDotProps {
  show: boolean;
  className?: string;
}

export const NotificationDot: React.FC<NotificationDotProps> = ({ 
  show, 
  className 
}) => {
  if (!show) return null;

  return (
    <div
      className={cn(
        "absolute -top-1 -right-1 h-2 w-2 bg-green-500 rounded-full animate-pulse",
        className
      )}
      aria-label="New notifications available"
    />
  );
};
