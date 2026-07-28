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
  | {
      type: "incomplete";
      reason: string;
      message?: string;
    }
  | { type: "error"; message: string }
  | { type: "done" };

type UnknownRecord = Record<string, unknown>;
type ReasoningEffort = "none" | "low" | "medium" | "high";

/** Default output budget for reasoning models (reasoning tokens count against this). */
export const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;

export const THINKING_SUMMARY_INSTRUCTION =
  "Before the final answer, provide a concise reasoning summary inside <thinking_summary>...</thinking_summary>. Summarize the approach, searches, and checks without exposing private chain-of-thought. Keep the summary brief — the final answer must be complete and self-contained.";

export const SEARCH_TOOLS_AVAILABLE_INSTRUCTION =
  "You have live search tools available for this request. For current events, benchmarks, prices, releases, or anything time-sensitive you MUST actually invoke the search tools before answering. Never end the response by only promising to search, announcing that you are searching, or listing planned queries — produce the full answer after tools run.";

export const SEARCH_TOOLS_UNAVAILABLE_INSTRUCTION =
  "You cannot perform live web or X search in this environment. Never say you will search, are searching, or will look something up online. Immediately provide the fullest useful answer from your knowledge, and clearly mark uncertainty about very recent events.";

export const SEARCH_CONTINUATION_INSTRUCTION =
  "Your previous reply only announced a search or planned next steps and did not deliver the requested answer. Live search tools did not run for that turn. Now provide a complete answer from your best available knowledge. Do not announce further searches. Clearly mark uncertainty about very recent events.";

export interface BuildModelRequestOptions {
  baseURL: string;
  model: string;
  messages: { role: string; content: string }[];
  reasoningEffort: ReasoningEffort;
  webSearch: boolean;
  xSearch: boolean;
  forceResponsesApi?: boolean;
  /** Override default max output tokens (reasoning counts against this). */
  maxOutputTokens?: number;
}

export interface BuiltModelRequest {
  url: string;
  useResponsesApi: boolean;
  body: UnknownRecord;
}

export interface StreamPipeStats {
  textChars: number;
  thinkingChars: number;
  toolCalls: number;
  incompleteReason?: string;
  finishReason?: string;
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
  maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
}: BuildModelRequestOptions): BuiltModelRequest {
  const normalizedBaseURL = baseURL.replace(/\/$/, "");
  const baseIsResponses = normalizedBaseURL.endsWith("/responses");
  const baseIsChatCompletions = normalizedBaseURL.endsWith("/chat/completions");
  const useResponsesApi =
    forceResponsesApi === true ||
    (forceResponsesApi !== false &&
      model.startsWith("grok-") &&
      !baseIsChatCompletions);

  const toolsRequested = webSearch || xSearch;
  const includeReasoning = reasoningEffort !== "none";
  const processedMessages = withSystemInstructions(messages, {
    includeThinkingSummary: includeReasoning,
    toolsRequested,
  });

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
        max_output_tokens: maxOutputTokens,
        ...(includeReasoning
          ? { reasoning: { effort: reasoningEffort } }
          : {}),
        store: false,
        ...(tools.length > 0 ? { tools } : {}),
      },
    };
  }

  const tools = [
    ...(webSearch ? [{ type: "web_search" }] : []),
    ...(xSearch ? [{ type: "x_search" }] : []),
  ];
  return {
    url: baseIsChatCompletions
      ? normalizedBaseURL
      : `${normalizedBaseURL}/chat/completions`,
    useResponsesApi: false,
    body: {
      model,
      messages: processedMessages,
      stream: true,
      max_tokens: maxOutputTokens,
      ...(includeReasoning ? { reasoning_effort: reasoningEffort } : {}),
      ...(tools.length > 0 ? { tools } : {}),
    },
  };
}

/**
 * Detect replies that only announce a search / plan next steps without
 * delivering the actual answer — a common failure mode when server-side
 * search tools are advertised but not executed by the upstream provider.
 */
