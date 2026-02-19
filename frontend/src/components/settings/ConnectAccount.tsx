import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useNylasOAuth } from '@/hooks/useNylasOAuth';

const ConnectAccount: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { handleOAuthCallback, progress, status, error } = useNylasOAuth();

  useEffect(() => {
    const processCallback = async () => {
      const searchParams = new URLSearchParams(location.search);
      const code = searchParams.get('code');

      if (!code) {
        return;
      }

      const result = await handleOAuthCallback(code);
      
      if (result.success) {
        // Redirect to settings page after a short delay
        setTimeout(() => {
          navigate('/settings');
        }, 1500);
      }
    };

    processCallback();
  }, [location, navigate, handleOAuthCallback]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Authorising Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={progress} className="w-full" />
          {error ? (
            <div className="bg-destructive/15 text-destructive border border-destructive/50 px-4 py-3 rounded-lg">
              {error}
            </div>
          ) : (
            <div className="bg-primary/15 text-primary border border-primary/50 px-4 py-3 rounded-lg">
              {status}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ConnectAccount; 