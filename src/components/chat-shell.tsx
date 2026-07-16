"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
import { GrokLogo } from "@/components/grok-logo";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import type { ChatSession } from "@/lib/types";

// Client shell for the home and chat pages. Lives under a server layout so
// the initial session list can be SSR'd; the shell itself keeps Sidebar
// mounted across navigations (no list refetch, no loading flash, collapsed
// state survives route changes).
export function ChatShell({
  children,
  initialSessions,
}: Readonly<{
  children: React.ReactNode;
  initialSessions: ChatSession[];
}>) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const router = useRouter();
  const closeMobileSidebar = useCallback(() => setMobileSidebarOpen(false), []);
  const toggleSidebar = useCallback(
    () => setSidebarCollapsed((prev) => !prev),
    []
  );
  const handleNewChat = useCallback(() => router.push("/"), [router]);

  useKeyboardShortcuts({
    onNewChat: handleNewChat,
  });

  return (
    <div className="flex h-full min-w-0">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={closeMobileSidebar}
        initialSessions={initialSessions}
      />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar onNewChat={handleNewChat} />
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

        {children}
      </main>
    </div>
  );
}
