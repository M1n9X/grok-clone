import { getSessions } from "@/lib/db/queries";
import { ChatShell } from "@/components/chat-shell";

export default async function ChatLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Fail open with an empty list so a transient DB blip does not blank the
  // whole chat shell; the client sidebar can still refresh later.
  let initialSessions: Awaited<ReturnType<typeof getSessions>> = [];
  try {
    initialSessions = await getSessions();
  } catch {
    initialSessions = [];
  }

  return (
    <ChatShell initialSessions={initialSessions}>{children}</ChatShell>
  );
}
