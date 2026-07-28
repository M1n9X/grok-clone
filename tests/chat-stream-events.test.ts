import assert from "node:assert/strict";
import test from "node:test";

import {
  buildModelRequest,
  decodeStreamEventLine,
  encodeStreamEvent,
  extractChatCompletionEvents,
  extractCitationsFromText,
  extractResponsesApiEvents,
  injectCitationLinks,
  looksLikeSearchPrelude,
  messageRequestsLiveSearch,
  parseTaggedThinkingSummary,
  shouldContinueAfterSearchMiss,
} from "../src/lib/chat-stream-events";

test("encodes and decodes one stream event per line", () => {
  const line = encodeStreamEvent({ type: "text", delta: "Hello" });

  assert.equal(line, '{"type":"text","delta":"Hello"}\n');
  assert.deepEqual(decodeStreamEventLine(line), {
    type: "text",
    delta: "Hello",
  });
});

test("extracts reasoning and answer deltas from xAI Responses API events", () => {
  assert.deepEqual(
    extractResponsesApiEvents({
      type: "response.reasoning_summary_text.delta",
      delta: "Checking sources...",
    }),
    [{ type: "thinking", delta: "Checking sources..." }]
  );

  assert.deepEqual(
    extractResponsesApiEvents({
      type: "response.reasoning_text.delta",
      delta: "Raw chain...",
    }),
    [{ type: "thinking", delta: "Raw chain..." }]
  );

  assert.deepEqual(
    extractResponsesApiEvents({
      type: "response.output_text.delta",
      delta: "Final answer",
    }),
    [{ type: "text", delta: "Final answer" }]
  );
});

test("surfaces response.incomplete as an incomplete stream event", () => {
  assert.deepEqual(
    extractResponsesApiEvents({
      type: "response.incomplete",
      response: {
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        usage: { input_tokens: 10, output_tokens: 100, total_tokens: 110 },
      },
    }),
    [
      {
        type: "usage",
        inputTokens: 10,
        outputTokens: 100,
        totalTokens: 110,
      },
      {
        type: "incomplete",
        reason: "max_output_tokens",
        message:
          "Response was cut off because the output token limit was reached.",
      },
    ]
  );
});

test("surfaces chat completion finish_reason=length as incomplete", () => {
  const events = extractChatCompletionEvents({
    choices: [
      {
        delta: { content: "partial" },
        finish_reason: "length",
      },
    ],
  });

  assert.deepEqual(events, [
    { type: "text", delta: "partial" },
    {
      type: "incomplete",
      reason: "max_output_tokens",
      message:
        "Response was cut off because the output token limit was reached.",
    },
  ]);
});

test("detects search-prelude only replies and live-search intent", () => {
  assert.equal(
    looksLikeSearchPrelude(
      "正在搜索 Kimi K3 开源相关的最新测评与 benchmark 信息。\n\n我会先进行多组关键词搜索，覆盖官方公告、权威机构评测和社区初步结果。"
    ),
    true
  );
  assert.equal(
    looksLikeSearchPrelude(
      "正在联网检索 Kimi K3 开源与权威机构初步测评/benchmark 信息。"
    ),
    true
  );
  assert.equal(
    looksLikeSearchPrelude(
      "I'll look up the current BTC price in USD for you."
    ),
    true
  );
  assert.equal(
    looksLikeSearchPrelude(
      "**关于 Kimi K3 的初步测评**\n\n根据公开信息，权威机构通常会覆盖 MMLU、Arena Elo 等 benchmark……"
    ),
    false
  );
  assert.equal(
    messageRequestsLiveSearch(
      "kimi k3 昨晚刚刚开源 请联网搜索一下 目前权威机构的一些初步测评"
    ),
    true
  );
  assert.equal(
    shouldContinueAfterSearchMiss({
      webSearch: true,
      xSearch: false,
      toolCalls: 0,
      text: "正在搜索相关信息，我会先检索官方公告。",
    }),
    true
  );
  assert.equal(
    shouldContinueAfterSearchMiss({
      webSearch: true,
      xSearch: false,
      toolCalls: 2,
      text: "正在搜索相关信息，我会先检索官方公告。",
    }),
    false
  );
});

test("extracts content and reasoning deltas from chat completion chunks", () => {
  const events = extractChatCompletionEvents({
    choices: [
      {
        delta: {
          reasoning_content: "Thinking...",
          content: "Visible answer",
        },
      },
    ],
  });

  assert.deepEqual(events, [
    { type: "thinking", delta: "Thinking..." },
    { type: "text", delta: "Visible answer" },
  ]);
});

