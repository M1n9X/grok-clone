"use client";

import dynamic from "next/dynamic";
import remarkGfm from "remark-gfm";
import { useState, useCallback, useMemo, memo, type ReactNode } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";
import { type Citation, extractDomain } from "@/lib/chat-stream-events";

const REMARK_PLUGINS = [remarkGfm];

const ReactMarkdownLazy = dynamic(
  () => import("react-markdown").then((mod) => mod.default),
  { ssr: false, loading: () => null }
);

const SyntaxHighlighterWithTheme = dynamic(
  async () => {
    const [{ default: SyntaxHighlighter }, { oneDark }] = await Promise.all([
      import("react-syntax-highlighter/dist/esm/prism"),
      import("react-syntax-highlighter/dist/esm/styles/prism"),
    ]);
    function StyledHighlighter({
      language,
      children,
    }: {
      language: string;
      children: string;
    }) {
      return (
        <SyntaxHighlighter
          language={language}
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
          {children}
        </SyntaxHighlighter>
      );
    }
    return StyledHighlighter;
  },
  {
    ssr: false,
    loading: () => (
      <pre className="rounded-b-xl border border-t-0 border-border bg-[#282c34] p-4 text-sm text-gray-300">
        <code />
      </pre>
    ),
  }
);

const CodeBlock = memo(function CodeBlock({
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
      <SyntaxHighlighterWithTheme language={language || "text"}>
        {code}
      </SyntaxHighlighterWithTheme>
    </div>
  );
});

function CitationLink({
  href,
  citation,
}: {
  href: string;
  citation: Citation | undefined;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const title = citation?.title ?? citation?.domain ?? extractDomain(href);
  const domain = citation?.domain ?? extractDomain(href);

  return (
    <span
      className="citation-wrapper relative inline-block align-baseline"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="citation-chip inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-xs font-medium no-underline transition-colors hover:bg-muted"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
          alt=""
          className="h-3 w-3 rounded-[2px]"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <span className="max-w-[120px] truncate text-foreground/80">
          {title}
        </span>
      </a>

      {showTooltip && (
        <div className="citation-tooltip absolute bottom-full left-0 z-50 mb-2 w-72 rounded-xl border border-border bg-popover p-3 shadow-xl">
          <div className="flex items-center gap-1.5">
            <img
              src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
              alt=""
              className="h-3.5 w-3.5 rounded-sm"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <span className="text-xs text-muted-foreground">{domain}</span>
          </div>
          <div className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug text-foreground">
            {citation?.title ?? title}
          </div>
          {citation?.description && (
            <div className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
              {citation.description}
            </div>
          )}
          <div className="mt-2 flex items-center gap-1 truncate text-[10px] text-muted-foreground/70">
            <ExternalLink className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{href}</span>
          </div>
        </div>
      )}
    </span>
  );
}

function extractText(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (!children) return "";
  if (Array.isArray(children)) return children.map(extractText).join("");
  if (typeof children === "object" && children !== null && "props" in children)
    return extractText((children as { props: { children?: ReactNode } }).props.children);
  return "";
}

const MarkdownRenderer = memo(function MarkdownRenderer({
  children,
  citations,
}: {
  children: string;
  citations?: Citation[];
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const components = useMemo((): any => {
    return {
      code({ className, children, ...rest }: any) {
        const match = /language-(\w+)/.exec(className || "");
        const codeString = String(children).replace(/\n$/, "");

        if (match) {
          return <CodeBlock language={match[1]!} code={codeString} />;
        }

        return (
          <code className={className} {...rest}>
            {children}
          </code>
        );
      },
      pre({ children }: any) {
        return <>{children}</>;
      },
      a({ href, children }: any) {
        if (!href) return <span>{children}</span>;

        const text = extractText(children).trim();
        const isCitation = /^\[?\d+\]?$/.test(text);

        if (isCitation && citations && citations.length > 0) {
          const citation = citations.find((c: Citation) => c.url === href);
          return <CitationLink href={href} citation={citation} />;
        }

        return (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        );
      },
    };
  }, [citations]);

  return (
    <ReactMarkdownLazy remarkPlugins={REMARK_PLUGINS} components={components}>
      {children}
    </ReactMarkdownLazy>
  );
});

export { MarkdownRenderer };
