import { Page, expect } from "@playwright/test";

/**
 * Scenes tab: the list of scenes and the editor for one of them.
 *
 * Selectors are `data-testid` per the current contract - this feature is new,
 * so there is no grandfathered CSS-class locator to inherit. The exceptions are
 * PrimeReact's body-mounted dialog chrome (`.p-dialog*`), which is the accepted
 * carve-out.
 */
export class ScenesPage {
    private readonly page: Page;

    private readonly list = '[data-testid="scene-list"]';
    private readonly newSceneButton = '[data-testid="scene-list-new"]';
    private readonly sceneTile = '[data-testid="scene-tile"]';
    private readonly createConfirm = '[data-testid="scene-create-confirm"]';
    private readonly nameInput = "#scene-name";

    private readonly editor = '[data-testid="scene-editor"]';
    private readonly saveButton = '[data-testid="scene-editor-save"]';
    private readonly undoButton = '[data-testid="scene-editor-undo"]';
    private readonly hierarchy = '[data-testid="scene-hierarchy"]';
    private readonly nodeRow = '[data-testid="scene-node-row"]';
    private readonly properties = '[data-testid="scene-properties"]';
    private readonly pickerTile = '[data-testid="scene-picker-tile"]';
    private readonly pickerSearch =
        '[data-testid="scene-asset-picker"] input[type="text"]';

    private readonly projectChip = '[data-testid="scene-project-chip"]';
    private readonly projectSelect = '[data-testid="scene-project-select"]';
    private readonly projectBlocked = '[data-testid="scene-project-blocked"]';
    private readonly projectError = '[data-testid="scene-project-error"]';
    private readonly linkPending = '[data-testid="scene-editor-link-pending"]';

    private readonly materials = '[data-testid="scene-node-materials"]';
    private readonly choices = '[data-testid="scene-choices"]';
    private readonly materialPicker = '[data-testid="scene-material-picker"]';
    private readonly materialEntry =
        '[data-testid="scene-material-picker-entry"]';

    constructor(page: Page) {
        this.page = page;
    }

    async goto(): Promise<void> {
        const { navigateToTab } = await import("../helpers/navigation-helper");
        await navigateToTab(this.page, "scenes");
        await expect(this.page.locator(this.list)).toBeVisible();
    }

    async createScene(name: string): Promise<void> {
        await this.page.locator(this.newSceneButton).first().click();
        await expect(this.page.locator(this.nameInput)).toBeVisible();
        await this.page.locator(this.nameInput).fill(name);
        await this.page.locator(this.createConfirm).click();

        // Creating opens the new scene straight away - that is the flow, not an
        // incidental redirect, so the editor is the assertion that it worked.
        await expect(this.page.locator(this.editor)).toBeVisible();
    }

    async backToList(): Promise<void> {
        await this.page.getByRole("button", { name: "Back to scenes" }).click();
        await expect(this.page.locator(this.list)).toBeVisible();
    }

    async openScene(name: string): Promise<void> {
        await this.page
            .locator(this.sceneTile)
            .filter({ hasText: name })
            .first()
            .click();
        await expect(this.page.locator(this.editor)).toBeVisible();
    }

    sceneTileByName(name: string) {
        return this.page.locator(this.sceneTile).filter({ hasText: name });
    }

    async searchLibrary(term: string): Promise<void> {
        await this.page.locator(this.pickerSearch).fill(term);
    }

    /** Places the first library result whose tile names `modelName`. */
    async placeModel(modelName: string): Promise<void> {
        const tile = this.page
            .locator(this.pickerTile)
            .filter({ hasText: modelName })
            .first();
        await expect(tile).toBeVisible();

        // The click issues the asset-facts lookup that decides the node's
        // resting height; scoping the wait to it keeps this off a generic
        // spinner that other queries also drive.
        await Promise.all([
            this.page.waitForResponse(
                response =>
                    response.url().includes("/scenes/asset-facts") &&
                    response.request().method() === "GET",
            ),
            tile.click(),
        ]);
    }

    async addBlockoutBox(): Promise<void> {
        await this.page.getByRole("button", { name: "Blockout box" }).click();
    }

