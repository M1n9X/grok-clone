"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { ChatInput } from "@/components/chat-input";
import { GrokLogo } from "@/components/grok-logo";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { PromptSuggestions } from "@/components/prompt-suggestions";
import { TopBar } from "@/components/top-bar";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

export default function HomePage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sendingMessage, setSendingMessage] = useState<string | null>(null);
  const router = useRouter();
  const closeMobileSidebar = useCallback(() => setMobileSidebarOpen(false), []);

  useKeyboardShortcuts({
    onNewChat: () => router.push("/"),
  });

  async function handleSend(
    content: string,
    model: string = "auto",
    webSearch: boolean = false,
    xSearch: boolean = false
  ) {
    // Show optimistic UI immediately
    setSendingMessage(content);

    // Create a new session and redirect
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: content.slice(0, 50) + (content.length > 50 ? "..." : ""),
      }),
    });

    if (res.ok) {
      const session = await res.json();
      // Store pending message + model for the chat page to pick up
      window.sessionStorage.setItem(
        `pending-msg-${session.id}`,
        JSON.stringify({ content, model, webSearch, xSearch })
      );
      // Flag for sidebar to refresh sessions
      window.sessionStorage.setItem("refreshSessions", "true");
      router.push(`/chat/${session.id}`);
    } else {
      setSendingMessage(null);
    }
  }

  return (
    <div className="flex h-full min-w-0">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={closeMobileSidebar}
      />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar onNewChat={() => router.push("/")} />
        <header className="flex h-14 shrink-0 items-center justify-between px-3 pt-[env(safe-area-inset-top)] md:hidden">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open sidebar"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
          >
            <PanelLeft className="h-5 w-5" />
          </button>
          <GrokLogo className="h-6 w-auto text-foreground" />
          <div className="h-10 w-10" />
        </header>

        {sendingMessage ? (
          <div className="flex min-h-0 flex-1 flex-col items-stretch px-0 pb-6">
            <div className="min-h-0 flex-1 overflow-y-auto px-4">
              <div className="mx-auto flex max-w-3xl flex-col items-start gap-4 py-6">
                <div className="flex flex-col items-end self-end">
                  <div className="max-w-[80%] rounded-2xl bg-accent px-4 py-2.5">
                    <div className="prose-chat text-sm text-foreground">
                      <MarkdownRenderer>{sendingMessage}</MarkdownRenderer>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60 opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-primary/40" />
                  </span>
                  Preparing...
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-0 pb-6">
            <GrokLogo className="mb-8 hidden h-12 w-auto text-foreground md:block" />

            <ChatInput
              onSend={handleSend}
              isLoading={false}
              onStop={() => {}}
            />

            <p className="mt-3 px-4 text-center text-xs text-muted-foreground">
              Grok can make mistakes. Verify important information.
            </p>

            <PromptSuggestions onSelect={(text) => handleSend(text)} />
          </div>
        )}
      </main>
    </div>
  );
}
