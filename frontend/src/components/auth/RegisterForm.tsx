import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useAuthOperations } from '@/hooks/useAuthOperations';
import { queryKeys } from '@/hooks/queryKeys';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface RegisterFormProps {
  invitationToken?: string;
  onError?: (error: string | null) => void;
  className?: string;
}

interface RegisterFormComponentProps extends RegisterFormProps, Omit<React.ComponentPropsWithoutRef<"div">, keyof RegisterFormProps> {}

export function RegisterForm({
  invitationToken,
  onError,
  className,
  ...props
}: RegisterFormComponentProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { refreshAuthState } = useAuth();
  const { signup, signupWithToken } = useAuthOperations();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError(null);
    onError?.(null);

    // Basic validation
    if (!name.trim()) {
      const error = 'Name is required';
      setSubmitError(error);
      onError?.(error);
      return;
    }

    if (!email.trim()) {
      const error = 'Email is required';
      setSubmitError(error);
      onError?.(error);
      return;
    }

    if (!password) {
      const error = 'Password is required';
      setSubmitError(error);
      onError?.(error);
      return;
    }

    if (password.length < 6) {
      const error = 'Password must be at least 6 characters';
      setSubmitError(error);
      onError?.(error);
      return;
    }

    if (password !== confirmPassword) {
      const error = 'Passwords do not match';
      setSubmitError(error);
      onError?.(error);
      return;
    }

    setIsSubmitting(true);

    try {
      // Use token-based signup if token provided, otherwise use regular signup
      const { data, error } = invitationToken 
        ? await signupWithToken(name.trim(), email.trim(), password, invitationToken)
        : await signup(name.trim(), email.trim(), password);
      
      if (error) {
        throw new Error(error);
      }

      // Persist access token when provided
      if (data?.accessToken) {
        localStorage.setItem("accessToken", data.accessToken);
      }

      // Force refresh the user data to update auth context
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() as unknown as any });
      
      // Refresh the auth state to pick up the new authentication status
      await refreshAuthState();
      
      // Navigate to today page
      navigate("/today", { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      setSubmitError(message);
      onError?.(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              {invitationToken ? 'Join Your Team' : 'Create Account'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {invitationToken 
                ? 'Complete your registration to join your organization'
                : 'Sign up to get started'}
            </p>
          </div>
          
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>
            
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>
            
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                required
                minLength={6}
              />
            </div>
            
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isSubmitting}
                required
                minLength={6}
              />
            </div>
          </div>
          
          {submitError && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
              {submitError}
            </div>
          )}
          
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Creating Account...' : 'Create Account'}
          </Button>
          
          <div className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-primary underline-offset-4 hover:underline"
              disabled={isSubmitting}
            >
              Sign in
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
