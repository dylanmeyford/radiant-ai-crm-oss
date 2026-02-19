import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { EvalRun } from "@/types/evals";
import { Skeleton } from "@/components/ui/skeleton";

interface CreateDatasetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runs: EvalRun[];
  isLoadingRuns: boolean;
  onCreate: (payload: { name: string; description?: string; agentName: string; runIds: string[] }) => Promise<void>;
  isCreating: boolean;
}

export function CreateDatasetDialog({
  open,
  onOpenChange,
  runs,
  isLoadingRuns,
  onCreate,
  isCreating,
}: CreateDatasetDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [agentName, setAgentName] = useState("");
  const [search, setSearch] = useState("");
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setAgentName("");
      setSearch("");
      setSelectedRunIds([]);
    }
  }, [open]);

  const eligibleRuns = useMemo(() => {
    return runs.filter((run) => !!run.expectedOutput);
  }, [runs]);

  const agentOptions = useMemo(() => {
    const set = new Set(eligibleRuns.map((run) => run.agentName).filter(Boolean));
    return Array.from(set);
  }, [eligibleRuns]);

  const filteredRuns = useMemo(() => {
    return eligibleRuns.filter((run) => {
      if (agentName && run.agentName !== agentName) return false;
      if (!search) return true;
      const haystack = `${run.agentName} ${run.modelName || ''} ${run.status}`.toLowerCase();
      return haystack.includes(search.toLowerCase());
    });
  }, [eligibleRuns, agentName, search]);

  const toggleRun = (runId: string) => {
    setSelectedRunIds((prev) =>
      prev.includes(runId) ? prev.filter((id) => id !== runId) : [...prev, runId]
    );
  };

  const handleCreate = async () => {
    if (!name.trim() || !agentName || selectedRunIds.length === 0) {
      return;
    }
    await onCreate({
      name: name.trim(),
      description: description.trim() || undefined,
      agentName,
      runIds: selectedRunIds,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Dataset</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs text-gray-500">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dataset name" />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-gray-500">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-gray-500">Agent</label>
            <select
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
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
            <label className="text-xs text-gray-500">Search Runs</label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by agent/model/status" />
          </div>

          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-900">Select Runs</h3>
              <p className="text-xs text-gray-500 mt-1">Only runs with expected output are eligible</p>
            </div>
            <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
              {isLoadingRuns && (
                <div className="space-y-2">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                </div>
              )}
              {!isLoadingRuns && eligibleRuns.length === 0 && (
                <p className="text-sm text-gray-500">No runs with expected output yet.</p>
              )}
              {!isLoadingRuns && eligibleRuns.length > 0 && filteredRuns.length === 0 && (
                <p className="text-sm text-gray-500">No runs match your filters.</p>
              )}
              {!isLoadingRuns &&
                filteredRuns.map((run) => (
                  <label key={run._id} className="flex items-center gap-3 text-sm text-gray-900">
                    <Checkbox
                      checked={selectedRunIds.includes(run._id)}
                      onCheckedChange={() => toggleRun(run._id)}
                    />
                    <span className="flex-1">
                      {run.agentName} · {run.status} · {run.modelName || 'model unknown'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {run.createdAt ? new Date(run.createdAt).toLocaleString() : '—'}
                    </span>
                  </label>
                ))}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || !agentName || selectedRunIds.length === 0 || isCreating}
          >
            {isCreating ? 'Creating...' : 'Create Dataset'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
