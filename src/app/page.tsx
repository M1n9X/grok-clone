"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { ChatInput } from "@/components/chat-input";
import { GrokLogo } from "@/components/grok-logo";

export default function HomePage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const router = useRouter();

  async function handleSend(
    content: string,
    model: string = "auto",
    webSearch: boolean = false,
    xSearch: boolean = false
  ) {
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
    }
  }

  return (
    <div className="flex h-full">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <main className="flex flex-1 flex-col items-center justify-center overflow-hidden">
        <GrokLogo className="mb-8 h-12 w-auto text-foreground" />

        <div className="w-full max-w-3xl px-4">
          <ChatInput
            onSend={handleSend}
            isLoading={false}
            onStop={() => {}}
          />
        </div>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          Grok can make mistakes. Verify important information.
        </p>
      </main>
    </div>
  );
}
