"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createToolRunner } = require("../src/tools");

test("list media resolves user and maps items", async () => {
  const calls = [];
  const client = {
    async resolveUserId(userId) {
      calls.push(["resolveUserId", userId]);
      return "u1";
    },
    async listItems(query) {
      calls.push(["listItems", query]);
      return {
        TotalRecordCount: 1,
        Items: [
          {
            Id: "i1",
            Name: "Pilot",
            Type: "Episode",
            ProductionYear: 2020,
            SeriesName: "Breaking Bad",
            SeriesId: "series1",
            SeasonName: "Season 1",
            SeasonId: "season1",
            ParentIndexNumber: 1,
            IndexNumber: 1
          }
        ]
      };
    }
  };

  const toolRunner = createToolRunner({
    client,
    sessionResolver: {},
    defaultUserId: null
  });

  const result = await toolRunner.run("jellyfin_list_media", {
    includeItemTypes: ["Movie"],
    limit: 10
  });

  assert.equal(result.totalRecordCount, 1);
  assert.equal(result.items[0].id, "i1");
  assert.equal(result.items[0].seriesName, "Breaking Bad");
  assert.equal(result.items[0].seasonNumber, 1);
  assert.equal(result.items[0].episodeNumber, 1);
  assert.equal(calls[0][0], "resolveUserId");
  assert.equal(calls[1][0], "listItems");
});

test("play tool sends payload to resolved session", async () => {
  let sent = null;
  const client = {
    async sendPlay(sessionId, body) {
      sent = { sessionId, body };
    }
  };
  const sessionResolver = {
    async resolveSession() {
      return { sessionId: "s1", resolution: "auto" };
    }
  };

  const toolRunner = createToolRunner({
    client,
    sessionResolver,
    defaultUserId: "u1"
  });

  const result = await toolRunner.run("jellyfin_play", {
    itemIds: ["i1"],
    playCommand: "PlayNow"
  });
  assert.equal(result.ok, true);
  assert.equal(sent.sessionId, "s1");
  assert.deepEqual(sent.body.itemIds, ["i1"]);
  assert.equal(sent.body.playCommand, "PlayNow");
});

test("play by name prefers series and starts first episode", async () => {
  const calls = [];
  let played = null;
  const client = {
    async resolveUserId() {
      return "u1";
    },
    async listItems(query) {
      calls.push(query);
      if (query.SearchTerm) {
        return {
          Items: [
            { Id: "series1", Name: "Breaking Bad", Type: "Series" },
            { Id: "movie1", Name: "Breaking", Type: "Movie" }
          ]
        };
      }
      return {
        Items: [
          {
            Id: "ep1",
            Name: "Pilot",
            Type: "Episode",
            SeriesName: "Breaking Bad",
            ParentIndexNumber: 1,
            IndexNumber: 1
          }
        ]
      };
    },
    async sendPlay(sessionId, body) {
      played = { sessionId, body };
    }
  };
  const sessionResolver = {
    async resolveSession() {
      return { sessionId: "s1", resolution: "auto" };
    }
  };
  const toolRunner = createToolRunner({
    client,
    sessionResolver,
    defaultUserId: null
  });

  const result = await toolRunner.run("jellyfin_play_by_name", { query: "breaking bad" });
  assert.equal(result.ok, true);
  assert.equal(result.selected.id, "ep1");
  assert.equal(result.selected.seriesName, "Breaking Bad");
  assert.equal(played.sessionId, "s1");
  assert.deepEqual(played.body.itemIds, ["ep1"]);
  assert.ok(calls.length >= 2);
});

test("play by name uses fallback matching for punctuation variants", async () => {
  let played = null;
  const client = {
    async resolveUserId() {
      return "u1";
    },
    async listItems(query) {
      if (query.SearchTerm) {
        return { Items: [] };
      }
      return {
        Items: [{ Id: "m1", Name: "WALL·E", Type: "Movie" }]
      };
    },
    async sendPlay(sessionId, body) {
      played = { sessionId, body };
    }
  };
  const sessionResolver = {
    async resolveSession() {
      return { sessionId: "s1", resolution: "auto" };
    }
  };
  const toolRunner = createToolRunner({
    client,
    sessionResolver,
    defaultUserId: null
  });

  const result = await toolRunner.run("jellyfin_play_by_name", { query: "wall e" });
  assert.equal(result.ok, true);
  assert.equal(result.selected.name, "WALL·E");
  assert.deepEqual(played.body.itemIds, ["m1"]);
});

test("play by name returns no match when fallback has unrelated titles", async () => {
  const client = {
    async resolveUserId() {
      return "u1";
    },
    async listItems(query) {
      if (query.SearchTerm) {
        return { Items: [] };
      }
      return {
        Items: [{ Id: "x1", Name: "3 Body Problem", Type: "Series" }]
      };
    },
    async sendPlay() {
      throw new Error("sendPlay should not be called for unmatched query");
    }
  };
  const toolRunner = createToolRunner({
    client,
    sessionResolver: {},
    defaultUserId: null
  });

  const result = await toolRunner.run("jellyfin_play_by_name", { query: "wall e" });
  assert.equal(result.ok, false);
});

test("get_me returns fallback source from current user resolver", async () => {
  const client = {
    async getCurrentUser() {
      return {
        source: "users_single",
        user: { Id: "u1", Name: "admin", PrimaryImageTag: null }
      };
    }
  };
  const toolRunner = createToolRunner({
    client,
    sessionResolver: {},
    defaultUserId: null
  });

  const result = await toolRunner.run("jellyfin_get_me", {});
  assert.equal(result.user.id, "u1");
  assert.equal(result.source, "users_single");
});