test("extracts reasoning usage from common chat completion usage shapes", () => {
  const events = extractChatCompletionEvents({
    usage: {
      completion_tokens: 14020,
      total_tokens: 255953,
      completion_tokens_details: {
        reasoning_tokens: 241000,
      },
    },
  });

  assert.deepEqual(events, [
    {
      type: "usage",
      outputTokens: 14020,
      reasoningTokens: 241000,
      totalTokens: 255953,
    },
  ]);
});

test("extracts X Search tool events from Responses API stream items", () => {
  assert.deepEqual(
    extractResponsesApiEvents({
      type: "response.output_item.added",
      item: { type: "x_search_call" },
    }),
    [{ type: "tool", name: "X Search" }]
  );
});

test("builds Responses API request with optional web and X search tools", () => {
  const request = buildModelRequest({
    baseURL: "https://api.x.ai/v1",
    model: "grok-4.3",
    messages: [{ role: "user", content: "latest AI news" }],
    reasoningEffort: "high",
    webSearch: true,
    xSearch: true,
  });

  assert.equal(request.url, "https://api.x.ai/v1/responses");
  assert.equal(request.useResponsesApi, true);
  assert.deepEqual(request.body.tools, [
    { type: "web_search" },
    { type: "x_search" },
  ]);
});

test("builds third-party chat completion request with X Search tool", () => {
  const request = buildModelRequest({
    baseURL: "https://jiuuij.de5.net/v1/chat/completions",
    model: "grok-4.3-high",
    messages: [{ role: "user", content: "X上关于AI的最新讨论" }],
    reasoningEffort: "high",
    webSearch: false,
    xSearch: true,
  });

  assert.equal(request.url, "https://jiuuij.de5.net/v1/chat/completions");
  assert.equal(request.useResponsesApi, false);
  assert.deepEqual(request.body.tools, [{ type: "x_search" }]);
  assert.equal(request.body.max_tokens, 16384);
});

test("adds thinking + no-live-search instructions when tools are off", () => {
  const request = buildModelRequest({
    baseURL: "https://jiuuij.de5.net/v1/chat/completions",
    model: "grok-4.3-high",
    messages: [{ role: "user", content: "Explain streaming" }],
    reasoningEffort: "high",
    webSearch: false,
    xSearch: false,
  });

  const system = (request.body.messages as { role: string; content: string }[])[0];
  assert.equal(system?.role, "system");
  assert.match(system?.content ?? "", /thinking_summary/);
  assert.match(system?.content ?? "", /cannot perform live web or X search/i);
  assert.equal(request.body.reasoning_effort, "high");
  assert.equal(request.body.max_tokens, 16384);
});

test("injects thinking instruction, search-tool guidance, and max_output_tokens", () => {
  const request = buildModelRequest({
    baseURL: "https://jiuuij.de5.net/v1",
    model: "grok-4.20-multi-agent-medium",
    messages: [{ role: "user", content: "Hello" }],
    reasoningEffort: "low",
    webSearch: true,
    xSearch: false,
  });

  assert.equal(request.useResponsesApi, true);
  const system = (request.body.input as { role: string; content: string }[])[0];
  assert.equal(system?.role, "system");
  assert.match(system?.content ?? "", /thinking_summary/);
  assert.match(system?.content ?? "", /MUST actually invoke the search tools/i);
  assert.deepEqual((request.body.input as unknown[])[1], {
    role: "user",
    content: "Hello",
  });
  assert.equal(
    (request.body.reasoning as { effort?: string } | undefined)?.effort,
    "low"
  );
  assert.equal(request.body.max_output_tokens, 16384);
  assert.deepEqual(request.body.tools, [{ type: "web_search" }]);
});

test("skips thinking instruction when effort is none but still sets search guidance", () => {
  const request = buildModelRequest({
    baseURL: "https://jiuuij.de5.net/v1",
    model: "grok-4.3-medium",
    messages: [{ role: "user", content: "Hello" }],
    reasoningEffort: "none",
    webSearch: false,
    xSearch: false,
  });

  assert.equal(request.useResponsesApi, true);
  const system = (request.body.input as { role: string; content: string }[])[0];
  assert.equal(system?.role, "system");
  assert.doesNotMatch(system?.content ?? "", /thinking_summary/);
  assert.match(system?.content ?? "", /cannot perform live web or X search/i);
  assert.equal(request.body.reasoning, undefined);
  assert.equal(request.body.max_output_tokens, 16384);
});

test("skips reasoning params for Responses API when effort is none", () => {
  const request = buildModelRequest({
    baseURL: "https://api.x.ai/v1",
    model: "grok-4.3",
    messages: [{ role: "user", content: "Hello" }],
    reasoningEffort: "none",
    webSearch: false,
    xSearch: false,
  });

  assert.equal(request.useResponsesApi, true);
  assert.equal("reasoning" in request.body, false);
  assert.equal(request.body.max_output_tokens, 16384);
});

