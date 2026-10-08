import { APIRequestContext, expect } from "@playwright/test";
import crypto from "crypto";

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";

/**
 * A minimal client for the Web API's MCP endpoint (Streamable HTTP), so a
 * scenario can drive the agent tools the way an agent does: one session, then
 * `tools/call` per tool.
 *
 * Kept deliberately small - initialize, the initialized notification, and tool
 * calls. The server answers a request either as plain JSON or as a one-event
 * SSE stream, so both are read.
 */
export class McpClient {
    private sessionId: string | null = null;
    private protocolVersion = "2025-06-18";
    private nextId = 1;

    constructor(
        private readonly request: APIRequestContext,
        private readonly endpoint = `${API_BASE}/mcp`,
    ) {}

    /** A fresh idempotency key: every agent write needs one. */
    static key(prefix = "e2e"): string {
        return `${prefix}-${crypto.randomUUID()}`;
    }

    private headers(): Record<string, string> {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            "MCP-Protocol-Version": this.protocolVersion,
        };
        if (this.sessionId) {
            headers["Mcp-Session-Id"] = this.sessionId;
        }
        return headers;
    }

    private static parseBody(text: string): any {
        const trimmed = text.trim();
        if (trimmed.startsWith("{")) {
            return JSON.parse(trimmed);
        }
        // SSE: the JSON-RPC response is the data of the (last) message event.
        const data = trimmed
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice("data:".length).trim())
            .filter(Boolean);
        expect(
            data.length,
            `The MCP endpoint answered with no JSON-RPC message: ${text}`,
        ).toBeGreaterThan(0);
        return JSON.parse(data[data.length - 1]);
    }

    private async rpc(method: string, params: unknown): Promise<any> {
        const response = await this.request.post(this.endpoint, {
            headers: this.headers(),
            data: { jsonrpc: "2.0", id: this.nextId++, method, params },
        });
        const text = await response.text();
        expect(
            response.ok(),
            `MCP ${method} failed: ${response.status()} ${text}`,
        ).toBe(true);
        const sessionId = response.headers()["mcp-session-id"];
        if (sessionId) {
            this.sessionId = sessionId;
        }
        const message = McpClient.parseBody(text);
        expect(
            message.error,
            `MCP ${method} returned a JSON-RPC error: ${JSON.stringify(message.error)}`,
        ).toBeUndefined();
        return message.result;
    }

    async connect(): Promise<this> {
        const result = await this.rpc("initialize", {
            protocolVersion: this.protocolVersion,
            capabilities: {},
            clientInfo: { name: "modelibr-e2e", version: "1.0.0" },
        });
        if (result?.protocolVersion) {
            this.protocolVersion = result.protocolVersion;
        }
        const notified = await this.request.post(this.endpoint, {
            headers: this.headers(),
            data: { jsonrpc: "2.0", method: "notifications/initialized" },
        });
        expect(
            notified.ok(),
            `MCP initialized notification failed: ${notified.status()}`,
        ).toBe(true);
        return this;
    }

    /**
     * Calls one tool and returns what it answered, parsed from its text
     * content. A tool that is not registered (write tools are opt-in) fails
     * here with the server's own message rather than as an undefined result.
     */
    async callTool(name: string, args: Record<string, unknown>): Promise<any> {
        const result = await this.rpc("tools/call", {
            name,
            arguments: args,
        });
        expect(
            result?.isError,
            `MCP tool ${name} failed: ${JSON.stringify(result?.content)}`,
        ).not.toBe(true);
        const text = result?.content?.find(
            (part: { type: string }) => part.type === "text",
        )?.text;
        expect(text, `MCP tool ${name} returned no text content`).toBeTruthy();
        return JSON.parse(text);
    }
}

/** A connected client on the scenario's own request context. */
export async function connectMcp(request: APIRequestContext): Promise<McpClient> {
    return new McpClient(request).connect();
}
