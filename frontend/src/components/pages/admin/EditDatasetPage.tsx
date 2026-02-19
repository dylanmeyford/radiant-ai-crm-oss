import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save, Layers, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvalOperations } from "@/hooks/useEvalOperations";
import { EvalRun } from "@/types/evals";

const formatActivityType = (value?: string | null) => {
  if (!value) return "Unknown";
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const getRunId = (run: string | EvalRun) => (typeof run === "string" ? run : run._id);

export default function EditDatasetPage() {
  const navigate = useNavigate();
  const { datasetId } = useParams<{ datasetId: string }>();
  const isNew = datasetId === "new";

  const {
    getDatasetQuery,
    getRunsQuery,
    createDataset,
    updateDataset,
    isCreatingDataset,
    isUpdatingDataset,
  } = useEvalOperations();

  const datasetQuery = getDatasetQuery(isNew ? null : datasetId || null);
  const [agentName, setAgentName] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [search, setSearch] = useState("");
  const [activityTypeFilter, setActivityTypeFilter] = useState("");
  const [onlyEligible, setOnlyEligible] = useState(true);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const runsQuery = getRunsQuery({
    limit: 200,
    agentName: agentName || undefined,
  });

  const runLookup = useMemo(() => {
    const map = new Map<string, EvalRun>();
    const runs = runsQuery.data?.runs || [];
    runs.forEach((run) => map.set(run._id, run));
    if (datasetQuery.data?.runIds) {
      datasetQuery.data.runIds.forEach((run) => {
        if (typeof run !== "string") {
          map.set(run._id, run);
        }
      });
    }
    return map;
  }, [runsQuery.data, datasetQuery.data]);

  useEffect(() => {
    if (datasetQuery.data && !isNew) {
      const dataset = datasetQuery.data;
      setAgentName(dataset.agentName);
      setName(dataset.name);
      setDescription(dataset.description || "");
      setSelectedRunIds(dataset.runIds.map(getRunId));
      setHasChanges(false);
    }
  }, [datasetQuery.data, isNew]);

  useEffect(() => {
    if (isNew) {
      setSelectedRunIds([]);
      setActivityTypeFilter("");
    }
  }, [agentName, isNew]);

  const runs = runsQuery.data?.runs || [];
  const eligibleRuns = useMemo(() => runs.filter((run) => !!run.expectedOutput), [runs]);
  const baseRuns = onlyEligible ? eligibleRuns : runs;

  const activityTypeOptions = useMemo(() => {
    const types = new Set(
      baseRuns
        .map((run) => run.metadata?.activityType as string | undefined)
        .filter(Boolean)
    );
    return Array.from(types);
  }, [baseRuns]);

  const filteredRuns = useMemo(() => {
    return baseRuns.filter((run) => {
      if (activityTypeFilter && run.metadata?.activityType !== activityTypeFilter) return false;
      if (!search) return true;
      const haystack = `${run.agentName} ${run.modelName || ""} ${run.status} ${run.metadata?.activityType || ""}`
        .toLowerCase();
      return haystack.includes(search.toLowerCase());
    });
  }, [baseRuns, activityTypeFilter, search]);

  const selectedActivityTypes = useMemo(() => {
    const types = new Set<string>();
    selectedRunIds.forEach((id) => {
      const run = runLookup.get(id);
      const activityType = run?.metadata?.activityType as string | undefined;
      if (activityType) {
        types.add(activityType);
      }
    });
    return Array.from(types);
  }, [selectedRunIds, runLookup]);

  const toggleRun = (runId: string) => {
    setSelectedRunIds((prev) =>
      prev.includes(runId) ? prev.filter((id) => id !== runId) : [...prev, runId]
    );
  };

  const selectAllVisible = () => {
    const ids = filteredRuns.map((run) => run._id);
    setSelectedRunIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const deselectAllVisible = () => {
    const visibleIds = new Set(filteredRuns.map((run) => run._id));
    setSelectedRunIds((prev) => prev.filter((id) => !visibleIds.has(id)));
  };

  useEffect(() => {
    if (isNew) {
      setHasChanges(name.trim() !== "" || description.trim() !== "" || selectedRunIds.length > 0);
    } else if (datasetQuery.data) {
      const original = datasetQuery.data;
      const originalIds = original.runIds.map(getRunId).sort().join("|");
      const nextIds = [...selectedRunIds].sort().join("|");
      setHasChanges(
        name !== original.name ||
          description !== (original.description || "") ||
          nextIds !== originalIds
      );
    }
  }, [name, description, selectedRunIds, datasetQuery.data, isNew]);

  const handleSave = async () => {
    if (!name.trim() || !agentName || selectedRunIds.length === 0) return;
    if (isNew) {
      const result = await createDataset({
        name: name.trim(),
        description: description.trim() || undefined,
        agentName,
        runIds: selectedRunIds,
      });
      if (result.success && result.data) {
        navigate(`/admin/evals/datasets/${result.data._id}`, { replace: true });
      }
    } else if (datasetId) {
      const result = await updateDataset(datasetId, {
        name: name.trim(),
        description: description.trim() || undefined,
        runIds: selectedRunIds,
      });
      if (result.success) {
        setHasChanges(false);
      }
    }
  };

  const handleBack = () => navigate("/admin/evals/datasets");

  const isLoading = !isNew && datasetQuery.isLoading;
  const isSaving = isCreatingDataset || isUpdatingDataset;
  const canSave = name.trim() && agentName && selectedRunIds.length > 0 && hasChanges && !isSaving;

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
              <Layers className="h-5 w-5 text-gray-600" />
              <h1 className="text-lg font-semibold text-gray-900">
                {isNew ? "New Dataset" : "Edit Dataset"}
              </h1>
            </div>
          </div>
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

      <div className="flex-1 overflow-hidden p-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-full">
          <div className="lg:col-span-1 space-y-4 overflow-y-auto">
            <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">Name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dataset name" />
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
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">Agent</label>
                <select
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  disabled={!isNew}
                >
                  <option value="">Select agent</option>
                  {Array.from(new Set(runs.map((run) => run.agentName).filter(Boolean))).map((agent) => (
                    <option key={agent} value={agent}>
                      {agent}
                    </option>
                  ))}
                </select>
                {!isNew && (
                  <p className="text-xs text-gray-500">Agent is locked for existing datasets.</p>
                )}
              </div>
            </div>

            {selectedActivityTypes.length > 1 && (
              <div className="bg-white rounded-lg border border-amber-200 p-4">
                <div className="flex items-start gap-2 text-amber-700">
                  <AlertTriangle className="h-4 w-4 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium">Multiple activity types selected</p>
                    <p className="text-xs text-amber-600 mt-1">
                      Templates are typically activity-type specific. Consider filtering to one type.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-3 flex flex-col min-h-0">
            <div className="bg-white rounded-lg border border-gray-200 mb-4">
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">Select Runs</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {selectedRunIds.length} selected of {filteredRuns.length} filtered
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="text-xs" onClick={selectAllVisible}>
                      Select all
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs" onClick={deselectAllVisible}>
                      Deselect all
                    </Button>
                  </div>
                </div>
              </div>
              <div className="p-4 border-b border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search runs"
                    className="text-sm"
                  />
                  <select
                    className="border border-gray-200 rounded-md px-3 py-2 text-sm"
                    value={activityTypeFilter}
                    onChange={(e) => setActivityTypeFilter(e.target.value)}
                  >
                    <option value="">All activity types</option>
                    {activityTypeOptions.map((type) => (
                      <option key={type} value={type}>
                        {formatActivityType(type)}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <Checkbox checked={onlyEligible} onCheckedChange={(checked) => setOnlyEligible(!!checked)} />
                    Only with expected output
                  </label>
                  <div className="text-xs text-gray-500 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {eligibleRuns.length} eligible runs
                  </div>
                </div>
              </div>
              <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
                {runsQuery.isLoading && (
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                  </div>
                )}
                {!runsQuery.isLoading && baseRuns.length === 0 && (
                  <p className="text-sm text-gray-500">No runs available.</p>
                )}
                {!runsQuery.isLoading && baseRuns.length > 0 && filteredRuns.length === 0 && (
                  <p className="text-sm text-gray-500">No runs match your filters.</p>
                )}
                {!runsQuery.isLoading &&
                  filteredRuns.map((run) => {
                    const activityType = run.metadata?.activityType as string | undefined;
                    return (
                      <label
                        key={run._id}
                        className="flex items-center gap-3 text-sm text-gray-900 border border-gray-200 rounded-md px-3 py-2 hover:border-gray-300"
                      >
                        <Checkbox
                          checked={selectedRunIds.includes(run._id)}
                          onCheckedChange={() => toggleRun(run._id)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {formatActivityType(activityType)}
                            </Badge>
                            <span className="text-xs text-gray-500">{run.agentName}</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {run.modelName || "model unknown"} · {run.status}
                          </div>
                        </div>
                        <div className="text-xs text-gray-500">
                          {run.createdAt ? new Date(run.createdAt).toLocaleString() : "—"}
                        </div>
                      </label>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
