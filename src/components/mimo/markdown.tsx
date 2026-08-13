"use client";

import { memo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface MarkdownProps {
  content: string;
  className?: string;
}

interface CodeBlock {
  lang: string;
  code: string;
}

function parseContent(content: string): Array<{ type: "text" | "code"; content: string; lang?: string }> {
  const parts: Array<{ type: "text" | "code"; content: string; lang?: string }> = [];
  const codeBlockRegex = /```(\w+)?\s*\n([\s\S]*?)\n```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Text before code block
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index);
      if (text.trim()) {
        parts.push({ type: "text", content: text });
      }
    }
    // Code block
    parts.push({
      type: "code",
      content: match[2],
      lang: match[1] || "text",
    });
    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < content.length) {
    const text = content.slice(lastIndex);
    if (text.trim()) {
      parts.push({ type: "text", content: text });
    }
  }

  return parts.length === 0 ? [{ type: "text", content }] : parts;
}

function renderText(text: string): React.ReactNode {
  // Split by lines and render with line breaks
  const lines = text.split("\n");
  return lines.map((line, i) => {
    // Inline code
    const inlineCodeRegex = /`([^`]+)`/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;

    while ((match = inlineCodeRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }
      parts.push(
        <code
          key={`ic-${i}-${key++}`}
          className="px-1 py-0.5 rounded bg-muted text-violet-500 text-[0.85em] font-mono"
        >
          {match[1]}
        </code>
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }

    // Bold
    const boldRegex = /\*\*([^*]+)\*\*/g;
    const processedParts: React.ReactNode[] = [];
    let boldLastIndex = 0;
    let boldMatch: RegExpExecArray | null;
    let boldKey = 0;
    const lineContent = parts.length === 0 ? line : parts;

    if (typeof lineContent === "string") {
      while ((boldMatch = boldRegex.exec(lineContent)) !== null) {
        if (boldMatch.index > boldLastIndex) {
          processedParts.push(lineContent.slice(boldLastIndex, boldMatch.index));
        }
        processedParts.push(
          <strong key={`b-${i}-${boldKey++}`} className="font-semibold">
            {boldMatch[1]}
          </strong>
        );
        boldLastIndex = boldMatch.index + boldMatch[0].length;
      }
      if (boldLastIndex < lineContent.length) {
        processedParts.push(lineContent.slice(boldLastIndex));
      }
    } else {
      processedParts.push(lineContent);
    }

    return (
      <span key={`l-${i}`}>
        {processedParts.length === 0 ? line : processedParts}
        {i < lines.length - 1 && <br />}
      </span>
    );
  });
}

function CodeBlockView({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-border bg-zinc-950">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-border">
        <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
          {lang}
        </span>
        <button
          onClick={copy}
          className="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3" />
              copied
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              copy
            </>
          )}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-xs leading-relaxed">
        <code className="font-mono text-zinc-100">{code}</code>
      </pre>
    </div>
  );
}

export const Markdown = memo(function Markdown({ content, className }: MarkdownProps) {
  const parts = parseContent(content);

  return (
    <div className={cn("break-words", className)}>
      {parts.map((part, i) => {
        if (part.type === "code") {
          return <CodeBlockView key={i} code={part.content} lang={part.lang || "text"} />;
        }
        return (
          <div key={i} className="text-sm leading-relaxed">
            {renderText(part.content)}
          </div>
        );
      })}
    </div>
  );
});
