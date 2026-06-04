export interface Citation {
  index: number;
  url: string;
  title: string;
  domain: string;
  description?: string;
}

export type ChatStreamEvent =
  | { type: "status"; label: string }
  | { type: "thinking"; delta: string }
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; input?: string }
  | { type: "citations"; citations: Citation[] }
  | {
      type: "usage";
      inputTokens?: number;
      outputTokens?: number;
      reasoningTokens?: number;
      totalTokens?: number;
    }
  | { type: "error"; message: string }
  | { type: "done" };

type UnknownRecord = Record<string, unknown>;
type ReasoningEffort = "none" | "low" | "medium" | "high";

export const THINKING_SUMMARY_INSTRUCTION =
  "Before the final answer, provide a concise reasoning summary inside <thinking_summary>...</thinking_summary>. Summarize the approach, searches, and checks without exposing private chain-of-thought.";

export interface BuildModelRequestOptions {
  baseURL: string;
  model: string;
  messages: { role: string; content: string }[];
  reasoningEffort: ReasoningEffort;
  webSearch: boolean;
  xSearch: boolean;
  forceResponsesApi?: boolean;
}

export interface BuiltModelRequest {
  url: string;
  useResponsesApi: boolean;
  body: UnknownRecord;
}

export function encodeStreamEvent(event: ChatStreamEvent) {
  return `${JSON.stringify(event)}\n`;
}

export function decodeStreamEventLine(line: string): ChatStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as ChatStreamEvent;
  } catch {
    return null;
  }
}

export function buildModelRequest({
  baseURL,
  model,
  messages,
  reasoningEffort,
  webSearch,
  xSearch,
  forceResponsesApi,
}: BuildModelRequestOptions): BuiltModelRequest {
  const normalizedBaseURL = baseURL.replace(/\/$/, "");
  const baseIsResponses = normalizedBaseURL.endsWith("/responses");
  const baseIsChatCompletions = normalizedBaseURL.endsWith("/chat/completions");
  const useResponsesApi =
    forceResponsesApi === true ||
    (forceResponsesApi !== false &&
      model.startsWith("grok-") &&
      !baseIsChatCompletions);

  const includeReasoning = reasoningEffort !== "none";
  const processedMessages = includeReasoning
    ? withThinkingSummaryInstruction(messages)
    : messages;

  if (useResponsesApi) {
    const tools = [
      ...(webSearch ? [{ type: "web_search" }] : []),
      ...(xSearch ? [{ type: "x_search" }] : []),
    ];

    return {
      url: baseIsResponses ? normalizedBaseURL : `${normalizedBaseURL}/responses`,
      useResponsesApi: true,
      body: {
        model,
        input: processedMessages,
        stream: true,
        ...(includeReasoning
          ? { reasoning: { effort: reasoningEffort } }
          : {}),
        store: false,
        ...(tools.length > 0 ? { tools } : {}),
      },
    };
  }

  const tools = xSearch ? [{ type: "x_search" }] : [];
  return {
    url: baseIsChatCompletions
      ? normalizedBaseURL
      : `${normalizedBaseURL}/chat/completions`,
    useResponsesApi: false,
    body: {
      model,
      messages: processedMessages,
      stream: true,
      ...(includeReasoning ? { reasoning_effort: reasoningEffort } : {}),
      ...(tools.length > 0 ? { tools } : {}),
    },
  };
}

export function parseTaggedThinkingSummary(rawText: string) {
  const openTag = "<thinking_summary>";
  const closeTag = "</thinking_summary>";
  const start = rawText.indexOf(openTag);

  if (start === -1) {
    return {
      content: stripDanglingTagPrefix(rawText, openTag),
      thinking: "",
      open: false,
    };
  }

  const summaryStart = start + openTag.length;
  const end = rawText.indexOf(closeTag, summaryStart);
  if (end === -1) {
    return {
      content: rawText.slice(0, start),
      thinking: rawText.slice(summaryStart),
      open: true,
    };
  }

  return {
    content: `${rawText.slice(0, start)}${rawText.slice(end + closeTag.length)}`,
    thinking: rawText.slice(summaryStart, end),
    open: false,
  };
}

export function extractChatCompletionEvents(payload: UnknownRecord) {
  const events: ChatStreamEvent[] = [];

  const error = extractErrorMessage(payload);
  if (error) {
    events.push({ type: "error", message: error });
    return events;
  }

  const choice = Array.isArray(payload.choices)
    ? (payload.choices[0] as UnknownRecord | undefined)
    : undefined;
  const delta = choice?.delta as UnknownRecord | undefined;

  const reasoning = firstString(
    delta?.reasoning_content,
    delta?.reasoning,
    delta?.reasoning_summary
  );
  if (reasoning) events.push({ type: "thinking", delta: reasoning });

  const content = firstString(delta?.content);
  if (content) events.push({ type: "text", delta: content });

  const toolCalls = Array.isArray(delta?.tool_calls) ? delta.tool_calls : [];
  for (const call of toolCalls) {
    const fn = (call as UnknownRecord).function as UnknownRecord | undefined;
    const name = firstString(fn?.name, (call as UnknownRecord).type);
    if (name) {
      events.push({
        type: "tool",
        name,
        input: firstString(fn?.arguments),
      });
    }
  }

  const usage = payload.usage as UnknownRecord | undefined;
  const usageEvent = extractUsageEvent(usage);
  if (usageEvent) events.push(usageEvent);

  return events;
}

