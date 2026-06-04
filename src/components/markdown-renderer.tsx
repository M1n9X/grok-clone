"use client";

import dynamic from "next/dynamic";
import remarkGfm from "remark-gfm";
import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";

const ReactMarkdownLazy = dynamic(
  () => import("react-markdown").then((mod) => mod.default),
  { ssr: false, loading: () => null }
);

const SyntaxHighlighterLazy = dynamic(
  () =>
    import("react-syntax-highlighter/dist/esm/prism").then(
      (mod) => mod.default
    ),
  { ssr: false, loading: () => null }
);

import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

function CodeBlock({
  language,
  code,
}: {
  language: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const displayLang = language || "text";

  return (
    <div className="group/code relative">
      <div className="flex items-center justify-between rounded-t-xl border border-b-0 border-border bg-[#282c34] px-4 py-1.5">
        <span className="text-xs text-gray-400">{displayLang}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-gray-400 transition-colors hover:text-white"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <SyntaxHighlighterLazy
        language={language || "text"}
        style={oneDark}
        customStyle={{
          margin: 0,
          borderRadius: "0 0 0.75rem 0.75rem",
          border: "1px solid var(--border, #2a2a2a)",
          borderTop: "none",
          padding: "1rem",
          fontSize: "0.875rem",
          background: "#282c34",
        }}
        wrapLongLines
      >
        {code}
      </SyntaxHighlighterLazy>
    </div>
  );
}

function MarkdownRenderer({ children }: { children: string }) {
  return (
    <ReactMarkdownLazy
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...rest }) {
          const match = /language-(\w+)/.exec(className || "");
          const codeString = String(children).replace(/\n$/, "");

          if (match) {
            return <CodeBlock language={match[1]} code={codeString} />;
          }

          return (
            <code className={className} {...rest}>
              {children}
            </code>
          );
        },
        pre({ children }) {
          return <>{children}</>;
        },
      }}
    >
      {children}
    </ReactMarkdownLazy>
  );
}

export { MarkdownRenderer };
