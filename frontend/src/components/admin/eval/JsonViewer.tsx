import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

const isObjectLike = (value: any) => value !== null && typeof value === "object";

interface JsonNodeProps {
  name?: string;
  value: any;
  depth: number;
}

function JsonNode({ name, value, depth }: JsonNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1);
  const [stringExpanded, setStringExpanded] = useState(false);
  const isArray = Array.isArray(value);

  if (typeof value === "string") {
    const isLong = value.length > 200;
    const preview = isLong ? `${value.slice(0, 200)}...` : value;
    const displayText = isLong && stringExpanded ? value : preview;
    return (
      <div className="flex items-start gap-2">
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
    );
  }

  if (typeof value === "number") {
    return (
      <div className="flex items-start gap-2">
        {name && <span className="text-sky-700">{name}:</span>}
        <span className="text-purple-700">{value}</span>
      </div>
    );
  }

  if (typeof value === "boolean") {
    return (
      <div className="flex items-start gap-2">
        {name && <span className="text-sky-700">{name}:</span>}
        <span className="text-orange-700">{value ? "true" : "false"}</span>
      </div>
    );
  }

  if (value === null) {
    return (
      <div className="flex items-start gap-2">
        {name && <span className="text-sky-700">{name}:</span>}
        <span className="text-gray-500">null</span>
      </div>
    );
  }

  if (!isObjectLike(value)) {
    return (
      <div className="flex items-start gap-2">
        {name && <span className="text-sky-700">{name}:</span>}
        <span className="text-gray-900">{JSON.stringify(value)}</span>
      </div>
    );
  }

  const keys = isArray ? value.map((_: any, index: number) => index) : Object.keys(value);
  const label = isArray ? `Array(${value.length})` : `Object(${keys.length})`;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-1 text-left"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-gray-500" />
        ) : (
          <ChevronRight className="h-3 w-3 text-gray-500" />
        )}
        {name && <span className="text-sky-700">{name}:</span>}
        <span className="text-gray-700">{label}</span>
      </button>
      {expanded && (
        <div className="ml-4 mt-1 space-y-1">
          {keys.length === 0 && <div className="text-gray-500">empty</div>}
          {keys.map((key: any) => (
            <JsonNode
              key={String(key)}
              name={isArray ? `[${key}]` : String(key)}
              value={value[key]}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function JsonViewer({ value }: { value: any }) {
  return (
    <div className="text-xs font-mono text-gray-900 bg-gray-50 rounded-md p-3 overflow-x-auto">
      <JsonNode value={value ?? {}} depth={0} />
    </div>
  );
}
