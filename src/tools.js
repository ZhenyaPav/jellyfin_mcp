"use strict";

const DEFAULT_INCLUDE_TYPES = ["Series", "Movie", "Episode", "Audio"];
const CONTEXT_FIELDS = [
  "SeriesName",
  "SeriesId",
  "SeasonName",
  "SeasonId",
  "ParentIndexNumber",
  "IndexNumber",
  "RunTimeTicks",
  "CommunityRating",
  "ProductionYear"
];

const PLAYSTATE_COMMANDS = new Set([
  "PlayPause",
  "Pause",
  "Unpause",
  "Stop",
  "NextTrack",
  "PreviousTrack",
  "Seek",
  "Rewind",
  "FastForward"
]);

function toolDefinitions() {
  return [
    {
      name: "jellyfin_get_me",
      description: "Get current Jellyfin user bound to API key.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }
    },
    {
      name: "jellyfin_list_media",
      description: "List media items from Jellyfin library for a user.",
      inputSchema: {
        type: "object",
        properties: {
          userId: { type: "string" },
          searchTerm: { type: "string" },
          includeItemTypes: { type: "array", items: { type: "string" } },
          parentId: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 200 },
          startIndex: { type: "integer", minimum: 0 },
          sortBy: { type: "string" },
          sortOrder: { type: "string", enum: ["Ascending", "Descending"] }
        },
        additionalProperties: false
      }
    },
    {
      name: "jellyfin_get_suggestions",
      description: "Get Jellyfin suggestions for a user.",
      inputSchema: {
        type: "object",
        properties: {
          userId: { type: "string" },
          mediaType: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 100 }
        },
        additionalProperties: false
      }
    },
    {
      name: "jellyfin_get_movie_recommendations",
      description: "Get movie recommendation buckets for a user.",
      inputSchema: {
        type: "object",
        properties: {
          userId: { type: "string" },
          categoryLimit: { type: "integer", minimum: 1, maximum: 20 },
          itemLimit: { type: "integer", minimum: 1, maximum: 100 }
        },
        additionalProperties: false
      }
    },
    {
      name: "jellyfin_list_sessions",
      description: "List active Jellyfin sessions.",
      inputSchema: {
        type: "object",
        properties: {
          controllableOnly: { type: "boolean" }
        },
        additionalProperties: false
      }
    },
    {
      name: "jellyfin_play",
      description: "Start playback of one or more Jellyfin items on a session.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          itemIds: { type: "array", items: { type: "string" }, minItems: 1 },
          startPositionTicks: { type: "integer", minimum: 0 },
          playCommand: { type: "string", enum: ["PlayNow", "PlayNext", "PlayLast"] }
        },
        required: ["itemIds"],
        additionalProperties: false
      }
    },
    {
      name: "jellyfin_play_by_name",
      description: "Search and start playback in one call.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          userId: { type: "string" },
          query: { type: "string", minLength: 1 },
          includeItemTypes: { type: "array", items: { type: "string" } },
          playCommand: { type: "string", enum: ["PlayNow", "PlayNext", "PlayLast"] },
          limit: { type: "integer", minimum: 1, maximum: 50 }
        },
        required: ["query"],
        additionalProperties: false
      }
    },
    {
      name: "jellyfin_playstate",
      description: "Send a playback state command to a Jellyfin session.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          command: { type: "string" },
          seekPositionTicks: { type: "integer", minimum: 0 }
        },
        required: ["command"],
        additionalProperties: false
      }
    },
    {
      name: "jellyfin_command",
      description: "Send a general command to a Jellyfin session.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          command: { type: "string" },
          arguments: { type: "object" }
        },
        required: ["command"],
        additionalProperties: false
      }
    }
  ];
}

