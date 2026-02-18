"use strict";

const API_PATHS = Object.freeze({
  usersMe: "/Users/Me",
  users: "/Users",
  items: "/Items",
  suggestions: "/Items/Suggestions",
  nextUp: "/Shows/NextUp",
  movieRecommendations: "/Movies/Recommendations",
  sessions: "/Sessions"
});

function encodeQuery(query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        continue;
      }
      params.set(key, value.join(","));
      continue;
    }
    params.set(key, String(value));
  }
  const rendered = params.toString();
  return rendered ? `?${rendered}` : "";
}

class JellyfinClient {
  constructor(options) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl || fetch;
    this.timeoutMs = options.timeoutMs || 15000;
    this.userId = options.userId || null;
  }

  async request(method, path, { query, body } = {}) {
    const url = `${this.baseUrl}${path}${encodeQuery(query)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers = {
      "X-Emby-Token": this.apiKey,
      "Accept": "application/json"
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    try {
      const response = await this.fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });

      const text = await response.text();
      const payload = text ? safeJsonParse(text) : null;
      if (!response.ok) {
        const message = payload && payload.message ? payload.message : text || response.statusText;
        const err = new Error(`Jellyfin ${method} ${path} failed: ${response.status} ${message}`);
        err.status = response.status;
        err.payload = payload;
        throw err;
      }
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getMe() {
    return this.request("GET", API_PATHS.usersMe);
  }

  async listUsers() {
    return this.request("GET", API_PATHS.users);
  }

  async getCurrentUser() {
    try {
      const me = await this.getMe();
      return {
        user: me,
        source: "me"
      };
    } catch (err) {
      if (!err || err.status !== 400) {
        throw err;
      }
      const users = await this.listUsers();
      if (!Array.isArray(users) || users.length === 0) {
        throw new Error("Unable to resolve Jellyfin user: /Users returned no users.");
      }
      if (users.length === 1) {
        return {
          user: users[0],
          source: "users_single"
        };
      }
      throw new Error(
        "Unable to resolve Jellyfin user from API key alone. Set JELLYFIN_USER_ID or pass userId explicitly."
      );
    }
  }

  async resolveUserId(explicitUserId) {
    if (explicitUserId) {
      return explicitUserId;
    }
    if (this.userId) {
      return this.userId;
    }
    const current = await this.getCurrentUser();
    return current.user.Id;
  }

  async listItems(args) {
    return this.request("GET", API_PATHS.items, { query: args });
  }

  async getSuggestions(args) {
    return this.request("GET", API_PATHS.suggestions, { query: args });
  }

  async getNextUp(args) {
    return this.request("GET", API_PATHS.nextUp, { query: args });
  }

  async getMovieRecommendations(args) {
    return this.request("GET", API_PATHS.movieRecommendations, { query: args });
  }

  async listSessions(query) {
    return this.request("GET", API_PATHS.sessions, { query });
  }

  async sendPlay(sessionId, query) {
    return this.request("POST", `/Sessions/${encodeURIComponent(sessionId)}/Playing`, { query });
  }

  async sendPlaystate(sessionId, command, query) {
    return this.request(
      "POST",
      `/Sessions/${encodeURIComponent(sessionId)}/Playing/${encodeURIComponent(command)}`,
      { query }
    );
  }

  async sendCommand(sessionId, command, body) {
    return this.request(
      "POST",
      `/Sessions/${encodeURIComponent(sessionId)}/Command/${encodeURIComponent(command)}`,
      { body }
    );
  }
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

module.exports = {
  JellyfinClient
};
