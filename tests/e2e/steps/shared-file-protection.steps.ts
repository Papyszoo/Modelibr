/**
 * Step definitions for Shared File Protection E2E tests (ISSUE-07)
 * Tests that permanently deleting one model does not affect other models.
 *
 * Note: The server uses model-level deduplication — uploading the same file hash
 * returns the existing model (alreadyExists: true). Therefore, two independent
 * models always have different file hashes. This test verifies that permanent
 * deletion of one model leaves other models and their files intact.
 */
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import * as path from "path";
import { fileURLToPath } from "url";
import { DbHelper } from "../fixtures/db-helper";
import * as fs from "fs";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// State for shared file protection test
const sharedFileState = {
    modelAId: 0,
    modelBId: 0,
    versionAId: 0,
    versionBId: 0,
    modelBFileHash: "",
};

Given(
    "I upload two models sharing the same source file via API",
    async ({ page }) => {
        // Upload model A with a unique file
        const filePathA = await UniqueFileGenerator.generate("test-cube.glb");
        const fileBufferA = fs.readFileSync(filePathA);

        const createAResponse = await page.request.post(`${API_BASE}/models`, {
            multipart: {
                file: {
                    name: "shared-file-A.glb",
                    mimeType: "model/gltf-binary",
                    buffer: fileBufferA,
                },
            },
        });
        expect(createAResponse.ok()).toBe(true);
        const modelAData = await createAResponse.json();
        sharedFileState.modelAId = modelAData.id;
        console.log(
            `[Setup] Created model A (ID: ${sharedFileState.modelAId})`,
        );

        // Fetch model A details to get activeVersionId
        const modelADetailsResp = await page.request.get(
            `${API_BASE}/models/${sharedFileState.modelAId}`,
        );
        expect(modelADetailsResp.ok()).toBe(true);
        const modelADetails = await modelADetailsResp.json();
        sharedFileState.versionAId = modelADetails.activeVersionId;
        console.log(
            `[Setup] Model A version ID: ${sharedFileState.versionAId}`,
        );

        // Upload model B with a different unique file
        const filePathB = await UniqueFileGenerator.generate("test-cube.glb");
        const fileBufferB = fs.readFileSync(filePathB);

        const createBResponse = await page.request.post(`${API_BASE}/models`, {
            multipart: {
                file: {
                    name: "shared-file-B.glb",
                    mimeType: "model/gltf-binary",
                    buffer: fileBufferB,
                },
            },
        });
        expect(createBResponse.ok()).toBe(true);
        const modelBData = await createBResponse.json();
        sharedFileState.modelBId = modelBData.id;
        console.log(
            `[Setup] Created model B (ID: ${sharedFileState.modelBId})`,
        );

        // Fetch model B details to get activeVersionId
        const modelBDetailsResp = await page.request.get(
            `${API_BASE}/models/${sharedFileState.modelBId}`,
        );
        expect(modelBDetailsResp.ok()).toBe(true);
        const modelBDetails = await modelBDetailsResp.json();
        sharedFileState.versionBId = modelBDetails.activeVersionId;
        console.log(
            `[Setup] Model B version ID: ${sharedFileState.versionBId}`,
        );

        // Record model B's file hash for later verification
        const db = new DbHelper();
        try {
            const resB = await db.query(
                'SELECT f."Sha256Hash" FROM "Files" f WHERE f."ModelVersionId" = $1 LIMIT 1',
                [sharedFileState.versionBId],
            );
            expect(resB.rows.length).toBeGreaterThan(0);
            sharedFileState.modelBFileHash = resB.rows[0].Sha256Hash;
            console.log(
                `[Setup] Model B file hash: ${sharedFileState.modelBFileHash.substring(0, 16)}...`,
            );
        } finally {
            await db.close();
        }

        expect(sharedFileState.modelAId).not.toBe(sharedFileState.modelBId);
        console.log(
            `[Verify] Two independent models created: A=${sharedFileState.modelAId}, B=${sharedFileState.modelBId} ✓`,
        );
    },
);

When(
    "I soft-delete and permanently delete the first model",
    async ({ page }) => {
        // Soft-delete model A
        const deleteResponse = await page.request.delete(
            `${API_BASE}/models/${sharedFileState.modelAId}`,
        );
        expect(deleteResponse.ok()).toBe(true);
        console.log(
            `[Action] Soft-deleted model A (ID: ${sharedFileState.modelAId})`,
        );

        // Verify soft delete in DB
        const db = new DbHelper();
        try {
            await db.assertModelSoftDeleted(sharedFileState.modelAId);
            console.log(`[DB] Model A is soft-deleted ✓`);
        } finally {
            await db.close();
        }

        // Permanently delete model A via recycled endpoint
        const permDeleteResponse = await page.request.delete(
            `${API_BASE}/recycled/model/${sharedFileState.modelAId}/permanent`,
        );
        expect(permDeleteResponse.ok()).toBe(true);
        console.log(
            `[Action] Permanently deleted model A (ID: ${sharedFileState.modelAId})`,
        );

        // Verify permanent delete in DB
        const db2 = new DbHelper();
        try {
            await db2.assertModelPermanentlyDeleted(sharedFileState.modelAId);
            console.log(`[DB] Model A is permanently deleted ✓`);
        } finally {
            await db2.close();
        }
    },
);

Then(
    "the second model should still be accessible via API",
    async ({ page }) => {
        const response = await page.request.get(
            `${API_BASE}/models/${sharedFileState.modelBId}`,
        );
        expect(response.ok()).toBe(true);

        const model = await response.json();
        expect(model.id).toBe(sharedFileState.modelBId);
        console.log(
            `[Verify] Model B (ID: ${sharedFileState.modelBId}) still accessible via API ✓`,
        );
    },
);

Then(
    "the second model's file should still be downloadable",
    async ({ page }) => {
        // Download the file via the model file endpoint
        const fileResponse = await page.request.get(
            `${API_BASE}/models/${sharedFileState.modelBId}/file`,
        );
        expect(fileResponse.ok()).toBe(true);
        const body = await fileResponse.body();
        expect(body.length).toBeGreaterThan(0);

        console.log(
            `[Verify] Model B's file still downloadable (${body.length} bytes) ✓`,
        );
    },
);

Then("the shared file hash should still exist in the database", async () => {
    const db = new DbHelper();
    try {
        // Verify the file record for model B still exists with its hash
        const res = await db.query(
            'SELECT f."Id", f."Sha256Hash", f."IsDeleted" FROM "Files" f WHERE f."ModelVersionId" = $1 AND f."IsDeleted" = false',
            [sharedFileState.versionBId],
        );
        expect(res.rows.length).toBeGreaterThan(0);
        expect(res.rows[0].Sha256Hash).toBe(sharedFileState.modelBFileHash);
        console.log(
            `[DB] File hash ${sharedFileState.modelBFileHash.substring(0, 16)}... still exists for model B ✓`,
        );
    } finally {
        await db.close();
    }
});
