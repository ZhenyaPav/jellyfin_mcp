"use strict";

const {
  CONTEXT_FIELDS,
  DEFAULT_INCLUDE_TYPES,
  ERRORS,
  ITEM_TYPES,
  LIMITS,
  PLAYBACK_ACTIONS,
  PLAY_COMMANDS,
  TOOL_NAMES
} = require("./constants");

function toolDefinitions() {
  return [
    {
      name: TOOL_NAMES.browse,
      description: "Browse or search media with compact output.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          userId: { type: "string" },
          includeItemTypes: { type: "array", items: { type: "string" } },
          limit: { type: "integer", minimum: 1, maximum: LIMITS.max }
        },
        additionalProperties: false
      }
    },
    {
      name: TOOL_NAMES.recommendations,
      description: "Get compact media recommendations.",
      inputSchema: {
        type: "object",
        properties: {
          userId: { type: "string" },
          mediaType: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: LIMITS.max }
        },
        additionalProperties: false
      }
    },
    {
      name: TOOL_NAMES.nextUp,
      description: "Get compact Next Up episodes.",
      inputSchema: {
        type: "object",
        properties: {
          userId: { type: "string" },
          seriesId: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: LIMITS.max }
        },
        additionalProperties: false
      }
    },
    {
      name: TOOL_NAMES.playByName,
      description: "Search and start playback in one call.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", minLength: 1 },
          userId: { type: "string" },
          sessionId: { type: "string" },
          includeItemTypes: { type: "array", items: { type: "string" } }
        },
        required: ["query"],
        additionalProperties: false
      }
    },
    {
      name: TOOL_NAMES.playbackControl,
      description: "Control playback without exposing session details.",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: Object.keys(PLAYBACK_ACTIONS) },
          sessionId: { type: "string" }
        },
        required: ["action"],
        additionalProperties: false
      }
    }
  ];
}

function createToolRunner({ client, sessionResolver, defaultUserId }) {
  const handlers = {
    [TOOL_NAMES.browse]: async (args) => {
      const userId = await client.resolveUserId(args.userId || defaultUserId);
      const limit = clampInt(args.limit, LIMITS.default, 1, LIMITS.max);
      const response = await client.listItems({
        UserId: userId,
        Recursive: true,
        SearchTerm: args.query,
        IncludeItemTypes: normalizeItemTypes(args.includeItemTypes),
        Limit: limit,
        SortBy: "SortName",
        SortOrder: "Ascending",
        Fields: CONTEXT_FIELDS
      });
      const items = (response.Items || []).map(toPublicItem).slice(0, LIMITS.max);
      return {
        query: args.query || null,
        count: items.length,
        items
      };
    },

    [TOOL_NAMES.recommendations]: async (args) => {
      const userId = await client.resolveUserId(args.userId || defaultUserId);
      const limit = clampInt(args.limit, LIMITS.default, 1, LIMITS.max);
      const response = await client.getSuggestions({
        UserId: userId,
        MediaType: args.mediaType,
        Limit: limit
      });
      const items = (response.Items || []).map(toPublicItem).slice(0, LIMITS.max);
      return {
        mediaType: args.mediaType || null,
        count: items.length,
        items
      };
    },

    [TOOL_NAMES.nextUp]: async (args) => {
      const userId = await client.resolveUserId(args.userId || defaultUserId);
      const limit = clampInt(args.limit, LIMITS.default, 1, LIMITS.max);
      const response = await client.getNextUp({
        UserId: userId,
        SeriesId: args.seriesId,
        Limit: limit,
        Fields: CONTEXT_FIELDS
      });
      const items = (response.Items || []).map(toPublicItem).slice(0, LIMITS.max);
      return {
        seriesId: args.seriesId || null,
        count: items.length,
        items
      };
    },

    [TOOL_NAMES.playByName]: async (args) => {
      const query = String(args.query || "").trim();
      if (!query) {
        throw new Error(ERRORS.missingQuery);
      }
      const userId = await client.resolveUserId(args.userId || defaultUserId);
      const searchTerms = buildSearchTerms(query);
      const merged = new Map();
      for (const term of searchTerms) {
        const response = await client.listItems({
          UserId: userId,
          Recursive: true,
          SearchTerm: term,
          IncludeItemTypes: normalizeItemTypes(args.includeItemTypes),
          Limit: LIMITS.max,
          SortBy: "SortName",
          SortOrder: "Ascending",
          Fields: CONTEXT_FIELDS
        });
        for (const item of response.Items || []) {
          merged.set(item.Id, item);
        }
      }

      const candidates = Array.from(merged.values());
      const selected = chooseBestMatch(candidates, query);
      if (!selected) {
        return {
          ok: false,
          query,
          reason: ERRORS.noMatch
        };
      }

      let selectedPlayable = selected;
      if (selected.Type === ITEM_TYPES.series) {
        const episodes = await client.listItems({
          UserId: userId,
          Recursive: true,
          ParentId: selected.Id,
          IncludeItemTypes: [ITEM_TYPES.episode],
          Limit: 1,
          SortBy: "SortName",
          SortOrder: "Ascending",
          Fields: CONTEXT_FIELDS
        });
        if (episodes.Items && episodes.Items[0]) {
          selectedPlayable = episodes.Items[0];
        }
      }

      const resolvedSession = await sessionResolver.resolveSession({ sessionId: args.sessionId });
      await client.sendPlay(resolvedSession.sessionId, {
        itemIds: [selectedPlayable.Id],
        playCommand: PLAY_COMMANDS.playNow
      });

      const item = toPublicItem(selectedPlayable);
      return {
        ok: true,
        selectedTitle: item.title,
        selectedType: item.type,
        seriesName: item.seriesName,
        sessionName: resolvedSession.deviceName || null
      };
    },

    [TOOL_NAMES.playbackControl]: async (args) => {
      const command = PLAYBACK_ACTIONS[args.action];
      if (!command) {
        throw new Error(`Unsupported action: ${args.action}`);
      }
      const resolvedSession = await sessionResolver.resolveSession({
        sessionId: args.sessionId,
        requireNowPlaying: true
      });
      await client.sendPlaystate(resolvedSession.sessionId, command, {});
      return {
        ok: true,
        action: args.action,
        sessionName: resolvedSession.deviceName || null
      };
    }
  };

  async function run(name, args) {
    const handler = handlers[name];
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }
    const safeArgs = args && typeof args === "object" ? args : {};
    return handler(safeArgs);
  }

  return {
    definitions: toolDefinitions(),
    run
  };
}