    /**
     * Dresses the selected node with a material by name.
     *
     * `slot` names one of the model's own material slots; omitted, this binds
     * the node's default binding, which dresses every slot no override names.
     */
    async dressSelectedNode(materialName: string, slot = ""): Promise<void> {
        await expect(this.page.locator(this.materials)).toBeVisible();
        await this.page
            .locator(`[data-testid="scene-node-materials-pick-${slot}"]`)
            .click();

        const picker = this.page.locator(this.materialPicker);
        await expect(picker).toBeVisible();

        // Searched rather than scrolled: the picker reads the merged library,
        // which in a real library is every global material as well as every
        // parameter one, so the first page need not hold the one wanted.
        await picker.locator('input[type="text"]').fill(materialName);

        const entry = picker
            .locator(this.materialEntry)
            .filter({ hasText: materialName })
            .first();
        await expect(entry).toBeVisible();
        await entry.click();

        // The picker closes on pick, which is also the signal that the binding
        // reached the draft document rather than only the picker's own state.
        await expect(picker).toBeHidden();
    }

    /**
     * The element naming what dresses a slot.
     *
     * Returned as a locator rather than as text, so callers assert against it
     * and wait. The row renders as soon as the binding lands, but the *name*
     * arrives with the material's own detail fetch a moment later - until then
     * the row honestly says "Material 2". Reading the text once caught that
     * intermediate state.
     */
    boundMaterialLocator(slot = "") {
        return this.page
            .locator(
                `[data-testid="scene-node-materials-row"][data-slot="${slot}"]`,
            )
            .locator(".scene-node-materials-bound-name");
    }

    async clearSlotMaterial(slot = ""): Promise<void> {
        await this.page
            .locator(`[data-testid="scene-node-materials-clear-${slot}"]`)
            .click();
    }

    nodeRows() {
        return this.page.locator(this.nodeRow);
    }

    nodeRowById(nodeId: string) {
        return this.page.locator(`${this.nodeRow}[data-node-id="${nodeId}"]`);
    }

    async selectNode(nodeId: string): Promise<void> {
        await this.nodeRowById(nodeId).locator("button").first().click();
        await expect(this.page.locator(this.properties)).toBeVisible();
    }

    /**
     * Types a value into one axis of a transform field and commits it.
     *
     * Typed rather than `fill()`ed: PrimeReact's InputNumber maintains its own
     * value from key events, so a programmatic `fill()` updates the DOM input
     * without the component ever emitting `onValueChange` - the edit would
     * appear on screen and never reach the document.
     */
    async setTransformAxis(
        field: "Position" | "Rotation" | "Scale",
        axis: "x" | "y" | "z",
        value: number,
    ): Promise<void> {
        const input = this.page.locator(`#${field}-${axis}`);
        await input.click();
        await input.press("ControlOrMeta+a");
        await this.page.keyboard.type(String(value));
        // InputNumber commits on blur.
        await input.press("Tab");

        await expect(input).toHaveValue(String(value));
    }

    async readTransformAxis(
        field: "Position" | "Rotation" | "Scale",
        axis: "x" | "y" | "z",
    ): Promise<string> {
        return (await this.page.locator(`#${field}-${axis}`).inputValue()) ?? "";
    }

    async save(): Promise<void> {
        const save = this.page.locator(this.saveButton);
        await expect(save).toBeEnabled();

        await Promise.all([
            this.page.waitForResponse(
                response =>
                    /\/scenes\/\d+\/document$/.test(new URL(response.url()).pathname) &&
                    response.request().method() === "PUT",
            ),
            save.click(),
        ]);

        // The button reads "Saved" only once the draft is no longer dirty, so
        // it doubles as the assertion that the save landed.
        await expect(save).toHaveText(/Saved/);
    }

    async undo(): Promise<void> {
        await this.page.locator(this.undoButton).click();
    }

    async undoIsEnabled(): Promise<boolean> {
        return this.page.locator(this.undoButton).isEnabled();
    }

