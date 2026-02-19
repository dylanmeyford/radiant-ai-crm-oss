import * as React from "react"
import { useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { LoginForm } from "@/components/auth/LoginForm"
import { useAuth } from "@/context/AuthContext"

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isInitializing, isAuthenticated, error } = useAuth()

  // Redirect to intended destination or today page if already authenticated
  useEffect(() => {
    if (!isInitializing && isAuthenticated) {
      const from = (location.state as any)?.from?.pathname || "/today"
      navigate(from, { replace: true })
    }
  }, [isInitializing, isAuthenticated, navigate, location.state])

  // Show loading state while checking authentication
  if (isInitializing) {
    return (
      <div className="min-h-dvh bg-muted grid place-items-center p-4">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex justify-center">
            <img src="/assets/radiant_logo.svg" alt="Logo" className="h-9 w-9" />
          </div>
          {/* <div className="rounded-lg border p-6 shadow-sm animate-pulse">
            <div className="h-5 w-32 bg-muted rounded" />
            <div className="mt-2 h-4 w-48 bg-muted rounded" />
            <div className="mt-6 space-y-4">
              <div className="h-10 bg-muted rounded" />
              <div className="h-10 bg-muted rounded" />
              <div className="h-10 bg-muted rounded" />
            </div>
          </div> */}
        </div>
      </div>
    )
  }

  // Don't render login form if user is authenticated (they'll be redirected)
  if (isAuthenticated) {
    return null
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
              </div>
            </div>
          }
        >
          <LoginForm />
        </React.Suspense>
      </div>
    </div>
  )
}


