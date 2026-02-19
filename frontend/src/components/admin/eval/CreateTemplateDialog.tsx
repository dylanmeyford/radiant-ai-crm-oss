import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EvalRun } from "@/types/evals";

interface CreateTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runs: EvalRun[];
  onCreate: (payload: { agentName: string; version: string; template: string; description?: string }) => Promise<void>;
  isCreating: boolean;
}

export function CreateTemplateDialog({
  open,
  onOpenChange,
  runs,
  onCreate,
  isCreating,
}: CreateTemplateDialogProps) {
  const [agentName, setAgentName] = useState("");
  const [version, setVersion] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState("");

  useEffect(() => {
    if (!open) {
      setAgentName("");
      setVersion("");
      setDescription("");
      setTemplate("");
    }
  }, [open]);

  const agentOptions = useMemo(() => {
    const set = new Set(runs.map((run) => run.agentName).filter(Boolean));
    return Array.from(set);
  }, [runs]);

  const handleCreate = async () => {
    if (!agentName || !version.trim() || !template.trim()) {
      return;
    }
    await onCreate({
      agentName,
      version: version.trim(),
      template: template.trim(),
      description: description.trim() || undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Template</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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
            <label className="text-xs text-gray-500">Version</label>
            <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v1.1-shorter" />
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
            <label className="text-xs text-gray-500">Template</label>
            <Textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="Paste template literal content here"
              rows={10}
              className="font-mono text-xs"
            />
            <p className="text-xs text-gray-500">
              Use the same template literal syntax as production (${`...`} placeholders are supported).
            </p>
          </div>
        </div>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!agentName || !version.trim() || !template.trim() || isCreating}
          >
            {isCreating ? 'Creating...' : 'Create Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
