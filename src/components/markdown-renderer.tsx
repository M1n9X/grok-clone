"use client";

import dynamic from "next/dynamic";
import remarkGfm from "remark-gfm";

const ReactMarkdownLazy = dynamic(() => import("react-markdown").then((mod) => mod.default), {
  ssr: false,
  loading: () => null,
});

function MarkdownRenderer({ children }: { children: string }) {
  return <ReactMarkdownLazy remarkPlugins={[remarkGfm]}>{children}</ReactMarkdownLazy>;
}

export { MarkdownRenderer };
