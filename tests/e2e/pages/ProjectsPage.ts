import { Page, Locator } from "@playwright/test";
import { navigateToTab } from "../helpers/navigation-helper";

const API_BASE = "http://localhost:8090";

export interface ProjectInfo {
    id: number;
    name: string;
    description?: string;
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
        await navigateToTab(this.page, "projects");
        await this.page.waitForLoadState("domcontentloaded");
        console.log("[Navigation] Navigated to Project List");
    }

    async navigateToProjectViewer(projectId: number): Promise<void> {
        // Navigate to the project list first, then open the project by clicking
        await navigateToTab(this.page, "projects");
        await this.page.waitForLoadState("domcontentloaded");
        // Click on the project card to open the viewer
        const projectCard = this.page
            .locator(
                `.project-card[data-project-id="${projectId}"], .container-card[data-id="${projectId}"]`,
            )
            .first();
        if (await projectCard.isVisible({ timeout: 5000 }).catch(() => false)) {
            await projectCard.dblclick();
        }
        await this.page.waitForLoadState("domcontentloaded");
    }

    async createProject(
        name: string,
        description?: string,
    ): Promise<ProjectInfo> {
        // Check if project already exists via API (idempotent)
        const checkResponse = await this.page.request.get(
            `${API_BASE}/projects`,
        );
        if (checkResponse.ok()) {
            const checkData = await checkResponse.json();
            const existing = (checkData.projects || []).find(
                (p: any) => p.name === name,
            );
            if (existing) {
                console.log(
                    `[Project] Project "${name}" already exists (ID: ${existing.id}), skipping creation`,
                );
                return { id: existing.id, name, description };
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

        // Click Create button
        const dialogCreateBtn = this.page.locator(
            '.p-dialog-footer button:has-text("Create")',
        );
        await dialogCreateBtn.click();
        console.log("[Action] Clicked Create button in dialog");

        // Wait for dialog to close
        await this.page.waitForSelector(
            '.p-dialog:has-text("Create New Project")',
            { state: "hidden", timeout: 10000 },
        );
        console.log("[Action] Dialog closed");

        // Wait for project card to appear
        await this.page.waitForSelector(
            `.project-grid-card:has-text("${name}")`,
            { state: "visible", timeout: 10000 },
        );
        console.log(`[Action] Project card "${name}" visible`);

        // Get project ID from API
        const response = await this.page.request.get(`${API_BASE}/projects`);
        const projects = await response.json();
        const project = projects.projects.find((p: any) => p.name === name);

        console.log(
            `[Project] Created project "${name}" with ID: ${project?.id}`,
        );
        return { id: project?.id, name, description };
    }

    async openProject(projectName: string): Promise<void> {
        const projectCard = this.getProjectCard(projectName);
        await projectCard.click();
        await this.page.waitForLoadState("domcontentloaded");
        console.log(`[Navigation] Opened project: ${projectName}`);
    }

    async deleteProject(projectName: string): Promise<void> {
        const projectCard = this.getProjectCard(projectName);
        const deleteBtn = projectCard.locator(
            ".delete-button, button:has(.pi-trash)",
        );
        await deleteBtn.click();

        // Confirm deletion if dialog appears
        const confirmBtn = this.page.locator(
            '.p-dialog button:has-text("Delete"), .p-dialog button:has-text("Yes")',
        );
        if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await confirmBtn.click();
        }

        // Optional: project card may already be hidden after deletion
        await projectCard
            .waitFor({ state: "hidden", timeout: 10000 })
            .catch(() => {});
        console.log(`[Action] Deleted project: ${projectName}`);
    }

    getProjectCard(projectName: string): Locator {
        return this.page
            .locator(`.project-grid-card:has-text("${projectName}")`)
            .first();
    }

    async isProjectVisible(projectName: string): Promise<boolean> {
        const projectCard = this.getProjectCard(projectName);
        return await projectCard.isVisible();
    }
}
