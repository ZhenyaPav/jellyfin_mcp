"use strict";

function createMcpServer({ serverInfo, tools }) {
  const protocolVersion = "2024-11-05";

  async function onRequest(msg) {
    const { id, method, params } = msg;
    if (typeof method !== "string") {
      return jsonRpcError(id, -32600, "Invalid request");
    }

    try {
      if (method === "initialize") {
        return jsonRpcResult(id, {
          protocolVersion,
          capabilities: {
            tools: {
              listChanged: false
            }
          },
          serverInfo
        });
      }
      if (method === "tools/list") {
        return jsonRpcResult(id, {
          tools: tools.definitions
        });
      }
      if (method === "tools/call") {
        const name = params && params.name;
        const args = params && params.arguments;
        if (!name || typeof name !== "string") {
          return jsonRpcError(id, -32602, "Missing tool name");
        }
        const result = await tools.run(name, args || {});
        return jsonRpcResult(id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ],
          isError: false
        });
      }
      if (method === "ping") {
        return jsonRpcResult(id, {});
      }
      if (id === undefined || id === null) {
        return null;
      }
      return jsonRpcError(id, -32601, `Method not found: ${method}`);
    } catch (err) {
      const data = {};
      if (err && typeof err === "object") {
        if (err.code) {
          data.code = err.code;
        }
        if (err.choices) {
          data.choices = err.choices;
        }
      }
      return jsonRpcResult(id, {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: err instanceof Error ? err.message : String(err),
                ...data
              },
              null,
              2
            )
          }
        ],
        isError: true
      });
    }
  }

  return {
    onRequest
  };
}

function jsonRpcResult(id, result) {
  return {
    jsonrpc: "2.0",
    id,
    result
  };
}

function jsonRpcError(id, code, message) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message
    }
  };
}

class McpStdioTransport {
  constructor(server) {
    this.server = server;
    this.buffer = "";
    this.contentLength = null;
  }

  start(input, output) {
    input.on("data", (chunk) => this.onData(chunk, output));
    input.on("error", (err) => {
      process.stderr.write(`stdin error: ${err.message}\n`);
    });
  }

  onData(chunk, output) {
    this.buffer += Buffer.from(chunk).toString("utf8");
    while (true) {
      if (this.contentLength !== null) {
        if (this.buffer.length < this.contentLength) {
          return;
        }
        const bodyText = this.buffer.slice(0, this.contentLength);
        this.buffer = this.buffer.slice(this.contentLength);
        this.contentLength = null;
        this.handleJsonText(bodyText, output);
        continue;
      }

      if (looksLikeHeaders(this.buffer)) {
        const headerBoundary = this.buffer.indexOf("\r\n\r\n");
        if (headerBoundary === -1) {
          return;
        }
        const headerText = this.buffer.slice(0, headerBoundary);
        const headers = parseHeaders(headerText);
        const lengthHeader = headers["content-length"];
        this.buffer = this.buffer.slice(headerBoundary + 4);
        if (!lengthHeader) {
          continue;
        }
        this.contentLength = Number.parseInt(lengthHeader, 10);
        if (!Number.isFinite(this.contentLength) || this.contentLength < 0) {
          this.contentLength = null;
        }
        continue;
      }

      const lineEnd = this.buffer.indexOf("\n");
      if (lineEnd === -1) {
        return;
      }
      const line = this.buffer.slice(0, lineEnd).replace(/\r$/, "");
      this.buffer = this.buffer.slice(lineEnd + 1);
      if (line.trim() === "") {
        continue;
      }
      this.handleJsonText(line, output);
    }
  }

  handleJsonText(text, output) {
    let msg;
    try {
      msg = JSON.parse(text);
    } catch (err) {
      process.stderr.write(`invalid json: ${err.message}\n`);
      return;
    }

    Promise.resolve(this.server.onRequest(msg))
      .then((response) => {
        if (!response) {
          return;
        }
        writeMessage(output, response);
      })
      .catch((err) => {
        process.stderr.write(`request handler error: ${err.message}\n`);
      });
  }
}

function looksLikeHeaders(text) {
  if (!text || text.length === 0) {
    return false;
  }
  if (text.startsWith("{") || text.startsWith("[")) {
    return false;
  }
  const firstLineEnd = text.indexOf("\n");
  if (firstLineEnd === -1) {
    return text.toLowerCase().startsWith("content-length:");
  }
  const firstLine = text.slice(0, firstLineEnd).replace(/\r$/, "").toLowerCase();
  return firstLine.startsWith("content-length:");
}

function parseHeaders(headerText) {
  const headers = {};
  const lines = headerText.split("\r\n");
  for (const line of lines) {
    const i = line.indexOf(":");
    if (i === -1) {
      continue;
    }
    const key = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    headers[key] = value;
  }
  return headers;
}

function writeMessage(output, payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "utf8");
  output.write(Buffer.concat([header, body]));
}

module.exports = {
  createMcpServer,
  McpStdioTransport,
  writeMessage
};
