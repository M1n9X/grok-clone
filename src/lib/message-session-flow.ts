import { parseModelMode, type ModelMode } from "@/lib/chat-request-guard";

export interface LazySessionInsertInput {
  sessionId: string;
  userId: string;
  sessionTitle?: unknown;
  sessionModel?: unknown;
}

export interface LazySessionInsert {
  id: string;
  user_id: string;
  title: string;
  model: ModelMode;
}

export function buildLazySessionInsert({
  sessionId,
  userId,
  sessionTitle,
  sessionModel,
}: LazySessionInsertInput): LazySessionInsert | null {
  const model = parseModelMode(sessionModel);
  if (!model) return null;

  const title =
    typeof sessionTitle === "string" && sessionTitle.trim()
      ? sessionTitle.trim().slice(0, 120)
      : "New Chat";

  return {
    id: sessionId,
    user_id: userId,
    title,
    model,
  };
}

export function prepareSessionLoad({
  previousSessionId,
  nextSessionId,
}: {
  previousSessionId: string | null;
  nextSessionId: string;
}) {
  const shouldLoad = previousSessionId !== nextSessionId;
  const sessionChanged =
    previousSessionId !== null && previousSessionId !== nextSessionId;

  return {
    sessionChanged,
    shouldAbortStream: sessionChanged,
    shouldClearMessages: shouldLoad,
    historyLoading: shouldLoad,
    shouldLoad,
  };
}
