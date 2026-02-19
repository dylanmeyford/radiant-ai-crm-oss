import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Save, Copy, Check, FileCode, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TemplateEditor } from "@/components/admin/eval/TemplateEditor";
import { useEvalOperations } from "@/hooks/useEvalOperations";

export default function EditTemplatePage() {
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId: string }>();
  const [searchParams] = useSearchParams();
  const isNew = templateId === "new";
  
  const { 
    getTemplateQuery, 
    getRunsQuery,
    createTemplate,
    updateTemplate,
    isCreatingTemplate,
    isUpdatingTemplate,
  } = useEvalOperations();

  const templateQuery = getTemplateQuery(isNew ? null : templateId || null);
  const runsQuery = getRunsQuery({ limit: 100 });

  const [agentName, setAgentName] = useState("");
  const [version, setVersion] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [copied, setCopied] = useState(false);

  // Get agent options from runs
  const agentOptions = useMemo(() => {
    const runs = runsQuery.data?.runs || [];
    const set = new Set(runs.map((run) => run.agentName).filter(Boolean));
    return Array.from(set);
  }, [runsQuery.data]);

  // Pre-fill agent name from URL param when creating new template
  useEffect(() => {
    if (isNew) {
      const prefilledAgent = searchParams.get("agent");
      if (prefilledAgent) {
        setAgentName(prefilledAgent);
      }
    }
  }, [isNew, searchParams]);

  // Load existing template data
  useEffect(() => {
    if (templateQuery.data && !isNew) {
      setAgentName(templateQuery.data.agentName);
      setVersion(templateQuery.data.version);
      setDescription(templateQuery.data.description || "");
      setTemplate(templateQuery.data.template);
      setHasChanges(false);
    }
  }, [templateQuery.data, isNew]);

  // Track changes
  useEffect(() => {
    if (isNew) {
      setHasChanges(agentName.trim() !== "" || version.trim() !== "" || template.trim() !== "");
    } else if (templateQuery.data) {
      const original = templateQuery.data;
      setHasChanges(
        agentName !== original.agentName ||
        version !== original.version ||
        description !== (original.description || "") ||
        template !== original.template
      );
    }
  }, [agentName, version, description, template, templateQuery.data, isNew]);

  const handleSave = async () => {
    if (!agentName || !version.trim() || !template.trim()) {
      return;
    }

    if (isNew) {
      const result = await createTemplate({
        agentName,
        version: version.trim(),
        template: template.trim(),
        description: description.trim() || undefined,
      });
      if (result.success && result.data) {
        navigate(`/admin/evals/templates/${result.data._id}`, { replace: true });
      }
    } else if (templateId) {
      const result = await updateTemplate(templateId, {
        agentName,
        version: version.trim(),
        template: template.trim(),
        description: description.trim() || undefined,
      });
      if (result.success) {
        setHasChanges(false);
      }
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(template);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy template:', error);
    }
  };

  const handleBack = () => {
    navigate("/admin/evals/templates");
  };

  const isLoading = !isNew && templateQuery.isLoading;
  const isSaving = isCreatingTemplate || isUpdatingTemplate;
  const canSave = agentName && version.trim() && template.trim() && hasChanges && !isSaving;

  if (isLoading) {
    return (
      <div className="flex flex-col h-full overflow-hidden bg-gray-50">
        <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-4">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-6 w-48" />
          </div>
        </div>
        <div className="flex-1 p-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-full">
            <div className="lg:col-span-1 space-y-4">
              <Skeleton className="h-32 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
            <div className="lg:col-span-3">
              <Skeleton className="h-full w-full rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              <FileCode className="h-5 w-5 text-gray-600" />
              <h1 className="text-lg font-semibold text-gray-900">
                {isNew ? "New Template" : "Edit Template"}
              </h1>
              {!isNew && templateQuery.data?.isActive && (
                <Badge className="bg-gray-900 text-white text-xs">Active</Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={!template}
              className="text-xs"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 mr-1" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 mr-1" />
                  Copy
                </>
              )}
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!canSave}
              className="bg-gray-900 text-white hover:bg-gray-800"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-3 w-3 mr-1" />
                  {isNew ? "Create" : "Save"}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden p-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-full">
          {/* Sidebar - Metadata */}
          <div className="lg:col-span-1 space-y-4 overflow-y-auto">
            <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">Agent</label>
                <select
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                >
                  <option value="">Select agent</option>
                  {agentOptions.map((agent) => (
                    <option key={agent} value={agent}>
                      {agent}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">Version</label>
                <Input 
                  value={version} 
                  onChange={(e) => setVersion(e.target.value)} 
                  placeholder="v1.0"
                  className="text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">Description</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                  rows={3}
                  className="text-sm resize-none"
                />
              </div>
            </div>

            {/* Syntax Legend */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-xs font-medium text-gray-700 mb-3">Syntax Highlighting</h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono px-1.5 py-0.5 rounded bg-gray-900">
                    <span className="text-purple-400">${"{"}</span>
                    <span className="text-amber-400">var</span>
                    <span className="text-purple-400">{"}"}</span>
                  </span>
                  <span className="text-gray-600">Variables</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono px-1.5 py-0.5 rounded bg-gray-900 text-sky-400">"key":</span>
                  <span className="text-gray-600">JSON keys</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono px-1.5 py-0.5 rounded bg-gray-900 text-emerald-400">"string"</span>
                  <span className="text-gray-600">Strings</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono px-1.5 py-0.5 rounded bg-gray-900 text-blue-400">123</span>
                  <span className="text-gray-600">Numbers</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono px-1.5 py-0.5 rounded bg-gray-900 text-orange-400">true</span>
                  <span className="text-gray-600">Booleans</span>
                </div>
              </div>
            </div>
          </div>

          {/* Main Editor */}
          <div className="lg:col-span-3 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">Template Content</label>
              <p className="text-xs text-gray-500">
                Use <code className="bg-gray-100 px-1 rounded">${"{variableName}"}</code> for variables
              </p>
            </div>
            <TemplateEditor
              value={template}
              onChange={setTemplate}
              className="flex-1 min-h-[400px]"
              placeholder="Enter your prompt template here...

Example:
You are a helpful assistant for ${companyName}.

The user's name is ${userName} and they work as a ${userRole}.

Please help them with the following request:
${userRequest}"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
