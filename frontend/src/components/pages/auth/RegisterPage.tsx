import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { RegisterForm } from '@/components/auth/RegisterForm';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { isAuthenticated } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isValidatingToken, setIsValidatingToken] = useState(true);

  useEffect(() => {
    // If user is already authenticated, redirect to today page
    if (isAuthenticated) {
      navigate('/today', { replace: true });
      return;
    }

    console.log('token', token);

    // Token validation will be handled by the RegisterForm component
    // No token is fine - we support open registration
    setIsValidatingToken(false);
  }, [isAuthenticated, token, navigate]);

  // Don't render anything while checking authentication
  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-dvh bg-muted grid place-items-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <img src="/assets/radiant_logo.svg" alt="Logo" className="h-9 w-9" />
        </div>
        {error && (
          <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
            {error}
          </div>
        )}
        <React.Suspense
          fallback={
            <div className="rounded-lg border p-6 shadow-sm animate-pulse">
              <div className="h-5 w-32 bg-muted rounded" />
              <div className="mt-2 h-4 w-48 bg-muted rounded" />
              <div className="mt-6 space-y-4">
                <div className="h-10 bg-muted rounded" />
                <div className="h-10 bg-muted rounded" />
                <div className="h-10 bg-muted rounded" />
                <div className="h-10 bg-muted rounded" />
              </div>
            </div>
          }
        >
          {!isValidatingToken && (
            <RegisterForm 
              invitationToken={token ?? undefined} 
              onError={(error) => setError(error)}
            />
          )}
        </React.Suspense>
      </div>
    </div>
  );
}
