import path from "path";
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { DbHelper } from "../fixtures/db-helper";
import { getScenarioState } from "../fixtures/shared-state";
import { UniqueFileGenerator } from "../fixtures/unique-file-generator";
import { EnvironmentMapsPage } from "../pages/EnvironmentMapsPage";
import { RecycledFilesPage } from "../pages/RecycledFilesPage";

const { Given, When, Then } = createBdd();

const API_BASE = process.env.API_BASE_URL || "http://localhost:8090";

async function getEnvironmentMapDetail(page: any, environmentMapId: number) {
    const response = await page.request.get(
        `${API_BASE}/environment-maps/${environmentMapId}`,
    );
    expect(response.ok()).toBe(true);
    return response.json();
}

async function assertEnvironmentMapDbState(
    environmentMapId: number,
    isDeleted: boolean,
): Promise<void> {
    const db = new DbHelper();

    try {
        const result = await db.query(
            'SELECT "Id", "DeletedAt" FROM "EnvironmentMaps" WHERE "Id" = $1',
            [environmentMapId],
        );

        expect(result.rows.length).toBe(1);
        const deletedAt =
            result.rows[0].DeletedAt ??
            result.rows[0].deletedAt ??
            result.rows[0].deletedat ??
            null;
        if (isDeleted) {
            expect(deletedAt).not.toBeNull();
        } else {
            expect(deletedAt).toBeNull();
        }
    } finally {
        await db.close();
    }
}

async function getActiveVariantCountFromDb(
    environmentMapId: number,
): Promise<number> {
    const db = new DbHelper();

    try {
        const result = await db.query(
            'SELECT COUNT(*) AS count FROM "EnvironmentMapVariants" WHERE "EnvironmentMapId" = $1 AND "DeletedAt" IS NULL',
            [environmentMapId],
        );

        return Number(result.rows[0].count);
    } finally {
        await db.close();
    }
}

function getStoredEnvironmentMap(page: any, alias: string) {
    const environmentMap = getScenarioState(page).getEnvironmentMap(alias);
    expect(environmentMap, `Environment map "${alias}" not found in state`).toBeDefined();
    return environmentMap!;
}

Given("I am on the environment maps page", async ({ page }) => {
    const environmentMapsPage = new EnvironmentMapsPage(page);
    await environmentMapsPage.goto();
});

When(
    "I upload an environment map {string} from {string}",
    async ({ page }, alias: string, filename: string) => {
        const environmentMapsPage = new EnvironmentMapsPage(page);
        const filePath = await UniqueFileGenerator.generate(filename, {
            uniqueFilename: true,
        });
        const actualName = path.parse(filePath).name;

        const { environmentMapId } =
            await environmentMapsPage.uploadEnvironmentMap(filePath);

        await expect
            .poll(async () => {
                const detail = await getEnvironmentMapDetail(page, environmentMapId);
                return detail?.name;
            })
            .toBe(actualName);

        await assertEnvironmentMapDbState(environmentMapId, false);

        getScenarioState(page).saveEnvironmentMap(alias, {
            id: environmentMapId,
            name: actualName,
            variantCount: 1,
        });
    },
);

Then(
    "the environment map {string} should be visible in the environment map list",
    async ({ page }, alias: string) => {
        const environmentMapsPage = new EnvironmentMapsPage(page);
        const environmentMap = getStoredEnvironmentMap(page, alias);
        await environmentMapsPage.waitForEnvironmentMapByName(environmentMap.name);
    },
);

When("I open the environment map {string}", async ({ page }, alias: string) => {
    const environmentMapsPage = new EnvironmentMapsPage(page);
    const environmentMap = getStoredEnvironmentMap(page, alias);
    await environmentMapsPage.openEnvironmentMapByName(environmentMap.name);
});

Then(
    "the environment map viewer for {string} should be visible",
    async ({ page }, alias: string) => {
        const environmentMapsPage = new EnvironmentMapsPage(page);
        const environmentMap = getStoredEnvironmentMap(page, alias);
        await environmentMapsPage.waitForViewer(environmentMap.name);
    },
);

