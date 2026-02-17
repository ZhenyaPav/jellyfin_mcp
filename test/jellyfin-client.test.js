"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { JellyfinClient } = require("../src/jellyfin-client");

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    async text() {
      return body === undefined ? "" : JSON.stringify(body);
    }
  };
}

test("resolveUserId falls back to /Users when /Users/Me returns 400", async () => {
  const calls = [];
  const client = new JellyfinClient({
    baseUrl: "http://example",
    apiKey: "k",
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.endsWith("/Users/Me")) {
        return response(400, { title: "Bad Request" });
      }
      if (url.endsWith("/Users")) {
        return response(200, [{ Id: "u1", Name: "admin" }]);
      }
      return response(404, {});
    }
  });

  const userId = await client.resolveUserId();
  assert.equal(userId, "u1");
  assert.equal(calls.length, 2);
});
