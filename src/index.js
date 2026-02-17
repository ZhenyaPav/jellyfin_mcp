"use strict";

const { loadConfig } = require("./env");
const { JellyfinClient } = require("./jellyfin-client");
const { SessionResolver } = require("./session-resolver");
const { createToolRunner } = require("./tools");
const { createMcpServer, McpStdioTransport } = require("./mcp-server");

function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }

  const client = new JellyfinClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    timeoutMs: config.timeoutMs,
    userId: config.userId
  });

  const resolver = new SessionResolver({
    client,
    strategy: config.sessionStrategy,
    deviceIdHint: config.deviceIdHint
  });

  const tools = createToolRunner({
    client,
    sessionResolver: resolver,
    defaultUserId: config.userId
  });

  const server = createMcpServer({
    serverInfo: {
      name: "jellyfin-mcp",
      version: "0.1.0"
    },
    tools
  });

  const transport = new McpStdioTransport(server);
  transport.start(process.stdin, process.stdout);
}

if (require.main === module) {
  main();
}

module.exports = {
  main
};
