"use client";

import {
  Lightbulb,
  Code2,
  BookOpen,
  Globe,
  PenLine,
  TrendingUp,
} from "lucide-react";

const SUGGESTIONS = [
  {
    icon: Globe,
    text: "Search the latest AI news today",
    description: "Web search",
    webSearch: true,
  },
  {
    icon: Code2,
    text: "Write a Python script to scrape a website",
    description: "Coding",
  },
  {
    icon: BookOpen,
    text: "Explain quantum computing in simple terms",
    description: "Learning",
  },
  {
    icon: PenLine,
    text: "Draft a professional email for a meeting",
    description: "Writing",
  },
  {
    icon: TrendingUp,
    text: "Analyze the pros and cons of remote work",
    description: "Analysis",
  },
  {
    icon: Lightbulb,
    text: "Brainstorm creative names for a startup",
    description: "Ideas",
  },
];

interface PromptSuggestionsProps {
  onSelect: (
    text: string,
    options?: { model?: string; webSearch?: boolean; xSearch?: boolean }
  ) => void;
}

export function PromptSuggestions({ onSelect }: PromptSuggestionsProps) {
  return (
    <div className="mx-auto mt-6 grid w-full max-w-3xl grid-cols-2 gap-2 px-3 sm:grid-cols-3 sm:px-4">
      {SUGGESTIONS.map(({ icon: Icon, text, description, webSearch = false }) => (
        <button
          key={text}
          onClick={() => onSelect(text, { webSearch })}
          className="group flex flex-col items-start gap-2 rounded-xl border border-border bg-background p-3 text-left transition-colors hover:bg-muted"
        >
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
          <span className="line-clamp-2 text-xs text-foreground">{text}</span>
          <span className="text-[10px] text-muted-foreground">
            {description}
          </span>
        </button>
      ))}
    </div>
  );
}
