import { useMemo, useRef } from "react";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const highlightJson = (value: string) => {
  if (!value) return "";

  const tokens: string[] = [];
  const addToken = (html: string) => {
    const id = `___TOK${tokens.length}___`;
    tokens.push(html);
    return id;
  };

  let working = value;

  // Keys: "key":
  working = working.replace(/"(?:\\.|[^"\\])*"\s*:/g, (match) => {
    const key = match.slice(0, match.lastIndexOf(":"));
    const html = `<span class="text-sky-700">${escapeHtml(key)}</span><span class="text-gray-500">:</span>`;
    return addToken(html);
  });

  // Strings (remaining)
  working = working.replace(/"(?:\\.|[^"\\])*"/g, (match) => {
    const html = `<span class="text-emerald-700">${escapeHtml(match)}</span>`;
    return addToken(html);
  });

  // Numbers
  working = working.replace(/-?\b\d+(\.\d+)?([eE][+-]?\d+)?\b/g, (match) => {
    const html = `<span class="text-purple-700">${escapeHtml(match)}</span>`;
    return addToken(html);
  });

  // Booleans
  working = working.replace(/\btrue\b|\bfalse\b/g, (match) => {
    const html = `<span class="text-orange-700">${escapeHtml(match)}</span>`;
    return addToken(html);
  });

  // Null
  working = working.replace(/\bnull\b/g, (match) => {
    const html = `<span class="text-gray-500">${escapeHtml(match)}</span>`;
    return addToken(html);
  });

  const escaped = escapeHtml(working);
  let highlighted = escaped;
  tokens.forEach((token, index) => {
    const placeholder = `___TOK${index}___`;
    highlighted = highlighted.replace(placeholder, token);
  });

  return highlighted;
};

interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  className?: string;
}

export function JsonEditor({ value, onChange, rows = 8, className }: JsonEditorProps) {
  const preRef = useRef<HTMLPreElement | null>(null);
  const highlighted = useMemo(() => highlightJson(value), [value]);

  return (
    <div className={`relative font-mono text-xs ${className ?? ""}`} style={{ minHeight: rows * 20 }}>
      <pre
        ref={preRef}
        className="absolute inset-0 whitespace-pre-wrap break-words bg-gray-50 rounded-md p-3 overflow-auto text-gray-900"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (preRef.current) {
            preRef.current.scrollTop = e.currentTarget.scrollTop;
            preRef.current.scrollLeft = e.currentTarget.scrollLeft;
          }
        }}
        rows={rows}
        spellCheck={false}
        className="absolute inset-0 w-full h-full resize-none bg-transparent text-transparent caret-gray-900 p-3 outline-none"
        aria-label="JSON editor"
      />
    </div>
  );
}
