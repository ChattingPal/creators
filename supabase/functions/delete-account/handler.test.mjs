import assert from "node:assert/strict";
import test from "node:test";

import {
  DELETE_CONFIRMATION,
  handleDeleteAccount
} from "./handler.js";

function request(body, method = "POST") {
  return new Request("https://example.test/functions/v1/delete-account", {
    method,
    headers: { "content-type": "application/json" },
    body: method === "POST" ? JSON.stringify(body) : undefined
  });
}

function context(userId = "jwt-user") {
  const calls = [];
  return {
    calls,
    value: {
      userClaims: userId ? { id: userId } : {},
      supabaseAdmin: {
        auth: {
          admin: {
            async deleteUser(...args) {
              calls.push(args);
              return { error: null };
            }
          }
        }
      }
    }
  };
}

test("rejects non-POST requests", async () => {
  const ctx = context();
  const response = await handleDeleteAccount(request(null, "GET"), ctx.value);

  assert.equal(response.status, 405);
  assert.equal(ctx.calls.length, 0);
});

test("requires the exact confirmation value", async () => {
  const ctx = context();
  const response = await handleDeleteAccount(
    request({ confirmation: false }),
    ctx.value
  );

  assert.equal(response.status, 400);
  assert.equal(ctx.calls.length, 0);
});

test("rejects a browser-submitted user id", async () => {
  const ctx = context("verified-user");
  const response = await handleDeleteAccount(
    request({ confirmation: DELETE_CONFIRMATION, userId: "another-user" }),
    ctx.value
  );

  assert.equal(response.status, 400);
  assert.equal(ctx.calls.length, 0);
});

test("requires an authenticated user claim", async () => {
  const ctx = context("");
  const response = await handleDeleteAccount(
    request({ confirmation: DELETE_CONFIRMATION }),
    ctx.value
  );

  assert.equal(response.status, 401);
  assert.equal(ctx.calls.length, 0);
});

test("deletes only the user id derived from verified claims", async () => {
  const ctx = context("verified-user");
  const response = await handleDeleteAccount(
    request({ confirmation: DELETE_CONFIRMATION }),
    ctx.value
  );

  assert.equal(response.status, 200);
  assert.deepEqual(ctx.calls, [["verified-user", false]]);
  assert.deepEqual(await response.json(), { deleted: true });
});

test("does not expose an administrative deletion error", async () => {
  const ctx = context("verified-user");
  ctx.value.supabaseAdmin.auth.admin.deleteUser = async () => ({
    error: { message: "private server detail" }
  });

  const response = await handleDeleteAccount(
    request({ confirmation: DELETE_CONFIRMATION }),
    ctx.value
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "account_deletion_failed" });
});
