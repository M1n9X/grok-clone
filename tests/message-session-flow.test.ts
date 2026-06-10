import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLazySessionInsert,
  prepareSessionLoad,
} from "../src/lib/message-session-flow";

test("lazy session creation persists the selected first-message model", () => {
  assert.deepEqual(
    buildLazySessionInsert({
      sessionId: "00000000-0000-4000-8000-000000000001",
      userId: "user-1",
      sessionTitle: "  Expert prompt  ",
      sessionModel: "expert",
    }),
    {
      id: "00000000-0000-4000-8000-000000000001",
      user_id: "user-1",
      title: "Expert prompt",
      model: "expert",
    }
  );
});

test("lazy session creation rejects invalid selected models", () => {
  assert.equal(
    buildLazySessionInsert({
      sessionId: "00000000-0000-4000-8000-000000000001",
      userId: "user-1",
      sessionTitle: "Bad model",
      sessionModel: "grok-4.3-high",
    }),
    null
  );
});

test("chat session load resets state for every route session id change", () => {
  assert.deepEqual(
    prepareSessionLoad({
      previousSessionId: "00000000-0000-4000-8000-000000000001",
      nextSessionId: "00000000-0000-4000-8000-000000000002",
    }),
    {
      sessionChanged: true,
      shouldAbortStream: true,
      shouldClearMessages: true,
      historyLoading: true,
      shouldLoad: true,
    }
  );
});

test("chat session load does not reset state when the route id is unchanged", () => {
  assert.deepEqual(
    prepareSessionLoad({
      previousSessionId: "00000000-0000-4000-8000-000000000001",
      nextSessionId: "00000000-0000-4000-8000-000000000001",
    }),
    {
      sessionChanged: false,
      shouldAbortStream: false,
      shouldClearMessages: false,
      historyLoading: false,
      shouldLoad: false,
    }
  );
});