function createToolRunner({ client, sessionResolver, defaultUserId }) {
  const handlers = {
    jellyfin_get_me: async () => {
      const resolved = await client.getCurrentUser();
      return {
        user: pickUser(resolved.user),
        source: resolved.source
      };
    },

    jellyfin_list_media: async (args) => {
      const userId = await client.resolveUserId(args.userId || defaultUserId);
      const limit = clampInt(args.limit, 25, 1, 200);
      const startIndex = clampInt(args.startIndex, 0, 0, 1000000);

      const response = await client.listItems({
        UserId: userId,
        Recursive: true,
        IncludeItemTypes: normalizeItemTypes(args.includeItemTypes),
        SearchTerm: args.searchTerm,
        ParentId: args.parentId,
        Limit: limit,
        StartIndex: startIndex,
        SortBy: args.sortBy,
        SortOrder: args.sortOrder,
        Fields: CONTEXT_FIELDS
      });

      return {
        totalRecordCount: response.TotalRecordCount || 0,
        items: (response.Items || []).map(pickItem)
      };
    },

    jellyfin_get_suggestions: async (args) => {
      const userId = await client.resolveUserId(args.userId || defaultUserId);
      const limit = clampInt(args.limit, 20, 1, 100);
      const response = await client.getSuggestions({
        UserId: userId,
        MediaType: args.mediaType,
        Limit: limit
      });
      return {
        items: (response.Items || []).map(pickItem)
      };
    },

    jellyfin_get_movie_recommendations: async (args) => {
      const userId = await client.resolveUserId(args.userId || defaultUserId);
      const categoryLimit = clampInt(args.categoryLimit, 6, 1, 20);
      const itemLimit = clampInt(args.itemLimit, 10, 1, 100);
      const response = await client.getMovieRecommendations({
        UserId: userId,
        CategoryLimit: categoryLimit,
        ItemLimit: itemLimit
      });
      return {
        categories: (response || []).map((bucket) => ({
          categoryId: bucket.CategoryId || null,
          baselineItemName: bucket.BaselineItemName || null,
          items: (bucket.Items || []).map(pickItem)
        }))
      };
    },

    jellyfin_list_sessions: async (args) => {
      const sessions = await client.listSessions();
      const filtered = (sessions || []).filter((s) => {
        if (!args.controllableOnly) {
          return true;
        }
        return s.SupportsRemoteControl !== false;
      });
      return {
        sessions: filtered.map((s) => ({
          id: s.Id,
          userName: s.UserName || null,
          deviceName: s.DeviceName || null,
          deviceId: s.DeviceId || null,
          client: s.Client || null,
          nowPlaying: s.NowPlayingItem ? s.NowPlayingItem.Name : null,
          isPaused: Boolean(s.PlayState && s.PlayState.IsPaused),
          lastActivityDate: s.LastActivityDate || null
        }))
      };
    },

    jellyfin_play: async (args) => {
      ensureArrayOfStrings(args.itemIds, "itemIds");
      const resolved = await sessionResolver.resolveSession({ sessionId: args.sessionId });
      await client.sendPlay(resolved.sessionId, {
        itemIds: args.itemIds,
        startPositionTicks: args.startPositionTicks || 0,
        playCommand: args.playCommand || "PlayNow"
      });
      return {
        ok: true,
        sessionId: resolved.sessionId,
        resolution: resolved.resolution
      };
    },

    jellyfin_play_by_name: async (args) => {
      const query = String(args.query || "").trim();
      if (!query) {
        throw new Error("query is required.");
      }

      const userId = await client.resolveUserId(args.userId || defaultUserId);
      const limit = clampInt(args.limit, 10, 1, 50);
      const includeTypes = normalizeItemTypes(args.includeItemTypes);
      const searchTerms = buildSearchTerms(query);
      const merged = new Map();
      for (const term of searchTerms) {
        const search = await client.listItems({
          UserId: userId,
          Recursive: true,
          SearchTerm: term,
          IncludeItemTypes: includeTypes,
          Limit: limit,
          SortBy: "SortName",
          SortOrder: "Ascending",
          Fields: CONTEXT_FIELDS
        });
        for (const rawItem of search.Items || []) {
          merged.set(rawItem.Id, pickItem(rawItem));
        }
      }
      const candidates = Array.from(merged.values());
      if (candidates.length === 0) {
        const fallback = await client.listItems({
          UserId: userId,
          Recursive: true,
          IncludeItemTypes: includeTypes,
          Limit: 200,
          SortBy: "SortName",
          SortOrder: "Ascending",
          Fields: CONTEXT_FIELDS
        });
        const fallbackCandidates = (fallback.Items || []).map(pickItem);
        const fallbackChoice = chooseBestMatch(fallbackCandidates, query);
        if (!fallbackChoice || scoreMatch(fallbackChoice, normalizeForMatch(query)) <= 0) {
          return {
            ok: false,
            query,
            reason: "No matching media items found."
          };
        }
        candidates.push(fallbackChoice);
      }

      let selected = chooseBestMatch(candidates, query);
      if (!selected) {
        return {
          ok: false,
          query,
          reason: "No matching media items found."
        };
      }
      if (selected.type === "Series") {
        const episodes = await client.listItems({
          UserId: userId,
          Recursive: true,
          ParentId: selected.id,
          IncludeItemTypes: ["Episode"],
          Limit: 1,
          SortBy: "SortName",
          SortOrder: "Ascending",
          Fields: CONTEXT_FIELDS
        });
        if (episodes.Items && episodes.Items[0]) {
          selected = pickItem(episodes.Items[0]);
        }
      }

      const resolved = await sessionResolver.resolveSession({ sessionId: args.sessionId });
      await client.sendPlay(resolved.sessionId, {
        itemIds: [selected.id],
        playCommand: args.playCommand || "PlayNow"
      });

      return {
        ok: true,
        query,
        selected,
        sessionId: resolved.sessionId,
        resolution: resolved.resolution,
        candidates: candidates.slice(0, 5)
      };
    },

    jellyfin_playstate: async (args) => {
      if (!PLAYSTATE_COMMANDS.has(args.command)) {
        throw new Error(`Invalid playstate command: ${args.command}`);
      }
      const resolved = await sessionResolver.resolveSession({ sessionId: args.sessionId });
      await client.sendPlaystate(resolved.sessionId, args.command, {
        SeekPositionTicks: args.seekPositionTicks
      });
      return {
        ok: true,
        sessionId: resolved.sessionId,
        command: args.command,
        resolution: resolved.resolution
      };
    },

    jellyfin_command: async (args) => {
      if (!args.command || typeof args.command !== "string") {
        throw new Error("command is required.");
      }
      const resolved = await sessionResolver.resolveSession({ sessionId: args.sessionId });
      await client.sendCommand(resolved.sessionId, args.command, args.arguments || {});
      return {
        ok: true,
        sessionId: resolved.sessionId,
        command: args.command,
        resolution: resolved.resolution
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

function pickItem(item) {
  return {
    id: item.Id,
    name: item.Name,
    type: item.Type,
    productionYear: item.ProductionYear || null,
    communityRating: item.CommunityRating || null,
    seriesName: item.SeriesName || null,
    seriesId: item.SeriesId || null,
    seasonName: item.SeasonName || null,
    seasonId: item.SeasonId || null,
    seasonNumber: item.ParentIndexNumber ?? null,
    episodeNumber: item.IndexNumber ?? null,
    runTimeTicks: item.RunTimeTicks ?? null
  };
}

function pickUser(user) {
  return {
    id: user.Id,
    name: user.Name,
    primaryImageTag: user.PrimaryImageTag || null
  };
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
}

function ensureArrayOfStrings(value, fieldName) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${fieldName} must be a non-empty array.`);
  }
  for (const entry of value) {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new Error(`${fieldName} must only contain non-empty strings.`);
    }
  }
}

function normalizeItemTypes(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return DEFAULT_INCLUDE_TYPES;
  }
  const clean = value.filter((entry) => typeof entry === "string" && entry.length > 0);
  return clean.length > 0 ? clean : DEFAULT_INCLUDE_TYPES;
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
  const normalizedName = normalizeForMatch(item.name || "");
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
  if (item.type === "Series") {
    score += 20;
  } else if (item.type === "Movie") {
    score += 15;
  } else if (item.type === "Episode") {
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

module.exports = {
  createToolRunner
};
