"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createToolRunner } = require("../src/tools");

test("browse clamps limit and returns compact items without ids", async () => {
  const client = {
    async resolveUserId() {
      return "u1";
    },
    async listItems(query) {
      assert.equal(query.Limit, 20);
      return {
        Items: [
          {
            Id: "i1",
            Name: "Pilot",
            Type: "Episode",
            ProductionYear: 2008,
            CommunityRating: 9.1,
            SeriesName: "Breaking Bad",
            ParentIndexNumber: 1,
            IndexNumber: 1
          }
        ]
      };
    }
  };
  const tools = createToolRunner({ client, sessionResolver: {}, defaultUserId: null });
  const result = await tools.run("jellyfin_browse", { query: "breaking", limit: 999 });
  assert.equal(result.count, 1);
  assert.equal(result.items[0].title, "Pilot");
  assert.equal(result.items[0].seriesName, "Breaking Bad");
  assert.equal(Object.hasOwn(result.items[0], "id"), false);
});

test("recommendations tool name and compact payload", async () => {
  const client = {
    async resolveUserId() {
      return "u1";
    },
    async getSuggestions(query) {
      assert.equal(query.Limit, 20);
      return {
        Items: [{ Id: "m1", Name: "WALL·E", Type: "Movie", ProductionYear: 2008, CommunityRating: 8.4 }]
      };
    }
  };
  const tools = createToolRunner({ client, sessionResolver: {}, defaultUserId: null });
  const result = await tools.run("jellyfin_get_recommendations", { limit: 500 });
  assert.equal(result.count, 1);
  assert.equal(result.items[0].title, "WALL·E");
  assert.equal(Object.hasOwn(result.items[0], "id"), false);
});

test("play by name searches and plays selected item", async () => {
  let sent = null;
  const client = {
    async resolveUserId() {
      return "u1";
    },
    async listItems(query) {
      if (query.ParentId) {
        return { Items: [] };
      }
      return { Items: [{ Id: "m1", Name: "WALL·E", Type: "Movie" }] };
    },
    async sendPlay(sessionId, payload) {
      sent = { sessionId, payload };
    }
  };
  const sessionResolver = {
    async resolveSession() {
      return { sessionId: "s1", deviceName: "Living Room TV" };
    }
  };
  const tools = createToolRunner({ client, sessionResolver, defaultUserId: null });
  const result = await tools.run("jellyfin_play_by_name", { query: "wall e" });
  assert.equal(result.ok, true);
  assert.equal(result.selectedTitle, "WALL·E");
  assert.equal(result.sessionName, "Living Room TV");
  assert.equal(sent.sessionId, "s1");
  assert.deepEqual(sent.payload.itemIds, ["m1"]);
});

test("playback control maps pause to playstate command", async () => {
  let sent = null;
  const client = {
    async sendPlaystate(sessionId, command) {
      sent = { sessionId, command };
    }
  };
  const sessionResolver = {
    async resolveSession() {
      return { sessionId: "s1", deviceName: "Desktop" };
    }
  };
  const tools = createToolRunner({ client, sessionResolver, defaultUserId: null });
  const result = await tools.run("jellyfin_playback_control", { action: "pause" });
  assert.equal(result.ok, true);
  assert.equal(result.action, "pause");
  assert.equal(sent.sessionId, "s1");
  assert.equal(sent.command, "Pause");
});