test("parses tagged thinking summary out of streamed answer text", () => {
  assert.deepEqual(
    parseTaggedThinkingSummary(
      "<thinking_summary>Checked current docs and compared options.</thinking_summary>\nFinal answer."
    ),
    {
      content: "\nFinal answer.",
      thinking: "Checked current docs and compared options.",
      open: false,
    }
  );

  assert.deepEqual(
    parseTaggedThinkingSummary(
      "<thinking_summary>Still collecting sources"
    ),
    {
      content: "",
      thinking: "Still collecting sources",
      open: true,
    }
  );
});

test("extracts citations from [[n]](url) double-bracket format", () => {
  const text = `SpaceX IPO定价135美元。[[1]](https://www.reuters.com/technology/)

DeepSeek融资77亿美元。[[2]](https://www.youtube.com/watch?v=abc)

TSMC乐观。[[1]](https://www.reuters.com/technology/)`;

  const citations = extractCitationsFromText(text);
  assert.equal(citations.length, 2, "should deduplicate by URL");
  assert.equal(citations[0].url, "https://www.reuters.com/technology/");
  assert.equal(citations[0].domain, "reuters.com");
  assert.equal(citations[0].index, 1);
  assert.equal(citations[1].url, "https://www.youtube.com/watch?v=abc");
  assert.equal(citations[1].domain, "youtube.com");
  assert.equal(citations[1].index, 2);
});

test("extracts citations from [n](url) single-bracket format", () => {
  const text = `Some info. [1](https://example.com) and [2](https://other.com).`;
  const citations = extractCitationsFromText(text);
  assert.equal(citations.length, 2);
  assert.equal(citations[0].domain, "example.com");
  assert.equal(citations[1].domain, "other.com");
});

test("extracts citations from descriptive [text](url) links", () => {
  const text = `Check out [React docs](https://react.dev) for more info.`;
  const citations = extractCitationsFromText(text);
  assert.equal(citations.length, 1);
  assert.equal(citations[0].title, "React docs");
  assert.equal(citations[0].domain, "react.dev");
});

test("extracts footnote-style citations when no inline links exist", () => {
  const text = `SpaceX launched a new rocket [1] and TSMC raised guidance [2].

[1] https://www.reuters.com/space/spacex-launch
[2] https://www.cnbc.com/tsmc-guidance TSMC Q2 outlook`;

  const citations = extractCitationsFromText(text);
  assert.equal(citations.length, 2);
  assert.equal(citations[0].index, 1);
  assert.equal(citations[0].url, "https://www.reuters.com/space/spacex-launch");
  assert.equal(citations[0].domain, "reuters.com");
  assert.equal(citations[1].index, 2);
  assert.equal(citations[1].title, "TSMC Q2 outlook");
});

test("injectCitationLinks replaces plain [n] with markdown links", () => {
  const text = "SpaceX IPO定价135美元 [1]，DeepSeek融资 [2]。";
  const citations = [
    { index: 1, url: "https://reuters.com/spacex", title: "Reuters", domain: "reuters.com" },
    { index: 2, url: "https://cnbc.com/deepseek", title: "CNBC", domain: "cnbc.com" },
  ];
  const result = injectCitationLinks(text, citations);
  assert.equal(result, "SpaceX IPO定价135美元 [1](https://reuters.com/spacex)，DeepSeek融资 [2](https://cnbc.com/deepseek)。");
});

test("injectCitationLinks leaves already-linked [n](url) unchanged", () => {
  const text = "Info [1](https://example.com) and plain text.";
  const citations = [
    { index: 1, url: "https://example.com", title: "Example", domain: "example.com" },
  ];
  const result = injectCitationLinks(text, citations);
  assert.equal(result, text);
});

test("injectCitationLinks with empty citations returns text unchanged", () => {
  const text = "No citations [1] here.";
  assert.equal(injectCitationLinks(text, []), text);
});

test("round-trip: injectCitationLinks then extractCitationsFromText recovers citations", () => {
  const text = "Rocket launched [1] and chip guidance raised [2].";
  const citations = [
    { index: 1, url: "https://reuters.com/space", title: "Reuters", domain: "reuters.com" },
    { index: 2, url: "https://cnbc.com/tsmc", title: "CNBC", domain: "cnbc.com" },
  ];
  const injected = injectCitationLinks(text, citations);
  const recovered = extractCitationsFromText(injected);
  assert.equal(recovered.length, 2);
  assert.equal(recovered[0].url, "https://reuters.com/space");
  assert.equal(recovered[1].url, "https://cnbc.com/tsmc");
});
