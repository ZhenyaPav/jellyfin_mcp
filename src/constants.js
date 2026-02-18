"use strict";

const LIMITS = Object.freeze({
  default: 20,
  max: 20
});

const ITEM_TYPES = Object.freeze({
  series: "Series",
  movie: "Movie",
  episode: "Episode",
  audio: "Audio"
});

const DEFAULT_INCLUDE_TYPES = Object.freeze([
  ITEM_TYPES.series,
  ITEM_TYPES.movie,
  ITEM_TYPES.episode,
  ITEM_TYPES.audio
]);

const CONTEXT_FIELDS = Object.freeze([
  "SeriesName",
  "SeriesId",
  "SeasonName",
  "SeasonId",
  "ParentIndexNumber",
  "IndexNumber",
  "RunTimeTicks",
  "CommunityRating",
  "ProductionYear"
]);

const TOOL_NAMES = Object.freeze({
  browse: "jellyfin_browse",
  recommendations: "jellyfin_get_recommendations",
  nextUp: "jellyfin_get_next_up",
  playByName: "jellyfin_play_by_name",
  playbackControl: "jellyfin_playback_control"
});

const PLAYBACK_ACTIONS = Object.freeze({
  pause: "Pause",
  resume: "Unpause",
  stop: "Stop",
  toggle: "PlayPause",
  next: "NextTrack",
  previous: "PreviousTrack"
});

const PLAY_COMMANDS = Object.freeze({
  playNow: "PlayNow"
});

const SESSION_STRATEGIES = Object.freeze({
  active: "active",
  recent: "recent",
  device: "device",
  ask: "ask"
});

const ERRORS = Object.freeze({
  missingQuery: "query is required.",
  noSessions: "No active Jellyfin sessions found.",
  noRemoteSessions: "No remote-controllable Jellyfin sessions found.",
  noActivePlayer: "No active Jellyfin player session found.",
  failedSessionSelect: "Failed to select a Jellyfin session.",
  ambiguousSessions: "Multiple likely sessions; explicit sessionId required.",
  noMatch: "No matching media items found."
});

module.exports = {
  CONTEXT_FIELDS,
  DEFAULT_INCLUDE_TYPES,
  ERRORS,
  ITEM_TYPES,
  LIMITS,
  PLAYBACK_ACTIONS,
  PLAY_COMMANDS,
  SESSION_STRATEGIES,
  TOOL_NAMES
};
