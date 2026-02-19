import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileCode, Plus, ChevronRight } from "lucide-react";
import { useEvalOperations } from "@/hooks/useEvalOperations";
import { usePageActions } from "@/context/PageActionsContext";
import { Skeleton } from "@/components/ui/skeleton";
import { PromptTemplate } from "@/types/evals";
import { Badge } from "@/components/ui/badge";

export default function EvalTemplatesPage() {
  const navigate = useNavigate();
  const { setActions, clearActions } = usePageActions();
  const { getTemplatesQuery } = useEvalOperations();
  const [agentFilter, setAgentFilter] = useState("");

  const templatesQuery = getTemplatesQuery({
    agentName: agentFilter || undefined,
  });

  useEffect(() => {
    setActions([
      {
        id: 'create-template',
        label: 'Create Template',
        icon: Plus,
        onClick: () => navigate('/admin/evals/templates/new'),
        variant: 'default',
      },
    ]);

    return () => {
      clearActions();
    };
  }, [setActions, clearActions, navigate]);

  const templates = templatesQuery.data || [];

  const agentOptions = useMemo(() => {
    const set = new Set(templates.map((template) => template.agentName).filter(Boolean));
    return Array.from(set);
  }, [templates]);

  const groupedTemplates = useMemo(() => {
    const groups: Record<string, PromptTemplate[]> = {};
    templates.forEach((template) => {
      if (!groups[template.agentName]) {
        groups[template.agentName] = [];
      }
      groups[template.agentName].push(template);
    });
    return groups;
  }, [templates]);

  const openTemplate = (template: PromptTemplate) => {
    navigate(`/admin/evals/templates/${template._id}`);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-900">Filters</h3>
              <p className="text-xs text-gray-500 mt-1">Filter templates by agent</p>
            </div>
            <div className="p-4">
              <select
                className="w-full sm:w-56 border border-gray-200 rounded-md px-3 py-2 text-sm"
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
              >
                <option value="">All agents</option>
                {agentOptions.map((agent) => (
                  <option key={agent} value={agent}>
                    {agent}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {templatesQuery.isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}

          {!templatesQuery.isLoading && templates.length === 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-500">No templates found.</p>
            </div>
          )}

          {!templatesQuery.isLoading &&
            Object.entries(groupedTemplates).map(([agentName, agentTemplates]) => (
              <div
                key={agentName}
                className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
              >
                <div className="p-4 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <FileCode className="h-4 w-4 text-gray-600" />
                    <h3 className="text-sm font-medium text-gray-900">{agentName}</h3>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{agentTemplates.length} templates</p>
                </div>
                <div className="p-4 space-y-3">
                  {agentTemplates.map((template) => (
                    <button
                      key={template._id}
                      onClick={() => openTemplate(template)}
                      className="w-full text-left border border-gray-200 rounded-md p-3 hover:border-gray-300 hover:bg-gray-50 transition-colors group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900">{template.version}</p>
                            {template.isActive && (
                              <Badge className="bg-gray-900 text-white text-xs">Active</Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1 truncate">{template.description || 'No description'}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 flex-shrink-0 ml-2" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </div>

    </div>
  );
}
