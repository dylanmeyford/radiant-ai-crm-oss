import type { PropsWithChildren } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"

export function RequireAuth({ children }: PropsWithChildren) {
  const location = useLocation()
  const { isInitializing, isAuthenticated, error } = useAuth()

  if (isInitializing) {
    return (
      <div className="min-h-dvh grid place-items-center p-4">
        <div className="rounded-lg border p-6 shadow-sm animate-pulse w-full max-w-sm">
          <div className="h-5 w-32 bg-muted rounded" />
          <div className="mt-2 h-4 w-48 bg-muted rounded" />
          <div className="mt-6 space-y-4">
            <div className="h-10 bg-muted rounded" />
            <div className="h-10 bg-muted rounded" />
            <div className="h-10 bg-muted rounded" />
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated || error) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return children
}

export default RequireAuth