export function looksLikeSearchPrelude(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.length > 900) return false;

  const lower = trimmed.toLowerCase();
  const announcePatterns = [
    /正在(联网)?(搜索|检索|查找|查询)/,
    /联网(搜索|检索)/,
    /我会先/,
    /让我先?(搜索|检索|查找|查一下|看看)/,
    /先进行多组?关键词/,
    /先(确认|检索|搜索|查找)/,
    /查(询|找|一下).*(最新|信息|测评|benchmark)/i,
    /i('|\s)?ll (search|look up|check|find|retrieve)/i,
    /i am (now )?(searching|looking up|checking|retrieving)/i,
    /let me (search|look up|check|find|retrieve)/i,
    /searching (the )?(web|online|for)/i,
    /looking up .{0,40}(for you|online|now)/i,
    /i('|\s)?ll (use|run|call) .*(search|tool)/i,
  ];
  const hasAnnounce = announcePatterns.some((re) => re.test(lower) || re.test(trimmed));
  if (!hasAnnounce) return false;

  // Short + announces search → almost certainly a prelude.
  if (trimmed.length < 350) return true;

  // Medium length but still mostly planning language, little substance.
  const substanceHints =
    /(benchmark|评测|分数|得分|leaderboard|结果|根据|目前|具体|数据|source|http|\[\d+\])/i;
  return !substanceHints.test(trimmed);
}

export function messageRequestsLiveSearch(text: string): boolean {
  return /联网搜索|上网(查|搜)|实时搜索|搜索一下|查一下最新|look\s*up|search\s+(the\s+)?(web|online|internet)|google\s+it|latest\s+(news|benchmark|eval)/i.test(
    text
  );
}

export function shouldContinueAfterSearchMiss({
  webSearch,
  xSearch,
  toolCalls,
  text,
  userMessage,
}: {
  webSearch: boolean;
  xSearch: boolean;
  toolCalls: number;
  text: string;
  userMessage?: string;
}): boolean {
  if (toolCalls > 0) return false;
  const searchExpected =
    webSearch || xSearch || (userMessage ? messageRequestsLiveSearch(userMessage) : false);
  if (!searchExpected) return false;
  return looksLikeSearchPrelude(text);
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

  const finishReason = firstString(choice?.finish_reason);
  if (finishReason === "length") {
    events.push({
      type: "incomplete",
      reason: "max_output_tokens",
      message:
        "Response was cut off because the output token limit was reached.",
    });
  } else if (finishReason && finishReason !== "stop" && finishReason !== "tool_calls") {
    events.push({
      type: "incomplete",
      reason: finishReason,
      message: `Response finished early (${finishReason}).`,
    });
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

  // grok-4.5 streams both raw reasoning text and a summarized form.
  if (
    (eventType === "response.reasoning_summary_text.delta" ||
      eventType === "response.reasoning_text.delta") &&
    delta
  ) {
    events.push({ type: "thinking", delta });
  }

  if (eventType === "response.output_text.delta" && delta) {
    events.push({ type: "text", delta });
  }

  if (eventType === "response.output_item.added") {
    const item = payload.item as UnknownRecord | undefined;
    const itemType = firstString(item?.type);
    if (itemType?.includes("search") || itemType === "web_search_call" || itemType === "x_search_call") {
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
    if (itemType?.includes("search") || itemType === "web_search_call" || itemType === "x_search_call") {
      const citations = extractCitationsFromSearchItem(item);
      if (citations.length > 0) {
        events.push({ type: "citations", citations });
      }
    }
  }

  if (eventType === "response.incomplete" || eventType === "response.failed") {
    const response = payload.response as UnknownRecord | undefined;
    const incomplete = (response?.incomplete_details ??
      payload.incomplete_details) as UnknownRecord | undefined;
    const reason =
      firstString(
        incomplete?.reason,
        response?.status,
        eventType === "response.failed" ? "failed" : "incomplete"
      ) ?? "incomplete";
    const providerMessage = firstString(
      extractErrorMessage(response ?? {}),
      extractErrorMessage(payload)
    );
    const message =
      providerMessage ??
      (reason === "max_output_tokens"
        ? "Response was cut off because the output token limit was reached."
        : `Response ended incompletely (${reason}).`);
    const usageEvent = extractUsageEvent(response?.usage as UnknownRecord);
    if (usageEvent) events.push(usageEvent);
    events.push({ type: "incomplete", reason, message });
    return events;
  }

  if (eventType === "response.completed") {
    const response = payload.response as UnknownRecord | undefined;
    const usageEvent = extractUsageEvent(response?.usage as UnknownRecord);
    if (usageEvent) events.push(usageEvent);

    const status = firstString(response?.status);
    if (status === "incomplete") {
      const incomplete = response?.incomplete_details as UnknownRecord | undefined;
      const reason = firstString(incomplete?.reason) ?? "incomplete";
      events.push({
        type: "incomplete",
        reason,
        message:
          reason === "max_output_tokens"
            ? "Response was cut off because the output token limit was reached."
            : `Response ended incompletely (${reason}).`,
      });
    }
    // Terminal done is emitted by the route after the upstream stream ends so
    // multi-pass continuations can keep the client stream open.
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

function withSystemInstructions(
  messages: { role: string; content: string }[],
  {
    includeThinkingSummary,
    toolsRequested,
  }: {
    includeThinkingSummary: boolean;
    toolsRequested: boolean;
  }
) {
  const parts: string[] = [];
  if (includeThinkingSummary) parts.push(THINKING_SUMMARY_INSTRUCTION);
  parts.push(
    toolsRequested
      ? SEARCH_TOOLS_AVAILABLE_INSTRUCTION
      : SEARCH_TOOLS_UNAVAILABLE_INSTRUCTION
  );
  const instruction = parts.join("\n\n");

  const [first, ...rest] = messages;
  if (first?.role === "system") {
    return [
      {
        ...first,
        content: `${first.content}\n\n${instruction}`,
      },
      ...rest,
    ];
  }

  return [
    {
      role: "system",
      content: instruction,
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

  const results =
    item.results ??
    item.search_results ??
    item.entries ??
    item.sources ??
    item.references ??
    item.web_results ??
    item.citations;
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

export function injectCitationLinks(text: string, citations: Citation[]): string {
  if (citations.length === 0) return text;
  const byIndex = new Map(citations.map((c) => [c.index, c]));
  return text.replace(
    /(?<!\[)(?<!\w)\[(\d+)\](?!\()/g,
    (match, num) => {
      const c = byIndex.get(Number(num));
      return c ? `[${num}](${c.url})` : match;
    }
  );
}

export function extractCitationsFromText(text: string): Citation[] {
  const citations: Citation[] = [];
  const seen = new Set<string>();

  // 1. Inline links: [[n]](url) (double-bracket) and [n](url) / [text](url)
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

  // 2. Footnote-style references: lines like "[1] https://..." or "1. https://..."
  if (citations.length === 0) {
    const footnotePattern =
      /^(?:\[(\d+)\]|(\d+)[.):])\s*(https?:\/\/[^\s]+)(?:[ \t]+(.+))?$/gm;
    let fnMatch;
    while ((fnMatch = footnotePattern.exec(text)) !== null) {
      const idx = Number(fnMatch[1] ?? fnMatch[2]);
      const url = fnMatch[3]!;
      if (seen.has(url)) continue;
      seen.add(url);
      citations.push({
        index: idx,
        url,
        title: fnMatch[4]?.trim() || extractDomain(url),
        domain: extractDomain(url),
      });
    }
  }

  return citations;
}
