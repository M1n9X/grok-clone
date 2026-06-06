import assert from "node:assert/strict";
import test from "node:test";

import {
  getAuthRouteDecision,
  isApiPath,
} from "../src/lib/auth-routing";

test("detects API paths separately from page paths", () => {
  assert.equal(isApiPath("/api/sessions"), true);
  assert.equal(isApiPath("/api"), true);
  assert.equal(isApiPath("/chat/123"), false);
});

test("unauthenticated API routes return API unauthorized instead of redirect", () => {
  assert.deepEqual(
    getAuthRouteDecision({
      pathname: "/api/chat",
      isAuthenticated: false,
      registrationEnabled: true,
    }),
    { type: "api-unauthorized" }
  );
});

test("unauthenticated page routes still redirect to login", () => {
  assert.deepEqual(
    getAuthRouteDecision({
      pathname: "/chat/123",
      isAuthenticated: false,
      registrationEnabled: true,
    }),
    { type: "redirect", pathname: "/login" }
  );
});

test("disabled registration redirects register page to login", () => {
  assert.deepEqual(
    getAuthRouteDecision({
      pathname: "/register",
      isAuthenticated: false,
      registrationEnabled: false,
    }),
    { type: "redirect", pathname: "/login" }
  );
});

test("authenticated users leave register page for home even when registration is closed", () => {
  assert.deepEqual(
    getAuthRouteDecision({
      pathname: "/register",
      isAuthenticated: true,
      registrationEnabled: false,
    }),
    { type: "redirect", pathname: "/" }
  );
});
