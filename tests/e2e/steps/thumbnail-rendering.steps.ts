import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";

interface RegenerationContext {
    modelId: number | null;
    initialProcessedAt: string | null;
    enqueuedCount: number;
}

const ctx: RegenerationContext = {
    modelId: null,
    initialProcessedAt: null,
    enqueuedCount: 0,
};

Given("at least one model with a thumbnail exists", async ({ page }) => {
    // Use the first existing model (created by @setup features) as the test
    // subject. The bulk regen-all targets every model anyway; this just picks
    // a stable handle for polling.
    const response = await page.request.get(
        `${API_BASE}/models?page=1&pageSize=10`,
    );
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    // /models returns { items, totalCount, page, pageSize, totalPages } when
    // paginated. The earlier `body.models ?? body` fallback fell through to
    // the response object itself and produced an Array.isArray = false.
    const models: Array<{ id: number }> = Array.isArray(body)
        ? body
        : (body.items ?? body.models ?? []);
    expect(
        Array.isArray(models),
        `Expected an array of models, got: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);
    expect(
        models.length,
        `No models found via /models?page=1&pageSize=10 — the @setup phase probably didn't run before this @slow scenario`,
    ).toBeGreaterThan(0);
    ctx.modelId = models[0].id;
    console.log(`[Rendering] Using model id=${ctx.modelId} as test subject`);

    const thumbResponse = await page.request.get(
        `${API_BASE}/models/${ctx.modelId}/thumbnail`,
    );
    if (thumbResponse.ok()) {
        const thumb = await thumbResponse.json();
        ctx.initialProcessedAt = thumb.processedAt ?? null;
    } else {
        ctx.initialProcessedAt = null;
    }
});

When(
    "I set the thumbnail size to {string} via API",
    async ({ page }, sizeStr: string) => {
        const size = Number(sizeStr);
        const response = await page.request.put(`${API_BASE}/settings`, {
            data: {
                maxFileSizeBytes: 1073741824,
                maxThumbnailSizeBytes: 10485760,
                thumbnailFrameCount: 30,
                thumbnailSize: size,
                generateThumbnailOnUpload: true,
                generateAnimatedThumbnail: true,
                textureProxySize: 512,
            },
        });
        expect(response.ok()).toBeTruthy();
        console.log(`[Rendering] thumbnailSize → ${size}`);
    },
);

When(
    "I set the thumbnail frame count to {string} and animated to {string} via API",
    async ({ page }, frameCountStr: string, animatedStr: string) => {
        const frameCount = Number(frameCountStr);
        const animated = animatedStr === "true";
        const response = await page.request.put(`${API_BASE}/settings`, {
            data: {
                maxFileSizeBytes: 1073741824,
                maxThumbnailSizeBytes: 10485760,
                thumbnailFrameCount: frameCount,
                thumbnailSize: 256,
                generateThumbnailOnUpload: true,
                generateAnimatedThumbnail: animated,
                textureProxySize: 512,
            },
        });
        expect(response.ok()).toBeTruthy();
        console.log(
            `[Rendering] frameCount → ${frameCount}, animated → ${animated}`,
        );
    },
);

When("I regenerate all thumbnails via API", async ({ page }) => {
    const response = await page.request.post(
        `${API_BASE}/thumbnails/regenerate-all`,
    );
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    ctx.enqueuedCount = body.enqueuedCount ?? 0;
    expect(ctx.enqueuedCount).toBeGreaterThan(0);
    console.log(`[Rendering] enqueued ${ctx.enqueuedCount} regen jobs`);
});

When("I wait for the regeneration to complete", async ({ page }) => {
    if (ctx.modelId === null) {
        throw new Error("modelId not set — Background step did not run");
    }
    const modelId = ctx.modelId;
    const initial = ctx.initialProcessedAt;

    // Poll until the model's thumbnail moves to Ready AND its ProcessedAt
    // timestamp moves past the initial value (meaning it's been re-rendered,
    // not just observed in the prior state).
    await expect
        .poll(
            async () => {
                const r = await page.request.get(
                    `${API_BASE}/models/${modelId}/thumbnail`,
                );
                if (!r.ok()) return "not-found";
                const t = await r.json();
                if (t.status !== "Ready") return `status=${t.status}`;
                if (initial && t.processedAt === initial) return "stale";
                return "ready";
            },
            {
                message: `model ${modelId} thumbnail did not transition to a fresh Ready state`,
                timeout: 120000,
                intervals: [2000, 3000, 3000, 5000],
            },
        )
        .toBe("ready");
});

Then(
    "the served thumbnail PNG should be {int} by {int} pixels",
    async ({ page }, expectedWidth: number, expectedHeight: number) => {
        if (ctx.modelId === null) {
            throw new Error("modelId not set");
        }
        const response = await page.request.get(
            `${API_BASE}/models/${ctx.modelId}/thumbnail/png-file`,
        );
        expect(response.ok()).toBeTruthy();
        const buffer = Buffer.from(await response.body());

        // PNG signature is bytes 0–7. The IHDR chunk follows at byte 8:
        //   length (4) + "IHDR" (4) + width (4) + height (4) ...
        // So width is at offset 16, height at offset 20, both big-endian uint32.
        const signature = buffer.subarray(0, 8).toString("hex");
        expect(signature).toBe("89504e470d0a1a0a");

        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        console.log(
            `[Rendering] served PNG dimensions: ${width}x${height} (expected ${expectedWidth}x${expectedHeight})`,
        );
        expect(width).toBe(expectedWidth);
        expect(height).toBe(expectedHeight);
    },
);

Then(
    "the latest worker job should have rendered exactly {int} frames",
    async ({ page }, expectedFrames: number) => {
        if (ctx.modelId === null) {
            throw new Error("modelId not set");
        }
        const response = await page.request.get(
            `${API_BASE}/models/${ctx.modelId}/thumbnail/file`,
        );
        expect(response.ok()).toBeTruthy();
        const buffer = Buffer.from(await response.body());

        // WebP signature: bytes 0–3 = "RIFF", 8–11 = "WEBP".
        expect(buffer.subarray(0, 4).toString("ascii")).toBe("RIFF");
        expect(buffer.subarray(8, 12).toString("ascii")).toBe("WEBP");

        // Animated WebP encodes each frame as an "ANMF" chunk. Count them.
        const target = Buffer.from("ANMF", "ascii");
        let frameCount = 0;
        let i = 12;
        while (i <= buffer.length - 4) {
            if (buffer.compare(target, 0, 4, i, i + 4) === 0) {
                frameCount++;
                i += 4;
            } else {
                i++;
            }
        }
        console.log(
            `[Rendering] WebP ANMF chunk count: ${frameCount} (expected ${expectedFrames})`,
        );
        expect(frameCount).toBe(expectedFrames);
    },
);
