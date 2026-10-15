import { APIRequestContext, expect } from "@playwright/test";

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";

/**
 * A raw MCP client for the batch-3 coverage that the shared {@link McpClient}
 * deliberately does not expose: `tools/list` (to prove an agent-scoped session
 * only carries its own tools) and an unasserted `tools/call` (to observe the
 * JSON-RPC error the SDK returns for a tool outside that session's set).
 *
 * It speaks the same Streamable HTTP handshake as the shared helper, kept
 * separate so batch 1/2 code is not disturbed.
 */
export class RawMcpClient {
    private sessionId: string | null = null;
    private protocolVersion = "2025-06-18";
    private nextId = 1;

    constructor(
        private readonly request: APIRequestContext,
        private readonly endpoint: string = `${API_BASE}/mcp`,
    ) {}

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

    /** One JSON-RPC round trip, asserted only to have produced a message. */
    async rpc(
        method: string,
        params: unknown,
    ): Promise<{ status: number; message: any }> {
        const response = await this.request.post(this.endpoint, {
            headers: this.headers(),
            data: { jsonrpc: "2.0", id: this.nextId++, method, params },
        });
        const text = await response.text();
        const sessionId = response.headers()["mcp-session-id"];
        if (sessionId) {
            this.sessionId = sessionId;
        }
        return { status: response.status(), message: RawMcpClient.parseBody(text) };
    }

    async connect(): Promise<this> {
        const result = (await this.rpc("initialize", {
            protocolVersion: this.protocolVersion,
            capabilities: {},
            clientInfo: { name: "modelibr-e2e-raw", version: "1.0.0" },
        })).message?.result;
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

    /** The tools this session advertises. */
    async listTools(): Promise<Array<{ name: string; description?: string }>> {
        const { message } = await this.rpc("tools/list", {});
        expect(
            message.error,
            `tools/list returned an error: ${JSON.stringify(message.error)}`,
        ).toBeUndefined();
        return message.result?.tools ?? [];
    }

    /** Calls a tool and returns the JSON-RPC error (if any) plus any text payload. */
    async callToolRaw(
        name: string,
        args: Record<string, unknown>,
    ): Promise<{ httpStatus: number; error?: any; isError?: boolean; value?: any }> {
        const { status, message } = await this.rpc("tools/call", {
            name,
            arguments: args,
        });
        if (message.error) {
            return { httpStatus: status, error: message.error };
        }
        const result = message.result;
        const text = result?.content?.find(
            (part: { type: string }) => part.type === "text",
        )?.text;
        return {
            httpStatus: status,
            isError: result?.isError,
            value: text ? JSON.parse(text) : result,
        };
    }
}

/** Connects a raw client to an agent-scoped route such as `/mcp/agents/stylist`. */
export async function connectRawMcp(
    request: APIRequestContext,
    endpoint?: string,
): Promise<RawMcpClient> {
    return new RawMcpClient(request, endpoint).connect();
}
