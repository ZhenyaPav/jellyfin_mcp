"use strict";

function getEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === "") {
    return fallback;
  }
  return value;
}

function parsePositiveInt(name, fallback) {
  const raw = getEnv(name, String(fallback));
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }
  return n;
}

function loadConfig() {
  const baseUrl = getEnv("JELLYFIN_API_URL");
  const apiKey = getEnv("JELLYFIN_API_KEY");

  if (!baseUrl) {
    throw new Error("Missing required env var JELLYFIN_API_URL");
  }
  if (!apiKey) {
    throw new Error("Missing required env var JELLYFIN_API_KEY");
  }

  const strategy = getEnv("JELLYFIN_SESSION_STRATEGY", "active");
  const allowedStrategies = new Set(["active", "recent", "device", "ask"]);
  const sessionStrategy = allowedStrategies.has(strategy) ? strategy : "active";

  return {
    baseUrl,
    apiKey,
    userId: getEnv("JELLYFIN_USER_ID", null),
    sessionStrategy,
    deviceIdHint: getEnv("JELLYFIN_DEVICE_ID_HINT", null),
    timeoutMs: parsePositiveInt("JELLYFIN_TIMEOUT_MS", 15000)
  };
}

module.exports = {
  loadConfig
};
