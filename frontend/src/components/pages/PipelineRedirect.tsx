import { Navigate } from "react-router-dom"
import { usePipelines } from "@/hooks/usePipelines"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Redirects from /pipeline to /pipeline/:defaultPipelineId
 * Shows a loading state while fetching the default pipeline
 */
export default function PipelineRedirect() {
  const { defaultPipeline, isLoadingPipelines, isLoadingDefault } = usePipelines()
  
  const isLoading = isLoadingPipelines || isLoadingDefault

  // Show loading skeleton while fetching
  if (isLoading) {
    return (
      <div className="h-full flex flex-col overflow-hidden p-4">
        <div className="flex gap-6 overflow-x-auto h-full px-6 pb-6">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex-shrink-0 w-72">
              <Skeleton className="h-full min-h-[400px] rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // If we have a default pipeline, redirect to it
  if (defaultPipeline) {
    return <Navigate to={`/pipeline/${defaultPipeline._id}`} replace />
  }

  // If no pipelines exist, still show the pipeline page (it will handle empty state)
  // This shouldn't happen as there should always be at least one default pipeline
  return <Navigate to="/today" replace />
}
