"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { PassThrough } = require("node:stream");
const { createMcpServer, McpStdioTransport, writeMessage } = require("../src/mcp-server");

function parseFramedMessages(buffer) {
  const messages = [];
  let remaining = buffer;
  while (remaining.length > 0) {
    const headerEnd = remaining.indexOf("\r\n\r\n");
    if (headerEnd === -1) {
      break;
    }
    const headers = remaining.slice(0, headerEnd).toString("utf8");
    const match = headers.match(/Content-Length:\s*(\d+)/i);
    assert.ok(match);
    const len = Number.parseInt(match[1], 10);
    const start = headerEnd + 4;
    const end = start + len;
    const body = remaining.slice(start, end).toString("utf8");
    messages.push(JSON.parse(body));
    remaining = remaining.slice(end);
  }
  return messages;
}

test("mcp server handles initialize and tools/list", async () => {
  const server = createMcpServer({
    serverInfo: { name: "test", version: "0.0.0" },
    tools: {
      definitions: [{ name: "hello", inputSchema: { type: "object" } }],
      async run() {
        return {};
      }
    }
  });

  const input = new PassThrough();
  const output = new PassThrough();
  const transport = new McpStdioTransport(server);
  transport.start(input, output);

  const chunks = [];
  output.on("data", (c) => chunks.push(c));

  writeMessage(input, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  writeMessage(input, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });

  await new Promise((resolve) => setTimeout(resolve, 20));
  const messages = parseFramedMessages(Buffer.concat(chunks));
  assert.equal(messages.length, 2);
  assert.equal(messages[0].id, 1);
  assert.equal(messages[1].id, 2);
  assert.equal(messages[1].result.tools[0].name, "hello");
});
