"use strict";

function toTimestamp(value) {
  if (!value) {
    return 0;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

class SessionResolver {
  constructor(options) {
    this.client = options.client;
    this.strategy = options.strategy || "active";
    this.deviceIdHint = options.deviceIdHint || null;
    this.nowFn = options.nowFn || (() => Date.now());
  }

  async resolveSession(input = {}) {
    const explicitSessionId = input.sessionId;
    if (explicitSessionId) {
      return {
        sessionId: explicitSessionId,
        resolution: "explicit"
      };
    }

    const sessions = await this.client.listSessions();
    if (!Array.isArray(sessions) || sessions.length === 0) {
      throw new Error("No active Jellyfin sessions found.");
    }

    const ranked = sessions
      .map((s) => ({ session: s, score: this.scoreSession(s, input.deviceIdHint || this.deviceIdHint) }))
      .sort((a, b) => b.score - a.score);

    const top = ranked[0];
    if (!top || !top.session || !top.session.Id) {
      throw new Error("Failed to select a Jellyfin session.");
    }

    const second = ranked[1];
    const ambiguous = second && top.score - second.score < 15;
    if (this.strategy === "ask" && ambiguous) {
      const choices = ranked.slice(0, 5).map(({ session, score }) => ({
        sessionId: session.Id,
        deviceName: session.DeviceName || null,
        client: session.Client || null,
        nowPlaying: session.NowPlayingItem ? session.NowPlayingItem.Name : null,
        score
      }));
      const err = new Error("Multiple likely sessions; explicit sessionId required.");
      err.code = "SESSION_AMBIGUOUS";
      err.choices = choices;
      throw err;
    }

    return {
      sessionId: top.session.Id,
      resolution: "auto",
      score: top.score,
      deviceName: top.session.DeviceName || null
    };
  }

  scoreSession(session, deviceHint) {
    let score = 0;
    const supportsRemote = session.SupportsRemoteControl !== false;
    if (supportsRemote) {
      score += 20;
    }
    if (session.NowPlayingItem) {
      score += 25;
    }
    const isPaused = session.PlayState && session.PlayState.IsPaused;
    if (session.NowPlayingItem && !isPaused) {
      score += 20;
    }

    const hint = (deviceHint || "").toLowerCase();
    const deviceId = (session.DeviceId || "").toLowerCase();
    const deviceName = (session.DeviceName || "").toLowerCase();
    if (hint && (deviceId.includes(hint) || deviceName.includes(hint))) {
      score += 40;
    }

    const lastActivityMs = toTimestamp(session.LastActivityDate);
    if (lastActivityMs > 0) {
      const ageMinutes = (this.nowFn() - lastActivityMs) / 60000;
      if (ageMinutes <= 5) {
        score += 20;
      } else if (ageMinutes <= 30) {
        score += 10;
      } else if (ageMinutes <= 120) {
        score += 5;
      }
    }

    if (this.strategy === "recent") {
      score += 5;
    } else if (this.strategy === "device" && hint) {
      score += 8;
    }

    return score;
  }
}

module.exports = {
  SessionResolver
};
