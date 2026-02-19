import React from 'react';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// Inline loading spinner for cards, buttons, etc.
interface InlineLoaderProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  color?: 'blue' | 'green' | 'gray' | 'white';
}

export function InlineLoader({ className, size = 'sm', color = 'blue' }: InlineLoaderProps) {
  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4', 
    lg: 'h-5 w-5'
  };
  
  const colorClasses = {
    blue: 'text-blue-500',
    green: 'text-green-500',
    gray: 'text-gray-500',
    white: 'text-white'
  };

  return (
    <Loader2 
      className={cn(
        'animate-spin flex-shrink-0',
        sizeClasses[size],
        colorClasses[color],
        className
      )} 
    />
  );
}

// Loading overlay for cards with subtle background
interface LoadingOverlayProps {
  isLoading: boolean;
  children: React.ReactNode;
  className?: string;
  overlayClassName?: string;
}

export function LoadingOverlay({ 
  isLoading, 
  children, 
  className,
  overlayClassName 
}: LoadingOverlayProps) {
  return (
    <div className={cn('relative', className)}>
      {children}
      {isLoading && (
        <div className={cn(
          'absolute inset-0 bg-blue-50/30 rounded-lg border-2 border-blue-200 transition-all duration-200',
          overlayClassName
        )} />
      )}
    </div>
  );
}

// Status indicator with loading, success, and error states
interface StatusIndicatorProps {
  status: 'loading' | 'success' | 'error' | 'idle';
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export function StatusIndicator({ 
  status, 
  size = 'sm', 
  showText = false, 
  className 
}: StatusIndicatorProps) {
  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  };

  const statusConfig = {
    loading: {
      icon: <Loader2 className={cn(sizeClasses[size], 'animate-spin text-blue-500')} />,
      text: 'Updating...',
      textColor: 'text-blue-600'
    },
    success: {
      icon: <CheckCircle className={cn(sizeClasses[size], 'text-green-500')} />,
      text: 'Saved',
      textColor: 'text-green-600'
    },
    error: {
      icon: <AlertCircle className={cn(sizeClasses[size], 'text-red-500')} />,
      text: 'Error',
      textColor: 'text-red-600'
    },
    idle: {
      icon: null,
      text: '',
      textColor: ''
    }
  };

  const config = statusConfig[status];
  
  if (status === 'idle') return null;

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {config.icon}
      {showText && (
        <span className={cn('text-xs font-medium', config.textColor)}>
          {config.text}
        </span>
      )}
    </div>
  );
}

// Loading button with integrated spinner
interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  loadingText?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export function LoadingButton({
  isLoading = false,
  loadingText = 'Loading...',
  children,
  disabled,
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: LoadingButtonProps) {
  const baseClasses = 'inline-flex items-center justify-center gap-2 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500',
    ghost: 'text-gray-600 hover:bg-gray-100 focus:ring-gray-500'
  };
  
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs rounded-md',
    md: 'px-4 py-2 text-sm rounded-lg',
    lg: 'px-6 py-3 text-base rounded-lg'
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={cn(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {isLoading && <InlineLoader size={size} color={variant === 'primary' ? 'white' : 'gray'} />}
      <span>{isLoading ? loadingText : children}</span>
    </button>
  );
}

// Card wrapper with optimistic loading state
interface OptimisticCardProps {
  isUpdating?: boolean;
  children: React.ReactNode;
  className?: string;
  updateIndicator?: 'ring' | 'overlay' | 'none';
}

export function OptimisticCard({ 
  isUpdating = false, 
  children, 
  className,
  updateIndicator = 'ring'
}: OptimisticCardProps) {
  const updateClasses = {
    ring: isUpdating ? 'ring-2 ring-blue-200 bg-blue-50/30' : '',
    overlay: '', // Handled by LoadingOverlay
    none: ''
  };

  if (updateIndicator === 'overlay') {
    return (
      <LoadingOverlay isLoading={isUpdating} className={className}>
        {children}
      </LoadingOverlay>
    );
  }

  return (
    <div className={cn(
      'transition-all duration-200',
      updateClasses[updateIndicator],
      className
    )}>
      {children}
    </div>
  );
}
