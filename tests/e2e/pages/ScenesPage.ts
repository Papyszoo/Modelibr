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

    /**
     * Clicks a library tile expecting the click to do NOTHING.
     *
     * Deliberately not `placeModel`: that one waits for the asset-facts request
     * the placement issues, and the whole point here is that no request is made.
     * The tile stays in the DOM while editing is held - it simply loses its
     * handler - so the click is real and its absence of effect is the assertion.
     */
    async placeModelWhileHeld(modelName: string): Promise<void> {
        const tile = this.page
            .locator(this.pickerTile)
            .filter({ hasText: modelName })
            .first();
        await expect(tile).toBeVisible();
        await tile.click();
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
     * Records every appearance of one element from inside the page, so that a
     * short-lived state can be asserted without a poller having to catch it.
     *
     * Playwright's `waitFor` polls, and the serialization hold is up for as long
     * as one write plus one refetch takes - which on a warm local stack can be
     * under a poll interval. Asserting it with `toBeVisible` therefore failed on
     * a correct app roughly one run in two: the hold appeared, went, and the
     * poller looked twice at an empty gap. A MutationObserver cannot miss it,
     * because it is told about the insertion rather than asked afterwards.
     */
    private async watchForElement(testId: string): Promise<void> {
        await this.page.evaluate(id => {
            const selector = `[data-testid="${id}"]`;
            const store = window as unknown as {
                __modelibrSeen?: Record<string, boolean>;
                __modelibrWatcher?: MutationObserver;
            };
            store.__modelibrSeen = { ...(store.__modelibrSeen ?? {}), [id]: false };
            store.__modelibrWatcher?.disconnect();

            // Already up when the watch started counts too.
            if (document.querySelector(selector)) {
                store.__modelibrSeen[id] = true;
            }

            // The ADDED NODES, not a re-query of the live DOM: the callback is
            // batched, so by the time it runs the element may already be gone -
            // which is exactly the case this exists to record.
            const matches = (nodes: NodeList) =>
                Array.from(nodes).some(
                    node =>
                        node instanceof Element &&
                        (node.matches(selector) || node.querySelector(selector) !== null),
                );

            store.__modelibrWatcher = new MutationObserver(records => {
                for (const record of records) {
                    if (matches(record.addedNodes)) {
                        store.__modelibrSeen![id] = true;
                    }
                }
            });
            store.__modelibrWatcher.observe(document.body, {
                childList: true,
                subtree: true,
            });
        }, testId);
    }

    /** Whether `watchForElement` has seen that element since the watch began. */
    private async elementWasSeen(testId: string): Promise<boolean> {
        return this.page.evaluate(id => {
            const store = window as unknown as {
                __modelibrSeen?: Record<string, boolean>;
            };
            return store.__modelibrSeen?.[id] === true;
        }, testId);
    }

    /**
     * Links the open scene to a project through the brief panel, and asserts the
     * serialization hold both APPEARS and then goes.
     *
     * Linking is a direct server write that moves the scene's revision, so the
     * editor holds every other edit until authoritative scene data has landed and
     * the draft has been reseeded on it. Both halves of that are the behaviour
     * under test, not incidental synchronisation.
     *
     * The comment here used to say "the hold appears and then goes; both halves
     * matter" above an assertion that only waited for it to be HIDDEN - which a
     * hold that never appeared satisfies just as well, and which is what a
     * serialization that had stopped running entirely would look like. The
     * appearance is now RECORDED by a mutation observer armed before the click
     * rather than polled for afterwards; see `watchForElement` for why polling
     * for it failed on a working app.
     */
    async linkToProject(projectName: string): Promise<void> {
        await this.openProjectPanel();
        await this.page.locator(this.projectSelect).click();

        const pending = this.page.locator(this.linkPending);
        await this.watchForElement("scene-editor-link-pending");

        // `.first()` because the projects API does not enforce unique names, so
        // a fixture database provisioned more than once can hold two of them.
        // Which one this links to is not what the test is about - that the scene
        // ends up on a project of that name is.
        await this.page
            .getByRole("option", { name: projectName, exact: true })
            .first()
            .click();

        // Gone, once the re-read has landed and the draft sits on the revision
        // the link produced...
        await expect(pending).toBeHidden({ timeout: 15000 });
        // ...and it was genuinely up in between. A serialization that had stopped
        // running entirely would satisfy the line above on its own.
        expect(await this.elementWasSeen("scene-editor-link-pending")).toBe(true);
        await expect(this.page.locator(this.projectError)).toHaveCount(0);

        // Closed on the way out, so the next reader opens it rather than
        // toggling it shut - the chip is a toggle, and a step that assumed the
        // panel was closed left it hidden with every later locator waiting.
        await this.closeProjectPanel();
    }

    /**
     * Starts a link and returns once the hold is UP, without waiting for it to
     * clear.
     *
     * The window between the two is where the serialization does its work, and a
     * step that only ever looks after it is over cannot tell a hold that worked
     * from one that never happened. Pair with `delayProjectLink` so the window is
     * wide enough to act in.
     */
    async startLinkToProject(projectName: string): Promise<void> {
        await this.openProjectPanel();
        await this.page.locator(this.projectSelect).click();
        await this.page
            .getByRole("option", { name: projectName, exact: true })
            .first()
            .click();

        await expect(this.page.locator(this.linkPending)).toBeVisible({
            timeout: 15000,
        });
    }

    /**
     * Holds the project-link response back for `ms`, so the in-flight window is
     * long enough for a scenario to try to edit inside it.
     *
     * The request is passed through unchanged - this slows the network, it does
     * not fake the write. What is being tested is what the editor refuses while a
     * real write is outstanding, which needs the write to actually be outstanding.
     */
    async delayProjectLink(ms = 3000): Promise<void> {
        await this.page.route(/\/scenes\/\d+\/project$/, async route => {
            if (route.request().method() !== "PUT") {
                await route.fallback();
                return;
            }
            await new Promise(resolve => setTimeout(resolve, ms));
            await route.continue();
        });
    }

    /** Stops delaying the link write, so the next one settles normally. */
    async clearProjectLinkDelay(): Promise<void> {
        await this.page.unroute(/\/scenes\/\d+\/project$/);
    }

    /** The message the editor shows while it is holding edits for a link. */
    linkHoldLocator() {
        return this.page.locator(this.linkPending);
    }

    /** The label on the project chip - the project the scene now belongs to. */
    async linkedProjectName(): Promise<string> {
        return (await this.page.locator(this.projectChip).innerText()).trim();
    }

    /** Opens the project brief panel, if it is not already open. */
    async openProjectPanel(): Promise<void> {
        const select = this.page.locator(this.projectSelect);
        if (!(await select.isVisible())) {
            await this.page.locator(this.projectChip).click();
        }
        await expect(select).toBeVisible({ timeout: 10000 });
    }

    /** Closes the brief panel if it is open, so it stops overlaying the editor. */
    async closeProjectPanel(): Promise<void> {
        if (await this.page.locator(this.projectSelect).isVisible()) {
            await this.page.keyboard.press("Escape");
            await expect(this.page.locator(this.projectSelect)).toBeHidden({
                timeout: 10000,
            });
        }
    }

    /** Why linking is refused right now, or null when it is offered. */
    async projectLinkBlockedReason(): Promise<string | null> {
        await this.openProjectPanel();
        const blocked = this.page.locator(this.projectBlocked);
        if ((await blocked.count()) === 0) {
            return null;
        }
        return (await blocked.innerText()).trim();
    }

    /**
     * Whether the project dropdown accepts a pick.
     *
     * Read from PrimeReact's own `p-disabled` class rather than Playwright's
     * `isEnabled()`: the control is a div, not a native form element, so
     * `isEnabled()` answers true for it however it is rendered.
     */
    async projectSelectIsEnabled(): Promise<boolean> {
        await this.openProjectPanel();
        const classes =
            (await this.page
                .locator(this.projectSelect)
                .getAttribute("class")) ?? "";
        return !classes.split(/\s+/).includes("p-disabled");
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