export function extractResponsesApiEvents(payload: UnknownRecord) {
  const events: ChatStreamEvent[] = [];

  const error = extractErrorMessage(payload);
  if (error) {
    events.push({ type: "error", message: error });
    return events;
  }

  const eventType = firstString(payload.type);
  const delta = firstString(payload.delta);

  if (eventType === "response.reasoning_summary_text.delta" && delta) {
    events.push({ type: "thinking", delta });
  }

  if (eventType === "response.output_text.delta" && delta) {
    events.push({ type: "text", delta });
  }

  if (eventType === "response.output_item.added") {
    const item = payload.item as UnknownRecord | undefined;
    const itemType = firstString(item?.type);
    if (itemType?.includes("search")) {
      events.push({ type: "tool", name: readableToolName(itemType) });
      const citations = extractCitationsFromSearchItem(item);
      if (citations.length > 0) {
        events.push({ type: "citations", citations });
      }
    }
  }

  if (eventType === "response.output_item.done") {
    const item = payload.item as UnknownRecord | undefined;
    const itemType = firstString(item?.type);
    if (itemType?.includes("search")) {
      const citations = extractCitationsFromSearchItem(item);
      if (citations.length > 0) {
        events.push({ type: "citations", citations });
      }
    }
  }

  if (eventType === "response.completed") {
    const response = payload.response as UnknownRecord | undefined;
    const usageEvent = extractUsageEvent(response?.usage as UnknownRecord);
    if (usageEvent) events.push(usageEvent);
    events.push({ type: "done" });
  }

  return events;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function extractErrorMessage(payload: UnknownRecord) {
  const error = payload.error;
  if (!error) return undefined;
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    return firstString((error as UnknownRecord).message, (error as UnknownRecord).type);
  }
  return "Stream error";
}

function extractUsageEvent(usage?: UnknownRecord): ChatStreamEvent | null {
  if (!usage) return null;

  const inputTokens = firstNumber(usage.input_tokens, usage.prompt_tokens);
  const outputTokens = firstNumber(usage.output_tokens, usage.completion_tokens);
  const totalTokens = firstNumber(usage.total_tokens);
  const details = usage.output_tokens_details as UnknownRecord | undefined;
  const completionDetails =
    usage.completion_tokens_details as UnknownRecord | undefined;
  const reasoningTokens = firstNumber(
    usage.reasoning_tokens,
    details?.reasoning_tokens,
    completionDetails?.reasoning_tokens
  );

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    totalTokens === undefined &&
    reasoningTokens === undefined
  ) {
    return null;
  }

  return omitUndefined({
    type: "usage",
    inputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
  }) as ChatStreamEvent;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function readableToolName(type: string) {
  if (type === "web_search_call") return "Web Search";
  if (type === "x_search_call") return "X Search";
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function withThinkingSummaryInstruction(
  messages: { role: string; content: string }[]
) {
  const [first, ...rest] = messages;
  if (first?.role === "system") {
    return [
      {
        ...first,
        content: `${first.content}\n\n${THINKING_SUMMARY_INSTRUCTION}`,
      },
      ...rest,
    ];
  }

  return [
    {
      role: "system",
      content: THINKING_SUMMARY_INSTRUCTION,
    },
    ...messages,
  ];
}

function stripDanglingTagPrefix(rawText: string, tag: string) {
  for (let length = Math.min(tag.length - 1, rawText.length); length > 0; length--) {
    if (tag.startsWith(rawText.slice(-length))) {
      return rawText.slice(0, -length);
    }
  }
  return rawText;
}

function omitUndefined(record: UnknownRecord) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  );
}

function extractCitationsFromSearchItem(item: UnknownRecord | undefined): Citation[] {
  if (!item) return [];

  const results = item.results ?? item.search_results ?? item.entries ?? item.sources;
  if (!Array.isArray(results)) return [];

  const citations: Citation[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i] as UnknownRecord;
    const url = firstString(r.url, r.link);
    if (!url) continue;
    const title = firstString(r.title, r.name) ?? extractDomain(url);
    citations.push({
      index: i + 1,
      url,
      title,
      domain: extractDomain(url),
      description: firstString(r.snippet, r.description, r.summary),
    });
  }
  return citations;
}

export function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function extractCitationsFromText(text: string): Citation[] {
  const citations: Citation[] = [];
  const seen = new Set<string>();

  // Matches [[n]](url) (double-bracket) and [n](url) / [text](url) (single-bracket).
  // Capture groups: [1] = inner text of [[...]], [2] = text of [...], [3] = URL
  const pattern = /\[(?:\[([^\]]+)\]|([^\]]+))\]\((https?:\/\/[^\s)]+)\)/g;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const url = match[3];
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const linkText = match[1] ?? match[2] ?? "";
    const isCitationStyle = /^\d+$/.test(linkText);

    let title: string;
    if (isCitationStyle) {
      const contextAfter = text.slice(match.index + match[0].length).trim();
      const titleMatch = contextAfter.match(/^["""]([^"""\n]{3,80})["""]/);
      if (titleMatch) {
        title = titleMatch[1]!;
      } else {
        title = extractDomain(url);
      }
    } else {
      title = linkText;
    }

    const descriptionMatch = text
      .slice(match.index + match[0].length)
      .match(/^[.:;]?\s*([^\n]{10,200}?)(?:\n\n|\.\s|\.$|$)/);

    citations.push({
      index: citations.length + 1,
      url,
      title,
      domain: extractDomain(url),
      description: descriptionMatch?.[1]?.trim(),
    });
  }

  return citations;
}
