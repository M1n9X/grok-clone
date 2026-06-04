import assert from "node:assert/strict";
import test from "node:test";

import {
  buildModelRequest,
  decodeStreamEventLine,
  encodeStreamEvent,
  extractChatCompletionEvents,
  extractCitationsFromText,
  extractResponsesApiEvents,
  parseTaggedThinkingSummary,
} from "../src/lib/chat-stream-events.ts";

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
      type: "response.output_text.delta",
      delta: "Final answer",
    }),
    [{ type: "text", delta: "Final answer" }]
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
});

test("adds a tagged thinking summary instruction to model messages", () => {
  const request = buildModelRequest({
    baseURL: "https://jiuuij.de5.net/v1/chat/completions",
    model: "grok-4.3-high",
    messages: [{ role: "user", content: "Explain streaming" }],
    reasoningEffort: "high",
    webSearch: false,
    xSearch: false,
  });

  assert.deepEqual((request.body.messages as unknown[])[0], {
    role: "system",
    content:
      "Before the final answer, provide a concise reasoning summary inside <thinking_summary>...</thinking_summary>. Summarize the approach, searches, and checks without exposing private chain-of-thought.",
  });
  assert.equal(request.body.reasoning_effort, "high");
});

test("injects thinking instruction and reasoning params for low effort (auto mode)", () => {
  const request = buildModelRequest({
    baseURL: "https://jiuuij.de5.net/v1",
    model: "grok-4.20-multi-agent-medium",
    messages: [{ role: "user", content: "Hello" }],
    reasoningEffort: "low",
    webSearch: false,
    xSearch: false,
  });

  assert.equal(request.useResponsesApi, true);
  assert.deepEqual((request.body.input as unknown[])[0], {
    role: "system",
    content:
      "Before the final answer, provide a concise reasoning summary inside <thinking_summary>...</thinking_summary>. Summarize the approach, searches, and checks without exposing private chain-of-thought.",
  });
  assert.deepEqual((request.body.input as unknown[])[1], {
    role: "user",
    content: "Hello",
  });
  assert.equal(request.body.reasoning?.effort, "low");
});

test("skips thinking instruction and reasoning_effort when effort is none", () => {
  const request = buildModelRequest({
    baseURL: "https://jiuuij.de5.net/v1",
    model: "grok-4.3-medium",
    messages: [{ role: "user", content: "Hello" }],
    reasoningEffort: "none",
    webSearch: false,
    xSearch: false,
  });

  assert.equal(request.useResponsesApi, true);
  assert.deepEqual(request.body.input, [
    { role: "user", content: "Hello" },
  ]);
  assert.equal(request.body.reasoning, undefined);
});

test("skips thinking instruction and reasoning for Responses API when effort is none", () => {
  const request = buildModelRequest({
    baseURL: "https://api.x.ai/v1",
    model: "grok-4.3",
    messages: [{ role: "user", content: "Hello" }],
    reasoningEffort: "none",
    webSearch: false,
    xSearch: false,
  });

  assert.equal(request.useResponsesApi, true);
  assert.deepEqual(request.body.input, [
    { role: "user", content: "Hello" },
  ]);
  assert.equal("reasoning" in request.body, false);
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
