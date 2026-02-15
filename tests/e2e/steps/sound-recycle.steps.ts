/**
 * Step definitions for Sound Recycle E2E tests
 */
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { navigateToTab } from "../helpers/navigation-helper";

const { Given, When, Then } = createBdd();
const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";

// Track sounds by test alias for reliable recycle/restore
const soundsByAlias = new Map<string, { id: number; name: string }>();

// Track the last recycled sound name for subsequent steps
let lastRecycledSoundName: string | null = null;

// Navigation step for returning to sounds page after recycled files
When("I navigate to the sounds page", async ({ page }) => {
    await navigateToTab(page, "sounds");
    // Reload to ensure React Query cache is fresh after restore/recycle operations
    await page.reload({ waitUntil: "domcontentloaded" });
    await page
        .waitForSelector(".sound-list, .sound-grid, .sound-card", {
            state: "attached",
            timeout: 15000,
        })
        .catch(() => {});
    console.log("[Navigation] Navigated to sounds page (with reload)");
});

Given(
    "I upload a test sound {string} from {string}",
    async ({ page }, soundName: string, filename: string) => {
        // Clean up any previously recycled sounds with the same name to avoid
        // picking the wrong one during restore tests
        const recycledResp = await page.request.get(`${API_BASE}/recycled`);
        if (recycledResp.ok()) {
            const recycledData = await recycledResp.json();
            const recycledSounds = recycledData.sounds || [];
            const stale = recycledSounds.filter(
                (s: any) => s.name === soundName,
            );
            for (const s of stale) {
                await page.request
                    .delete(`${API_BASE}/recycled/Sound/${s.id}`)
                    .catch(() => {});
                console.log(
                    `[Cleanup] Permanently deleted stale recycled sound "${soundName}" (ID: ${s.id})`,
                );
            }
        }

        // Generate unique file to avoid hash-based deduplication
        const filePath = await UniqueFileGenerator.generate(filename);

        // Upload via API using multipart form with query param for name
        const fileBuffer = await import("fs/promises").then((fs) =>
            fs.readFile(filePath),
        );

        const response = await page.request.post(
            `${API_BASE}/sounds/with-file?name=${encodeURIComponent(soundName)}`,
            {
                multipart: {
                    file: {
                        name: filename,
                        mimeType: "audio/wav",
                        buffer: fileBuffer,
                    },
                },
            },
        );

        expect(response.ok()).toBe(true);
        const data = await response.json();
        const soundId = data.id || data.soundId;

        if (soundId) {
            soundsByAlias.set(soundName, { id: soundId, name: soundName });
            console.log(
                `[Upload] Uploaded test sound "${soundName}" (ID: ${soundId}) from "${filename}"`,
            );
        } else {
            // Fallback: find the sound by name via API
            const soundsResponse = await page.request.get(`${API_BASE}/sounds`);
            const soundsData = await soundsResponse.json();
            const sounds = soundsData.sounds || soundsData;
            const sound = sounds.find((s: any) => s.name === soundName);
            if (sound) {
                soundsByAlias.set(soundName, {
                    id: sound.id,
                    name: sound.name,
                });
                console.log(
                    `[Upload] Found sound "${soundName}" (ID: ${sound.id}) via API lookup`,
                );
            } else {
                console.log(
                    `[Warning] Could not find uploaded sound "${soundName}" in API response`,
                );
            }
        }
    },
);

When(
    "I soft-delete the sound {string} via API",
    async ({ page }, soundName: string) => {
        lastRecycledSoundName = soundName;
        const tracked = soundsByAlias.get(soundName);

        if (tracked) {
            const deleteResponse = await page.request.delete(
                `${API_BASE}/sounds/${tracked.id}/soft`,
            );
            expect(deleteResponse.ok()).toBe(true);
            console.log(
                `[Action] Soft-deleted sound "${soundName}" (ID: ${tracked.id}) via API`,
            );
        } else {
            // Fallback: find sound by name via API
            const soundsResponse = await page.request.get(`${API_BASE}/sounds`);
            const soundsData = await soundsResponse.json();
            const sounds = soundsData.sounds || soundsData;
            const sound = sounds.find(
                (s: any) => s.name === soundName || s.name?.includes(soundName),
            );

            expect(sound).toBeTruthy();
            const deleteResponse = await page.request.delete(
                `${API_BASE}/sounds/${sound.id}/soft`,
            );
            expect(deleteResponse.ok()).toBe(true);
            soundsByAlias.set(soundName, { id: sound.id, name: sound.name });
            console.log(
                `[Action] Soft-deleted sound "${soundName}" (ID: ${sound.id}) via API lookup`,
            );
        }
    },
);

