import { Page, Locator, expect } from "@playwright/test";
import {
    navigateToAppClean,
    openTabViaMenu,
} from "../helpers/navigation-helper";

const API_BASE = "http://localhost:8090";

export interface ProjectInfo {
    id: number;
    name: string;
    description?: string;
    notes?: string;
}

export class ProjectsPage {
    readonly page: Page;

    // Locators
    readonly projectGrid: Locator;
    readonly createProjectButton: Locator;
    readonly projectNameInput: Locator;
    readonly projectDescriptionInput: Locator;

    constructor(page: Page) {
        this.page = page;
        this.projectGrid = page.locator(".project-grid, .project-list");
        this.createProjectButton = page.locator(
            'button:has-text("Create Project")',
        );
        this.projectNameInput = page.locator("#project-name");
        this.projectDescriptionInput = page.locator("#project-description");
    }

    async navigateToProjectList(): Promise<void> {
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                await navigateToAppClean(this.page);
                await openTabViaMenu(this.page, "projects", "left");

                // Wait for project data to render (cards or empty state).
                await this.page
                    .locator(".project-grid-card, .project-list-empty")
                    .first()
                    .waitFor({ state: "visible", timeout: 30000 });

                console.log("[Navigation] Navigated to Project List");
                return;
            } catch (error) {
                console.log(
                    `[Navigation] Project list navigation failed (attempt ${attempt}/3): ${error instanceof Error ? error.message.split("\n")[0] : error}`,
                );
                if (attempt < 3) {
                    // Brief pause before retrying to let the system recover.
                    await this.page.waitForTimeout(2000);
                }
            }
        }
        throw new Error("Failed to navigate to project list after 3 attempts");
    }

    async navigateToProjectViewer(projectId: number): Promise<void> {
        // Navigate to the project list first (with retry for lazy chunk loading)
        await this.navigateToProjectList();
        // Click on the project card to open the viewer
        const projectCard = this.page
            .locator(
                `.project-grid-card[data-project-id="${projectId}"], .project-card[data-project-id="${projectId}"], .container-card[data-id="${projectId}"]`,
            )
            .first();
        if (
            await projectCard
                .waitFor({ state: "visible", timeout: 5000 })
                .then(() => true)
                .catch(() => false)
        ) {
            await projectCard.dblclick();
        }
        await this.page.waitForLoadState("domcontentloaded");
    }

    async createProject(
        name: string,
        description?: string,
        metadata?: { notes?: string },
    ): Promise<ProjectInfo> {
        // Delete any stale projects with this name from prior runs to avoid list overflow,
        // which can cause the newly-created card to be outside the rendered DOM.
        const checkResponse = await this.page.request.get(
            `${API_BASE}/projects`,
        );
        if (checkResponse.ok()) {
            const checkData = await checkResponse.json();
            const stale = (checkData.projects || []).filter(
                (p: any) => p.name === name,
            );
            for (const staleProject of stale) {
                await this.page.request.delete(
                    `${API_BASE}/projects/${staleProject.id}`,
                );
                console.log(
                    `[Project] Deleted stale project "${name}" (ID: ${staleProject.id})`,
                );
            }
        }

        // Wait for page to load
        await this.page.waitForSelector(
            ".project-list-header, .project-list-empty, .project-grid",
            { timeout: 10000 },
        );

        // Click create button
        const createButton = this.page
            .locator('button:has-text("Create Project")')
            .first();
        await createButton.waitFor({ state: "visible", timeout: 10000 });
        await createButton.click();
        console.log("[Action] Clicked Create Project button");

        // Wait for dialog
        await this.page.waitForSelector(
            '.p-dialog:has-text("Create New Project")',
            { state: "visible", timeout: 5000 },
        );
        console.log("[Action] Create Project dialog opened");

        // Fill details
        const nameInput = this.page.locator("#project-name");
        await nameInput.waitFor({ state: "visible", timeout: 5000 });
        await nameInput.fill(name);
        console.log(`[Action] Filled project name: ${name}`);

        if (description) {
            const descInput = this.page.locator("#project-description");
            await descInput.fill(description);
            console.log(`[Action] Filled project description: ${description}`);
        }

        if (metadata?.notes) {
            const notesInput = this.page.locator("#project-notes");
            await notesInput.fill(metadata.notes);
            console.log(`[Action] Filled project notes: ${metadata.notes}`);
        }

        // Click Create button and wait for API response
        const dialogCreateBtn = this.page.locator(
            '.p-dialog-footer button:has-text("Create")',
        );
        const createResponsePromise = this.page.waitForResponse(
            (resp) =>
                resp.url().includes("/projects") &&
                resp.request().method() === "POST",
            { timeout: 15000 },
        );
        await dialogCreateBtn.click();
        console.log("[Action] Clicked Create button in dialog");
        await createResponsePromise;
        console.log("[Action] Create project API response received");

        // Wait for dialog to close
        await this.page.waitForSelector(
            '.p-dialog:has-text("Create New Project")',
            { state: "hidden", timeout: 30000 },
        );
        console.log("[Action] Dialog closed");

        // Get project ID from API
        const response = await this.page.request.get(`${API_BASE}/projects`);
        const projects = await response.json();
        const project = projects.projects.find((p: any) => p.name === name);

        // Wait for project card to appear using data-project-id
        if (project?.id) {
            await this.page.waitForSelector(
                `.project-grid-card[data-project-id="${project.id}"]`,
                { state: "visible", timeout: 10000 },
            );
        } else {
            await this.page.waitForSelector(
                `.project-grid-card:has-text("${name}")`,
                { state: "visible", timeout: 10000 },
            );
        }
        console.log(`[Action] Project card "${name}" visible`);

        console.log(
            `[Project] Created project "${name}" with ID: ${project?.id}`,
        );
        return { id: project?.id, name, description, notes: metadata?.notes };
    }

    async openProject(projectName: string, projectId?: number): Promise<void> {
        const projectCard = this.getProjectCard(projectName, projectId);

        // Wait for the specific card to be visible before clicking
        await projectCard.waitFor({ state: "visible", timeout: 30000 });
        await projectCard.click();
        await this.page.waitForLoadState("domcontentloaded");
        console.log(`[Navigation] Opened project: ${projectName}`);
    }

    async deleteProject(
        projectName: string,
        projectId?: number,
    ): Promise<void> {
        const projectCard = this.getProjectCard(projectName, projectId);
        const deleteBtn = projectCard.locator(
            ".delete-button, button:has(.pi-trash)",
        );
        await deleteBtn.click();

        // Confirm deletion if dialog appears
        const confirmBtn = this.page.locator(
            '.p-dialog button:has-text("Delete"), .p-dialog button:has-text("Yes")',
        );
        if (
            await confirmBtn
                .waitFor({ state: "visible", timeout: 5000 })
                .then(() => true)
                .catch(() => false)
        ) {
            await confirmBtn.click();
        }

        // Wait for project card to be hidden after deletion
        await projectCard.waitFor({ state: "hidden", timeout: 25000 });
        console.log(`[Action] Deleted project: ${projectName}`);
    }

    getProjectCard(projectName: string, projectId?: number): Locator {
        if (projectId) {
            return this.page.locator(
                `.project-grid-card[data-project-id="${projectId}"]`,
            );
        }
        return this.page
            .locator(`.project-grid-card:has-text("${projectName}")`)
            .first();
    }

    async isProjectVisible(
        projectName: string,
        projectId?: number,
    ): Promise<boolean> {
        const projectCard = this.getProjectCard(projectName, projectId);
        return await projectCard.isVisible();
    }

    private async assertDecodedImage(
        image: Locator,
        context: string,
        expectedFileId?: number,
    ): Promise<void> {
        await expect(image).toBeVisible({ timeout: 15000 });
        await expect
            .poll(
                async () => {
                    return await image.evaluate((img: HTMLImageElement) => {
                        return img.complete && img.naturalWidth > 0;
                    });
                },
                {
                    message: `Waiting for ${context} image to decode`,
                    timeout: 15000,
                    intervals: [500, 1000, 2000],
                },
            )
            .toBe(true);

        const details = await image.evaluate((img: HTMLImageElement) => ({
            src: img.getAttribute("src"),
            currentSrc: img.currentSrc,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
        }));

        if (expectedFileId !== undefined) {
            expect(details.currentSrc || details.src).toContain(
                `/files/${expectedFileId}`,
            );
        }

        console.log(
            `[UI] ${context} image loaded: ${details.naturalWidth}x${details.naturalHeight} (${details.currentSrc || details.src})`,
        );
    }

    async assertProjectCardCustomThumbnailLoaded(
        projectName: string,
        expectedFileId: number,
        projectId?: number,
    ): Promise<void> {
        const card = this.getProjectCard(projectName, projectId);
        await expect(card).toBeVisible({ timeout: 15000 });
        await this.assertDecodedImage(
            card.locator("img").first(),
            `project card for \"${projectName}\"`,
            expectedFileId,
        );
    }

    async assertProjectDetailCustomThumbnailLoaded(
        projectName: string,
        expectedFileId: number,
    ): Promise<void> {
        const viewer = this.page.locator(".container-viewer").first();
        await expect(viewer).toBeVisible({ timeout: 15000 });
        await this.assertDecodedImage(
            viewer.locator(`img[alt="${projectName}"]`).first(),
            `project detail for \"${projectName}\"`,
            expectedFileId,
        );
    }
}