Then(
    "the environment map {string} should show the preview size option {string}",
    async ({ page }, alias: string, sizeLabel: string) => {
        const environmentMapsPage = new EnvironmentMapsPage(page);
        const environmentMap = getStoredEnvironmentMap(page, alias);

        await environmentMapsPage.waitForViewer(environmentMap.name);
        await environmentMapsPage.waitForPreviewSizeLabel(sizeLabel);

        await expect
            .poll(async () => {
                const detail = await getEnvironmentMapDetail(page, environmentMap.id);
                return (detail.variants ?? []).some(
                    (variant: any) => variant.sizeLabel === sizeLabel,
                );
            })
            .toBe(true);
    },
);

When(
    "I upload a {string} variant for the environment map {string} from {string}",
    async ({ page }, sizeLabel: string, alias: string, filename: string) => {
        const environmentMap = getStoredEnvironmentMap(page, alias);
        const environmentMapsPage = new EnvironmentMapsPage(page);
        const filePath = await UniqueFileGenerator.generate(filename, {
            uniqueFilename: true,
        });

        await environmentMapsPage.uploadVariant(filePath, sizeLabel);

        await expect
            .poll(async () => {
                const detail = await getEnvironmentMapDetail(page, environmentMap.id);
                return {
                    variantCount: detail.variantCount,
                    hasLabel: (detail.variants ?? []).some(
                        (variant: any) => variant.sizeLabel === sizeLabel,
                    ),
                };
            })
            .toEqual({ variantCount: 2, hasLabel: true });

        const variantCountInDb = await getActiveVariantCountFromDb(environmentMap.id);
        expect(variantCountInDb).toBe(2);

        getScenarioState(page).saveEnvironmentMap(alias, {
            ...environmentMap,
            variantCount: 2,
        });
    },
);

Then(
    "the environment map {string} should show the preview size options {string} and {string}",
    async ({ page }, alias: string, firstLabel: string, secondLabel: string) => {
        const environmentMapsPage = new EnvironmentMapsPage(page);
        const environmentMap = getStoredEnvironmentMap(page, alias);

        await environmentMapsPage.waitForViewer(environmentMap.name);
        await environmentMapsPage.waitForPreviewSizeLabel(firstLabel);
        await environmentMapsPage.waitForPreviewSizeLabel(secondLabel);
    },
);

Then(
    "the environment map {string} should show {int} variants in the viewer",
    async ({ page }, alias: string, expectedCount: number) => {
        const environmentMapsPage = new EnvironmentMapsPage(page);
        const environmentMap = getStoredEnvironmentMap(page, alias);

        await environmentMapsPage.waitForViewer(environmentMap.name);
        await expect
            .poll(async () => environmentMapsPage.getViewerVariantCount())
            .toBe(expectedCount);
    },
);

When(
    "I recycle the environment map {string}",
    async ({ page }, alias: string) => {
        const environmentMapsPage = new EnvironmentMapsPage(page);
        const environmentMap = getStoredEnvironmentMap(page, alias);

        await environmentMapsPage.goto();
        await environmentMapsPage.recycleEnvironmentMapByName(environmentMap.name);

        await expect
            .poll(async () => {
                const response = await page.request.get(`${API_BASE}/recycled`);
                const recycled = await response.json();
                return (recycled.environmentMaps ?? []).some(
                    (item: any) => item.id === environmentMap.id,
                );
            })
            .toBe(true);

        await assertEnvironmentMapDbState(environmentMap.id, true);
    },
);

Then(
    "the environment map {string} should not be visible in the environment map list",
    async ({ page }, alias: string) => {
        const environmentMapsPage = new EnvironmentMapsPage(page);
        const environmentMap = getStoredEnvironmentMap(page, alias);

        await expect(
            environmentMapsPage.getEnvironmentMapCardByName(environmentMap.name),
        ).toBeHidden({ timeout: 15000 });
    },
);

Then(
    "the environment map {string} should be visible in recycled files",
    async ({ page }, alias: string) => {
        const environmentMap = getStoredEnvironmentMap(page, alias);
        const recycledFilesPage = new RecycledFilesPage(page);

        await expect
            .poll(async () => {
                const response = await page.request.get(`${API_BASE}/recycled`);
                const recycled = await response.json();
                return (recycled.environmentMaps ?? []).some(
                    (item: any) =>
                        item.id === environmentMap.id &&
                        item.name === environmentMap.name,
                );
            })
            .toBe(true);

        await expect(
            recycledFilesPage.getEnvironmentMapCardByName(environmentMap.name),
        ).toBeVisible({ timeout: 15000 });
    },
);