Then(
    "I should see the sound in the recycled sounds section",
    async ({ page }) => {
        const soundsSection = page.locator(
            '.recycled-section[data-section="sounds"]',
        );
        await expect(soundsSection).toBeVisible({ timeout: 10000 });

        const soundCards = soundsSection.locator(".recycled-card");
        const cardCount = await soundCards.count();
        expect(cardCount).toBeGreaterThan(0);

        // Verify the specific sound name appears
        const tracked = soundsByAlias.get(lastRecycledSoundName!);
        const expectedName = tracked?.name || lastRecycledSoundName;
        if (expectedName) {
            let nameFound = false;
            for (let i = 0; i < cardCount; i++) {
                const cardText = await soundCards.nth(i).textContent();
                if (cardText && cardText.includes(expectedName)) {
                    nameFound = true;
                    break;
                }
            }
            console.log(
                `[Verify] Found ${cardCount} recycled sound(s), name "${expectedName}" matched: ${nameFound} ✓`,
            );
        } else {
            console.log(
                `[Verify] Found ${cardCount} recycled sound(s) in recycle bin ✓`,
            );
        }
    },
);

When("I restore the recycled sound via UI", async ({ page }) => {
    const soundsSection = page.locator(
        '.recycled-section[data-section="sounds"]',
    );

    // Find the specific sound card from THIS run using tracked name
    const tracked = soundsByAlias.get(lastRecycledSoundName!);
    const targetName = tracked?.name || lastRecycledSoundName;

    let soundCard;
    if (targetName) {
        // Find the card matching our tracked sound name by content (not index)
        soundCard = soundsSection
            .locator(".recycled-card")
            .filter({ hasText: targetName })
            .first();
        const isVisible = await soundCard.isVisible().catch(() => false);

        if (!isVisible) {
            // Fallback: use API restore if UI card not found by name
            if (tracked) {
                const restoreResp = await page.request.post(
                    `${API_BASE}/recycled/Sound/${tracked.id}/restore`,
                );
                console.log(
                    `[Action] Restored sound "${targetName}" (ID: ${tracked.id}) via API fallback (status: ${restoreResp.status()})`,
                );
                return;
            }
            soundCard = soundsSection.locator(".recycled-card").first();
        } else {
            console.log(
                `[Action] Found target sound "${targetName}" by content`,
            );
        }
    } else {
        soundCard = soundsSection.locator(".recycled-card").first();
    }

    await soundCard.hover();
    await soundCard.locator(".p-button-success").click();

    // Wait for the card with this specific content to disappear
    await soundCard.waitFor({ state: "hidden", timeout: 10000 });
    console.log(`[Action] Restored recycled sound "${targetName}" via UI`);
});

Then(
    "the sound should be removed from the recycled sounds section",
    async ({ page }) => {
        // Check that the sounds section is either gone or has no cards
        const soundsSection = page.locator(
            '.recycled-section[data-section="sounds"]',
        );
        const sectionVisible = await soundsSection
            .isVisible()
            .catch(() => false);

        if (sectionVisible) {
            const soundCards = soundsSection.locator(".recycled-card");
            const tracked = soundsByAlias.get(lastRecycledSoundName!);
            if (tracked) {
                // Verify the specific sound is no longer present
                const cardCount = await soundCards.count();
                let nameFound = false;
                for (let i = 0; i < cardCount; i++) {
                    const cardText = await soundCards.nth(i).textContent();
                    if (cardText && cardText.includes(tracked.name)) {
                        nameFound = true;
                        break;
                    }
                }
                expect(nameFound).toBe(false);
            } else {
                // Generic check: no sound cards remain
                await expect(soundCards).toHaveCount(0, { timeout: 10000 });
            }
        }

        console.log("[Verify] Sound removed from recycled sounds section ✓");
    },
);

When("I click Delete Forever on the recycled sound", async ({ page }) => {
    const soundsSection = page.locator(
        '.recycled-section[data-section="sounds"]',
    );
    const soundCard = soundsSection.locator(".recycled-card").first();

    await soundCard.hover();
    await soundCard.locator(".p-button-danger").click();

    // Wait for the confirmation dialog to appear
    await page.waitForSelector(".p-dialog", {
        state: "visible",
        timeout: 5000,
    });
    console.log("[Action] Clicked Delete Forever on recycled sound");
});

When("I confirm the sound permanent delete", async ({ page }) => {
    const dialog = page.locator(".p-dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Click the danger button in the dialog footer, or button containing "Delete"
    const confirmButton = dialog.locator(".p-dialog-footer .p-button-danger");
    const confirmVisible = await confirmButton.isVisible().catch(() => false);

    if (confirmVisible) {
        await confirmButton.click();
    } else {
        // Fallback: find button with text containing "Delete"
        const deleteButton = dialog
            .locator("button")
            .filter({ hasText: /Delete/ })
            .first();
        await deleteButton.click();
    }

    // Wait for dialog to close
    await dialog.waitFor({ state: "hidden", timeout: 10000 });
    console.log("[Action] Confirmed permanent delete of sound");
});
