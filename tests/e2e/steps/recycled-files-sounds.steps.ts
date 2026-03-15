import { createBdd } from "playwright-bdd";
import { expect, test } from "@playwright/test";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { DbHelper } from "../fixtures/db-helper";
import fs from "fs/promises";

const { Given: GivenBdd, When: WhenBdd, Then: ThenBdd } = createBdd();

// State for API-based permanent delete
const apiPermDeleteState = {
    soundId: 0,
};

// ============================================
// Sound Recycling Steps (API-based Permanent Delete)
// ============================================

GivenBdd(
    "I create and soft-delete a sound {string} via API",
    async ({ page }, name: string) => {
        const baseUrl = process.env.API_BASE_URL || "http://localhost:8090";

        // Generate unique file to avoid deduplication
        const filePath = await UniqueFileGenerator.generate("test-tone.wav");
        const fileBuffer = await fs.readFile(filePath);

        // Upload a sound
        const createRes = await page.request.post(
            `${baseUrl}/sounds/with-file`,
            {
                multipart: {
                    file: {
                        name: `${name}.wav`,
                        mimeType: "audio/wav",
                        buffer: fileBuffer,
                    },
                },
            },
        );
        expect(createRes.ok()).toBe(true);

        // Get the sound ID from the list
        const listRes = await page.request.get(`${baseUrl}/sounds`);
        expect(listRes.ok()).toBe(true);
        const listData = await listRes.json();
        const sounds = listData.sounds || [];
        const sound = sounds.find(
            (s: any) => s.name === name || s.name === `${name}.wav`,
        );
        apiPermDeleteState.soundId = sound?.id ?? sounds[sounds.length - 1]?.id;
        console.log(
            `[Setup] Created sound "${name}" (ID: ${apiPermDeleteState.soundId})`,
        );

        // Soft-delete via API
        const deleteRes = await page.request.delete(
            `${baseUrl}/sounds/${apiPermDeleteState.soundId}/soft`,
        );
        expect(deleteRes.ok()).toBe(true);
        console.log(`[Setup] Soft-deleted sound "${name}"`);

        // Verify it appears in the recycled bin
        const recycledRes = await page.request.get(`${baseUrl}/recycled`);
        expect(recycledRes.ok()).toBe(true);
        const recycled = await recycledRes.json();
        const found = (recycled.sounds || []).some(
            (s: any) => s.id === apiPermDeleteState.soundId,
        );
        expect(found).toBe(true);
        console.log(`[Verify] Sound appears in recycled bin`);
    },
);

WhenBdd("I permanently delete the recycled sound via API", async ({ page }) => {
    const baseUrl = process.env.API_BASE_URL || "http://localhost:8090";
    const res = await page.request.delete(
        `${baseUrl}/recycled/sound/${apiPermDeleteState.soundId}/permanent`,
    );
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    console.log(
        `[Action] Permanently deleted sound ${apiPermDeleteState.soundId}`,
    );
});

ThenBdd("the sound should no longer exist in the database", async () => {
    const db = new DbHelper();
    try {
        const res = await db.query(
            'SELECT "Id" FROM "Sounds" WHERE "Id" = $1',
            [apiPermDeleteState.soundId],
        );
        expect(res.rows.length).toBe(0);
        console.log(
            `[DB] Sound ${apiPermDeleteState.soundId} permanently deleted from DB`,
        );
    } finally {
        await db.close();
    }
});