    /**
     * Links the open scene to a project through the brief panel.
     *
     * Linking is a direct server write that moves the scene's revision, so the
     * editor holds every other edit until the refetch it queues has landed and
     * the draft has been reseeded. Waiting for the hold to clear is what makes
     * this step safe to follow with an edit - and it is the behaviour under
     * test, not incidental synchronisation.
     */
    async linkToProject(projectName: string): Promise<void> {
        await this.page.locator(this.projectChip).click();
        await this.page.locator(this.projectSelect).click();
        await this.page
            .getByRole("option", { name: projectName, exact: true })
            .click();

        // The hold appears and then goes; both halves matter. A link that never
        // held would mean the serialization is not running at all.
        await expect(this.page.locator(this.linkPending)).toBeHidden({
            timeout: 15000,
        });
        await expect(this.page.locator(this.projectError)).toHaveCount(0);
    }

    /** The label on the project chip - the project the scene now belongs to. */
    async linkedProjectName(): Promise<string> {
        return (await this.page.locator(this.projectChip).innerText()).trim();
    }

    /** Why linking is refused right now, or null when it is offered. */
    async projectLinkBlockedReason(): Promise<string | null> {
        await this.page.locator(this.projectChip).click();
        const blocked = this.page.locator(this.projectBlocked);
        if ((await blocked.count()) === 0) {
            return null;
        }
        return (await blocked.innerText()).trim();
    }

    async projectSelectIsEnabled(): Promise<boolean> {
        return this.page.locator(this.projectSelect).isEnabled();
    }

    /**
     * Switches to another already-open tab and back, WITHOUT reloading.
     *
     * The dock renders only the active tab, so this is what unmounts the
     * editor - the interaction that used to discard the open scene and its
     * unsaved draft. A reload would not test the same thing: it drops the whole
     * client, and no in-memory draft is expected to survive that.
     */
    async switchAwayAndBack(otherTabType: string): Promise<void> {
        const { clickTab, openTabViaMenu, countTabsByType } = await import(
            "../helpers/navigation-helper"
        );

        if ((await countTabsByType(this.page, otherTabType)) === 0) {
            await openTabViaMenu(this.page, otherTabType, "left");
        } else {
            await clickTab(this.page, otherTabType, "left");
        }

        await expect(this.page.locator(this.editor)).toHaveCount(0);

        await clickTab(this.page, "scenes", "left");
        await expect(this.page.locator(this.editor)).toBeVisible();
    }

    /** True while the editor holds edits that have not been saved. */
    async hasUnsavedChanges(): Promise<boolean> {
        return (
            (await this.page.locator(this.saveButton).innerText()).trim() ===
            "Save"
        );
    }

    editorLocator() {
        return this.page.locator(this.editor);
    }

    choicesLocator() {
        return this.page.locator(this.choices);
    }

    /** One candidate card, addressed the way the user says it: `streetlight/B`. */
    candidateCard(candidateRef: string) {
        return this.page.locator(
            `[data-testid="scene-choices-card-${candidateRef}"]`,
        );
    }

    /**
     * Chooses a candidate and waits for the write, not for a spinner.
     *
     * A choice is written to the server immediately rather than into the
     * editor's draft, so the scene detail refetch that follows it is what
     * "the choice landed" actually means.
     */
    async chooseCandidate(candidateRef: string): Promise<void> {
        const button = this.page.locator(
            `[data-testid="scene-choices-choose-${candidateRef}"]`,
        );
        await expect(button).toBeEnabled();

        await Promise.all([
            this.page.waitForResponse(
                response =>
                    response.url().includes("/choice") &&
                    response.request().method() === "PUT" &&
                    response.ok(),
            ),
            button.click(),
        ]);
    }

    /** The user's "none of these", with the reason the form requires. */
    async rejectWholeRound(slotId: string, reason: string): Promise<void> {
        await this.page
            .locator(`[data-testid="scene-choices-none-${slotId}"]`)
            .click();

        await this.page.locator(`#reason-${slotId}`).fill(reason);

        await Promise.all([
            this.page.waitForResponse(
                response =>
                    response.url().includes("/rejections") &&
                    response.request().method() === "POST" &&
                    response.ok(),
            ),
            this.page
                .locator(
                    `[data-testid="scene-choices-reject-confirm-${slotId}"]`,
                )
                .click(),
        ]);
    }

    hierarchyLocator() {
        return this.page.locator(this.hierarchy);
    }
}
