"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { ChatInput } from "@/components/chat-input";

export default function HomePage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const router = useRouter();

  async function handleSend(content: string) {
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
      // Store pending message for the chat page to pick up
      window.sessionStorage.setItem(`pending-msg-${session.id}`, content);
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
        {/* Grok-style logo */}
        <div className="mb-8">
          <svg
            className="mx-auto h-12 w-12 text-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>

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
