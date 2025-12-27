import { Page } from "@playwright/test";

export class SignalRHelper {
    constructor(private page: Page) {}

    /**
     * Waits for a specific SignalR message to be received by the client.
     * @param hubUrl The URL of the hub (e.g., '/thumbnailHub')
     * @param target The method name being called (e.g., 'ThumbnailStatusChanged')
     * @param predicate Optional function to filter messages
     * @param timeout Timeout in milliseconds
     */
    async waitForMessage(
        hubUrl: string,
        target: string,
        predicate?: (args: any) => boolean,
        timeout = 60000
    ) {
        const wsPromise = this.page.waitForEvent("websocket", {
            predicate: (ws) => ws.url().includes(hubUrl),
            timeout,
        });

        const ws = await wsPromise;

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(
                    new Error(
                        `Timeout waiting for SignalR message "${target}" on ${hubUrl}`
                    )
                );
            }, timeout);

            ws.on("framereceived", (frame) => {
                const payload = frame.payload as string | Buffer;
                const text = payload.toString();

                // SignalR messages are separated by \x1e
                const messages = text.split("\x1e").filter((m) => m.length > 0);

                for (const msg of messages) {
                    try {
                        const json = JSON.parse(msg);
                        if (json.type === 1 && json.target === target) {
                            const args = json.arguments[0];
                            if (predicate && !predicate(args)) {
                                continue;
                            }
                            clearTimeout(timer);
                            resolve(args);
                        }
                    } catch (e) {
                        // Not a JSON message or incomplete
                    }
                }
            });
        });
    }
}
