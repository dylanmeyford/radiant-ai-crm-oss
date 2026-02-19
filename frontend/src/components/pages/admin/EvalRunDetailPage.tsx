import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useEvalOperations } from "@/hooks/useEvalOperations";
import { JsonViewer } from "@/components/admin/eval/JsonViewer";
import { JsonEditor } from "@/components/admin/eval/JsonEditor";

const formatJson = (value: any) => {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? "");
  }
};

export default function EvalRunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const { getRunQuery, markGoldenRun, isMarkingGolden } = useEvalOperations();
  const runQuery = getRunQuery(runId || null);

  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [expectedOutputText, setExpectedOutputText] = useState("");
  const [expectedNotes, setExpectedNotes] = useState("");
  const [expectedError, setExpectedError] = useState<string | null>(null);

  useEffect(() => {
    const run = runQuery.data;
    if (!run) return;
    setExpectedNotes(run.expectedNotes || "");
    const source = run.expectedOutput ?? run.parsedOutput ?? {};
    setExpectedOutputText(formatJson(source));
    setExpectedError(null);
  }, [runQuery.data]);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error("Failed to copy text:", error);
    }
  };

  if (runQuery.isLoading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (!runQuery.data) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <Link to="/admin/evals/runs" className="text-sm text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4 inline-block mr-2" />
            Back to runs
          </Link>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-sm text-gray-600">Run not found.</p>
          </div>
        </div>
      </div>
    );
  }

  const run = runQuery.data;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-4">
          <Link to="/admin/evals/runs" className="text-sm text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4 inline-block mr-2" />
            Back to runs
          </Link>
          <Badge variant="secondary" className="text-xs">
            {run.status}
          </Badge>
        </div>

        {/* Two-column layout for Input Variables and Expected Output */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div className="bg-white rounded-lg border border-gray-200 min-w-0">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium text-gray-900">Input Variables</h3>
                <p className="text-xs text-gray-500 mt-1">Captured data before prompt render</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(formatJson(run.inputVariables))}
                className="text-xs flex-shrink-0"
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
            </div>
            <div className="p-4 overflow-auto">
              <JsonViewer value={run.inputVariables} />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 min-w-0">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium text-gray-900">Expected Output</h3>
                <p className="text-xs text-gray-500 mt-1">Lock in the golden output</p>
              </div>
              {run.expectedOutput && (
                <Badge className="bg-gray-900 text-white text-xs flex-shrink-0">Locked</Badge>
              )}
            </div>
            <div className="p-4 space-y-3 overflow-auto">
              {run.expectedOutput ? (
                <JsonViewer value={run.expectedOutput} />
              ) : (
                <>
                  <JsonEditor
                    value={expectedOutputText}
                    onChange={setExpectedOutputText}
                    rows={12}
                  />
                  <Textarea
                    value={expectedNotes}
                    onChange={(e) => setExpectedNotes(e.target.value)}
                    rows={3}
                    placeholder="Why this output is expected (optional)"
                  />
                  {expectedError && <p className="text-xs text-red-600">{expectedError}</p>}
                  <Button
                    onClick={async () => {
                      try {
                        const parsed = JSON.parse(expectedOutputText || "{}");
                        setExpectedError(null);
                        await markGoldenRun({
                          runId: run._id,
                          expectedOutput: parsed,
                          expectedNotes: expectedNotes.trim() || undefined,
                        });
                      } catch (error) {
                        setExpectedError("Expected Output must be valid JSON.");
                      }
                    }}
                    disabled={isMarkingGolden}
                    className="bg-gray-900 text-white hover:bg-gray-800"
                  >
                    {isMarkingGolden ? "Saving..." : "Set Expected Output"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Full-width sections below */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-900">Full Prompt</h3>
                <p className="text-xs text-gray-500 mt-1">Rendered prompt sent to the model</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsPromptExpanded((prev) => !prev)}
                  className="text-xs"
                >
                  {isPromptExpanded ? "Collapse" : "Expand"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(run.fullPrompt || "")}
                  className="text-xs"
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy
                </Button>
              </div>
            </div>
            <div className="p-4">
              <pre className="text-xs text-gray-900 bg-gray-50 rounded-md p-3 whitespace-pre-wrap break-words">
                {run.fullPrompt
                  ? isPromptExpanded
                    ? run.fullPrompt
                    : `${run.fullPrompt.slice(0, 800)}${run.fullPrompt.length > 800 ? "..." : ""}`
                  : "No prompt captured."}
              </pre>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-900">Parsed Output</h3>
                <p className="text-xs text-gray-500 mt-1">Structured output returned by the agent</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(formatJson(run.parsedOutput))}
                className="text-xs"
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
            </div>
            <div className="p-4">
              <JsonViewer value={run.parsedOutput} />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-900">Metadata</h3>
              <p className="text-xs text-gray-500 mt-1">Model, tokens, and latency</p>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-500">Agent</p>
                <p className="text-sm text-gray-900">{run.agentName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Model</p>
                <p className="text-sm text-gray-900">{run.modelName || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Tokens</p>
                <p className="text-sm text-gray-900">{run.usage?.totalTokens ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Latency</p>
                <p className="text-sm text-gray-900">{run.latencyMs ? `${run.latencyMs} ms` : "—"}</p>
              </div>
            </div>
          </div>

          {run.error && (
            <div className="bg-white rounded-lg border border-red-200">
              <div className="p-4 border-b border-red-200">
                <h3 className="text-sm font-medium text-red-700">Error</h3>
              </div>
              <div className="p-4 text-xs text-red-600">{run.error}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