function toPublicItem(item) {
  return {
    title: item.Name || null,
    type: item.Type || null,
    year: item.ProductionYear || null,
    rating: item.CommunityRating || null,
    seriesName: item.SeriesName || null,
    seasonNumber: item.ParentIndexNumber ?? null,
    episodeNumber: item.IndexNumber ?? null
  };
}

function normalizeItemTypes(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return DEFAULT_INCLUDE_TYPES;
  }
  const clean = value.filter((entry) => typeof entry === "string" && entry.length > 0);
  return clean.length > 0 ? clean : DEFAULT_INCLUDE_TYPES;
}

function buildSearchTerms(query) {
  const terms = new Set();
  const normalized = normalizeForMatch(query);
  terms.add(query);
  if (normalized && normalized !== query) {
    terms.add(normalized);
  }
  const compact = normalized.replace(/\s+/g, "");
  if (compact && compact !== normalized) {
    terms.add(compact);
  }
  const firstToken = normalized.split(/\s+/)[0];
  if (firstToken && firstToken.length >= 3) {
    terms.add(firstToken);
  }
  return Array.from(terms).filter((term) => term && term.trim().length > 0);
}

function chooseBestMatch(items, query) {
  const normalizedQuery = normalizeForMatch(query);
  const scored = items.map((item) => ({ item, score: scoreMatch(item, normalizedQuery) }));
  scored.sort((a, b) => b.score - a.score);
  if (scored.length === 0 || scored[0].score <= 0) {
    return null;
  }
  return scored[0].item;
}

function scoreMatch(item, normalizedQuery) {
  const normalizedName = normalizeForMatch(item.Name || "");
  let textScore = 0;
  if (normalizedName === normalizedQuery) {
    textScore = 100;
  } else if (normalizedName.startsWith(normalizedQuery)) {
    textScore = 70;
  } else if (normalizedName.includes(normalizedQuery)) {
    textScore = 45;
  }
  if (textScore === 0) {
    return 0;
  }
  let score = textScore;
  if (item.Type === ITEM_TYPES.series) {
    score += 20;
  } else if (item.Type === ITEM_TYPES.movie) {
    score += 15;
  } else if (item.Type === ITEM_TYPES.episode) {
    score += 10;
  }
  return score;
}

function normalizeForMatch(value) {
  return String(value)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
}

module.exports = {
  createToolRunner
};
