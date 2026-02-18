"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { SessionResolver } = require("../src/session-resolver");
const { ERRORS } = require("../src/constants");

test("session resolver picks currently active remote session", async () => {
  const now = Date.parse("2026-02-17T18:00:00Z");
  const client = {
    async listSessions() {
      return [
        {
          Id: "s1",
          DeviceName: "Living Room TV",
          SupportsRemoteControl: true,
          NowPlayingItem: { Name: "Movie A" },
          PlayState: { IsPaused: false },
          LastActivityDate: "2026-02-17T17:58:30Z"
        },
        {
          Id: "s2",
          DeviceName: "Tablet",
          SupportsRemoteControl: true,
          LastActivityDate: "2026-02-17T17:40:00Z"
        }
      ];
    }
  };

  const resolver = new SessionResolver({
    client,
    strategy: "active",
    nowFn: () => now
  });
  const result = await resolver.resolveSession();
  assert.equal(result.sessionId, "s1");
  assert.equal(result.resolution, "auto");
});

test("session resolver prefers device hint", async () => {
  const now = Date.parse("2026-02-17T18:00:00Z");
  const client = {
    async listSessions() {
      return [
        {
          Id: "s1",
          DeviceName: "Office TV",
          SupportsRemoteControl: true,
          LastActivityDate: "2026-02-17T17:59:00Z"
        },
        {
          Id: "s2",
          DeviceName: "Bedroom TV",
          SupportsRemoteControl: true,
          LastActivityDate: "2026-02-17T17:59:00Z"
        }
      ];
    }
  };

  const resolver = new SessionResolver({
    client,
    strategy: "device",
    deviceIdHint: "bedroom",
    nowFn: () => now
  });
  const result = await resolver.resolveSession();
  assert.equal(result.sessionId, "s2");
});

test("session resolver returns ambiguity in ask strategy", async () => {
  const now = Date.parse("2026-02-17T18:00:00Z");
  const client = {
    async listSessions() {
      return [
        {
          Id: "s1",
          DeviceName: "Room 1",
          SupportsRemoteControl: true,
          LastActivityDate: "2026-02-17T17:59:00Z"
        },
        {
          Id: "s2",
          DeviceName: "Room 2",
          SupportsRemoteControl: true,
          LastActivityDate: "2026-02-17T17:59:00Z"
        }
      ];
    }
  };
  const resolver = new SessionResolver({
    client,
    strategy: "ask",
    nowFn: () => now
  });

  await assert.rejects(() => resolver.resolveSession(), (err) => {
    assert.equal(err.code, "SESSION_AMBIGUOUS");
    assert.ok(Array.isArray(err.choices));
    assert.ok(err.choices.length >= 2);
    return true;
  });
});

test("session resolver errors when playback control requires active player", async () => {
  const client = {
    async listSessions() {
      return [
        {
          Id: "s1",
          DeviceName: "Living Room TV",
          SupportsRemoteControl: true,
          LastActivityDate: "2026-02-17T17:59:00Z"
        }
      ];
    }
  };

  const resolver = new SessionResolver({
    client,
    strategy: "active"
  });

  await assert.rejects(
    () => resolver.resolveSession({ requireNowPlaying: true }),
    new RegExp(ERRORS.noActivePlayer)
  );
});
