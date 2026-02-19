import { useMemo, useRef, useCallback } from "react";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const highlightTemplate = (value: string) => {
  if (!value) return "";

  const tokens: string[] = [];
  const addToken = (html: string) => {
    const id = `___TOK${tokens.length}___`;
    tokens.push(html);
    return id;
  };

  let working = value;

  // Template variables: ${variableName} or ${object.property}
  working = working.replace(/\$\{([^}]+)\}/g, (_match, inner) => {
    const html = `<span class="text-purple-600 font-semibold">\${</span><span class="text-amber-600">${escapeHtml(inner)}</span><span class="text-purple-600 font-semibold">}</span>`;
    return addToken(html);
  });

  // JSON-like keys in the template: "key":
  working = working.replace(/"([^"\\]|\\.)*"\s*:/g, (match) => {
    const key = match.slice(0, match.lastIndexOf(":"));
    const html = `<span class="text-sky-700">${escapeHtml(key)}</span><span class="text-gray-500">:</span>`;
    return addToken(html);
  });

  // Remaining strings in quotes
  working = working.replace(/"([^"\\]|\\.)*"/g, (match) => {
    const html = `<span class="text-emerald-700">${escapeHtml(match)}</span>`;
    return addToken(html);
  });

  // Numbers
  working = working.replace(/-?\b\d+(\.\d+)?([eE][+-]?\d+)?\b/g, (match) => {
    const html = `<span class="text-blue-700">${escapeHtml(match)}</span>`;
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

interface TemplateEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  className?: string;
  placeholder?: string;
}

export function TemplateEditor({ 
  value, 
  onChange, 
  readOnly = false,
  className,
  placeholder = "Enter your template..."
}: TemplateEditorProps) {
  const preRef = useRef<HTMLPreElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlighted = useMemo(() => highlightTemplate(value), [value]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    if (preRef.current) {
      preRef.current.scrollTop = e.currentTarget.scrollTop;
      preRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle Tab key for indentation
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      
      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      onChange(newValue);
      
      // Set cursor position after the inserted tab
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  }, [value, onChange]);

  // Calculate line numbers
  const lineCount = value.split('\n').length;
  const lineNumbers = Array.from({ length: Math.max(lineCount, 1) }, (_, i) => i + 1);

  return (
    <div className={`relative flex bg-gray-900 rounded-lg overflow-hidden ${className ?? ""}`}>
      {/* Line numbers */}
      <div className="flex-shrink-0 bg-gray-800 text-gray-500 text-xs font-mono select-none py-4 px-2 text-right border-r border-gray-700">
        {lineNumbers.map((num) => (
          <div key={num} className="leading-5 h-5">
            {num}
          </div>
        ))}
      </div>
      
      {/* Editor area */}
      <div className="relative flex-1 min-h-0">
        <pre
          ref={preRef}
          className="absolute inset-0 whitespace-pre-wrap break-words p-4 overflow-auto text-gray-100 text-sm font-mono leading-5"
          style={{ tabSize: 2 }}
          dangerouslySetInnerHTML={{ __html: highlighted || `<span class="text-gray-500">${escapeHtml(placeholder)}</span>` }}
        />
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          readOnly={readOnly}
          spellCheck={false}
          placeholder=""
          className="absolute inset-0 w-full h-full resize-none bg-transparent text-transparent caret-white p-4 outline-none font-mono text-sm leading-5"
          style={{ tabSize: 2 }}
          aria-label="Template editor"
        />
      </div>
    </div>
  );
}

// Read-only viewer version
export function TemplateViewer({ 
  value, 
  className 
}: { 
  value: string; 
  className?: string;
}) {
  const highlighted = useMemo(() => highlightTemplate(value), [value]);
  
  // Calculate line numbers
  const lineCount = value.split('\n').length;
  const lineNumbers = Array.from({ length: Math.max(lineCount, 1) }, (_, i) => i + 1);

  return (
    <div className={`flex bg-gray-900 rounded-lg overflow-hidden ${className ?? ""}`}>
      {/* Line numbers */}
      <div className="flex-shrink-0 bg-gray-800 text-gray-500 text-xs font-mono select-none py-4 px-2 text-right border-r border-gray-700">
        {lineNumbers.map((num) => (
          <div key={num} className="leading-5 h-5">
            {num}
          </div>
        ))}
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <pre
          className="whitespace-pre-wrap break-words text-gray-100 text-sm font-mono leading-5"
          style={{ tabSize: 2 }}
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </div>
    </div>
  );
}
