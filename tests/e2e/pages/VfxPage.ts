import { type Locator, Page, expect } from "@playwright/test";

/**
 * VFX tab: the list of effects and the editor for one of them.
 *
 * Selectors are `data-testid` per the current contract - this feature is new,
 * so there is no grandfathered CSS-class locator to inherit. The one exception
 * is PrimeReact's body-mounted dialog chrome (`.p-dialog`), which is the
 * accepted carve-out for overlays that render outside the component tree.
 */
export class VfxPage {
  private readonly page: Page;

  private readonly list = '[data-testid="vfx-list"]';
  private readonly createButton = '[data-testid="vfx-create"]';
  private readonly tile = '[data-testid="vfx-tile"]';
  private readonly deleteButton = '[data-testid="vfx-delete"]';

  private readonly editor = '[data-testid="vfx-editor"]';
  private readonly saveState = '[data-testid="vfx-save-state"]';
  private readonly addParticles = '[data-testid="vfx-add-particles"]';
  private readonly addLight = '[data-testid="vfx-add-light"]';
  private readonly track = '[data-testid="vfx-timeline-track"]';
  private readonly ruler = '[data-testid="vfx-timeline-ruler"]';
  private readonly time = '[data-testid="vfx-time"]';
  private readonly lengthInput =
    'input[aria-label="Effect length in seconds"]';

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    const { navigateToTab } = await import("../helpers/navigation-helper");
    await navigateToTab(this.page, "vfxList");
    await expect(this.page.locator(this.list)).toBeVisible();
  }

  /** The New Tab page itself, before a tile has been chosen. */
  async openNewTabPage(): Promise<void> {
    const { navigateToAppClean } =
      await import("../helpers/navigation-helper");
    await navigateToAppClean(this.page);
    await this.page.locator(".dock-bar-left .dock-add-button").click();
    await expect(this.page.locator(".newtab-page").last()).toBeVisible();
  }

  /** Clicks the VFX tile on the open New Tab page and waits for the list. */
  async clickVfxTile(): Promise<void> {
    const newTabPage = this.page.locator(".newtab-page").last();
    const tile = newTabPage
      .locator(".newtab-tile")
      .filter({
        has: this.page.locator(".newtab-tile-title", { hasText: "VFX" }),
      })
      .first();
    await expect(tile).toBeVisible();
    await tile.click();
    await expect(this.page.locator(this.list)).toBeVisible();
  }

  get listLocator(): Locator {
    return this.page.locator(this.list);
  }

  get editorLocator(): Locator {
    return this.page.locator(this.editor);
  }

  get saveStateLocator(): Locator {
    return this.page.locator(this.saveState);
  }

  /**
   * Creates an effect from the list's New effect action and returns its id.
   *
   * The id comes from the create response rather than from the tile: names are
   * not unique, and the scenarios have to reopen exactly this effect later.
   */
  async createEffect(): Promise<number> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (candidate) =>
          new URL(candidate.url()).pathname.endsWith("/vfx") &&
          candidate.request().method() === "POST" &&
          candidate.ok(),
      ),
      this.page.locator(this.createButton).click(),
    ]);

    const created = await response.json();
    // Creating opens the editor straight away - that is the flow, not an
    // incidental redirect, so the editor is the assertion that it worked.
    await expect(this.page.locator(this.editor)).toBeVisible();
    return created.id;
  }

  effectTile(id: number): Locator {
    return this.page.locator(`${this.tile}[data-vfx-id="${id}"]`);
  }

  async addParticlesComponent(): Promise<void> {
    await this.page.locator(this.addParticles).click();
  }

  /**
   * Adds a light, and returns once its autosave write has landed.
   *
   * Waiting on the PUT here is what makes the later "Saved" assertion mean
   * something: without it the readout could still be showing the "Saved" from
   * before the edit, so a save that never fired would pass.
   */
  async addLightComponent(): Promise<void> {
    await Promise.all([
      this.page.waitForResponse(
        (candidate) =>
          /\/vfx\/\d+$/.test(new URL(candidate.url()).pathname) &&
          candidate.request().method() === "PUT" &&
          candidate.ok(),
      ),
      this.page.locator(this.addLight).click(),
    ]);
  }

  timelineTracks(): Locator {
    return this.page.locator(this.track);
  }

  /** Every track whose component id names `type` (`particles-1`, `light-1`, ...). */
  tracksOfType(type: string): Locator {
    return this.page.locator(`${this.track}[data-component-id^="${type}-"]`);
  }

  /**
   * Clicks the ruler at `fraction` of its width and returns the effect time
   * that lands under the pointer, read from the effect's own length.
   */
  async clickRulerAtFraction(fraction: number): Promise<number> {
    const ruler = this.page.locator(this.ruler);
    const box = await ruler.boundingBox();
    if (!box) {
      throw new Error("The VFX timeline ruler has no box to click.");
    }

    const duration = Number(
      await this.page.locator(this.lengthInput).inputValue(),
    );
    await ruler.click({
      position: { x: box.width * fraction, y: box.height / 2 },
    });
    return fraction * duration;
  }

  timeReadout(): Locator {
    return this.page.locator(this.time);
  }

  /**
   * Returns to the list and reopens the effect so the editor re-reads it from
   * the server.
   *
   * The editor tab is closed first on purpose: reopening an effect whose tab is
   * still open only focuses the in-memory draft, which would make the
   * persistence assertion pass without a single request. Closing it makes the
   * reopen mount a fresh editor that fetches the stored definition.
   */
  async reopenEffect(id: number): Promise<void> {
    const { clickTabByTooltip, closeTabByTooltip } =
      await import("../helpers/navigation-helper");
    await clickTabByTooltip(this.page, "VFX");
    await expect(this.page.locator(this.list)).toBeVisible();

    const editorTab = this.page.locator(
      '.draggable-tab[data-pr-tooltip^="Effect:"]',
    );
    if ((await editorTab.count()) > 0) {
      await closeTabByTooltip(this.page, "Effect:");
    }

    await this.effectTile(id).click();
    await expect(this.page.locator(this.editor)).toBeVisible();
  }

  /** Switches to the already-open VFX list tab. */
  async goToList(): Promise<void> {
    const { clickTabByTooltip } = await import("../helpers/navigation-helper");
    await clickTabByTooltip(this.page, "VFX");
    await expect(this.page.locator(this.list)).toBeVisible();
  }

  /**
   * Opens the effect's delete confirmation and confirms it. Returns the
   * confirmation text so a scenario can assert the user was told what was
   * about to happen.
   *
   * The card menu is dispatched rather than right-clicked. `contextmenu` fires
   * on mousedown, so a real right-click's matching pointerup can land on the
   * modal mask while the dialog is opening; dispatching the menu keeps the
   * open deterministic and matches how the component's own unit test opens it.
   * The delete itself still goes through the confirmation, so what these steps
   * assert - the confirmation, then the removal - is unchanged; only the menu
   * step to reach it is new.
   */
  async deleteEffect(id: number): Promise<string> {
    const tile = this.effectTile(id);
    await expect(tile).toBeVisible();
    await tile.dispatchEvent("contextmenu");

    // Right-click opens the card menu; the confirmation follows Delete.
    await this.page.getByRole("menuitem", { name: "Delete" }).click();

    const dialog = this.page.locator(".p-dialog:visible").first();
    await expect(dialog).toBeVisible();
    const confirmation = (await dialog.innerText()).trim();

    await this.page.locator(this.deleteButton).click();
    await expect(dialog).toBeHidden();
    return confirmation;
  }
}
