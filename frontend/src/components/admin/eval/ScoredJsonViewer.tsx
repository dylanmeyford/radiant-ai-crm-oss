import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ScoreDetail = {
  score: number;
  reason: string;
};

interface ScoredJsonViewerProps {
  value: any;
  scoreDetails?: Record<string, ScoreDetail>;
}

interface JsonNodeProps {
  name?: string;
  value: any;
  depth: number;
  path: string;
  scoreDetails?: Record<string, ScoreDetail>;
}

const isObjectLike = (value: any) => value !== null && typeof value === "object";

const getHighlightClass = (score: number) => {
  if (score >= 0.8) return "bg-green-50 border-l-2 border-green-500";
  if (score >= 0.5) return "bg-amber-50 border-l-2 border-amber-500";
  return "bg-red-50 border-l-2 border-red-500";
};

function HighlightWrapper({
  detail,
  children,
}: {
  detail?: ScoreDetail;
  children: React.ReactNode;
}) {
  if (!detail) return <>{children}</>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-help">{children}</div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="space-y-1">
          <div className="text-xs font-medium text-primary-foreground">
            Score: {Math.round(detail.score * 100)}%
          </div>
          <div className="text-xs text-primary-foreground">{detail.reason}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function JsonNode({ name, value, depth, path, scoreDetails }: JsonNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1);
  const [stringExpanded, setStringExpanded] = useState(false);
  const isArray = Array.isArray(value);
  const detail = scoreDetails?.[path];
  const highlightClass = detail ? getHighlightClass(detail.score) : "";

  if (typeof value === "string") {
    const isLong = value.length > 200;
    const preview = isLong ? `${value.slice(0, 200)}...` : value;
    const displayText = isLong && stringExpanded ? value : preview;
    return (
      <HighlightWrapper detail={detail}>
        <div className={cn("flex items-start gap-2 rounded-md px-2 py-1", highlightClass)}>
          {name && <span className="text-sky-700">{name}:</span>}
          <span className="text-emerald-700 whitespace-pre-wrap">"{displayText}"</span>
          {isLong && (
            <button
              type="button"
              onClick={() => setStringExpanded((prev) => !prev)}
              className="text-xs text-gray-500 hover:text-gray-900"
            >
              {stringExpanded ? "Collapse" : "Expand"}
            </button>
          )}
        </div>
      </HighlightWrapper>
    );
  }

  if (typeof value === "number") {
    return (
      <HighlightWrapper detail={detail}>
        <div className={cn("flex items-start gap-2 rounded-md px-2 py-1", highlightClass)}>
          {name && <span className="text-sky-700">{name}:</span>}
          <span className="text-purple-700">{value}</span>
        </div>
      </HighlightWrapper>
    );
  }

  if (typeof value === "boolean") {
    return (
      <HighlightWrapper detail={detail}>
        <div className={cn("flex items-start gap-2 rounded-md px-2 py-1", highlightClass)}>
          {name && <span className="text-sky-700">{name}:</span>}
          <span className="text-orange-700">{value ? "true" : "false"}</span>
        </div>
      </HighlightWrapper>
    );
  }

  if (value === null) {
    return (
      <HighlightWrapper detail={detail}>
        <div className={cn("flex items-start gap-2 rounded-md px-2 py-1", highlightClass)}>
          {name && <span className="text-sky-700">{name}:</span>}
          <span className="text-gray-500">null</span>
        </div>
      </HighlightWrapper>
    );
  }

  if (!isObjectLike(value)) {
    return (
      <HighlightWrapper detail={detail}>
        <div className={cn("flex items-start gap-2 rounded-md px-2 py-1", highlightClass)}>
          {name && <span className="text-sky-700">{name}:</span>}
          <span className="text-gray-900">{JSON.stringify(value)}</span>
        </div>
      </HighlightWrapper>
    );
  }

  const keys = isArray ? value.map((_: any, index: number) => index) : Object.keys(value);
  const label = isArray ? `Array(${value.length})` : `Object(${keys.length})`;

  return (
    <div>
      <HighlightWrapper detail={detail}>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className={cn(
            "flex items-center gap-1 text-left rounded-md px-2 py-1",
            highlightClass
          )}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-gray-500" />
          ) : (
            <ChevronRight className="h-3 w-3 text-gray-500" />
          )}
          {name && <span className="text-sky-700">{name}:</span>}
          <span className="text-gray-700">{label}</span>
        </button>
      </HighlightWrapper>
      {expanded && (
        <div className="ml-4 mt-1 space-y-1">
          {keys.length === 0 && <div className="text-gray-500">empty</div>}
          {keys.map((key: any) => {
            const childPath = path ? `${path}.${String(key)}` : String(key);
            return (
              <JsonNode
                key={String(key)}
                name={isArray ? `[${key}]` : String(key)}
                value={value[key]}
                depth={depth + 1}
                path={childPath}
                scoreDetails={scoreDetails}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ScoredJsonViewer({ value, scoreDetails }: ScoredJsonViewerProps) {
  return (
    <div className="text-xs font-mono text-gray-900 bg-gray-50 rounded-md p-3 overflow-x-auto">
      <JsonNode value={value ?? {}} depth={0} path="" scoreDetails={scoreDetails} />
    </div>
  );
}
