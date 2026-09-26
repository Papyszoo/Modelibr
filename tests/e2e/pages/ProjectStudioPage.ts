import { Locator, Page, expect } from "@playwright/test";

/**
 * The Project studio: levels, production notes, the character workspace, and
 * the reference board. All locators are `data-testid` contracts owned by the
 * frontend components - no CSS-class locators here.
 */
export class ProjectStudioPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get studio(): Locator {
    return this.page.getByTestId("project-studio");
  }

  get characters(): Locator {
    return this.page.getByTestId("project-characters");
  }

  get referenceBoard(): Locator {
    return this.page.getByTestId("project-reference-board");
  }

  get levelAssets(): Locator {
    return this.page.getByTestId("level-assets");
  }

  get workspace(): Locator {
    return this.page.getByTestId("project-workspace");
  }

  get levelAssetPicker(): Locator {
    return this.page.getByTestId("level-assets-level");
  }

  get levelAssetGroup(): Locator {
    return this.page.getByTestId("level-assets-scene-group");
  }

  get projectMemberGroup(): Locator {
    return this.page.getByTestId("level-assets-member-group");
  }

  /** One derived asset row, addressed by the label the view resolved for it. */
  /**
   * The level-assets panel's own "nothing here" state.
   *
   * Distinguished from a panel with no rows on purpose: an empty list is also
   * what a view that failed to load looks like, and only the message says the
   * level was actually read.
   */
  get levelAssetsEmptyState(): Locator {
    return this.page
      .locator('[data-testid="level-assets"]')
      .getByText(/place[s]? nothing yet/i);
  }

  levelAssetRow(label: string): Locator {
    return this.page.locator(
      `[data-testid="level-assets-row"][data-asset-label="${label}"]`,
    );
  }

  /** The scene chips on one derived row - the provenance of that asset. */
  levelAssetScenes(row: Locator): Locator {
    return row.getByTestId("level-assets-scene");
  }

  projectMemberRows(): Locator {
    return this.page.getByTestId("level-assets-member-row");
  }

  levelRow(name: string): Locator {
    return this.page.locator(
      `[data-testid="project-level-row"][data-level-name="${name}"]`,
    );
  }

  noteRow(title: string): Locator {
    return this.page.locator(
      `[data-testid="project-note-row"][data-note-title="${title}"]`,
    );
  }

  characterCard(name: string): Locator {
    return this.page.locator(
      `[data-testid="project-character-card"][data-character-name="${name}"]`,
    );
  }

  referenceCard(): Locator {
    return this.page.getByTestId("project-reference-card");
  }

  referenceCards(): Locator {
    return this.page.getByTestId("project-reference-card");
  }

  /**
   * The studio renders above the asset tabs, so a project viewer that has not
   * hydrated yet would silently match nothing. One explicit wait here keeps
   * every later assertion meaningful.
   */
  async waitForStudio(): Promise<void> {
    await expect(this.studio).toBeVisible({ timeout: 30000 });
  }

  /**
   * Switches the workspace to one of its views.
   *
   * Each surface lives on its own view now, so a step that acts on characters or
   * references has to go there first. Done as a page method rather than repeated
   * in steps because forgetting it produces a "not found" that looks like a
   * missing feature rather than a missing click.
   */
  async showWorkspaceView(view: "overview" | "levels" | "cast" | "references") {
    await expect(this.workspace).toBeVisible({ timeout: 30000 });
    await this.page.getByTestId(`project-workspace-tab-${view}`).click();
    await expect(
      this.page.getByTestId(`project-workspace-tab-${view}`),
    ).toHaveAttribute("aria-selected", "true");
  }

  /**
   * The level asset view reads a level's scenes and then one document per scene,
   * so it settles after the studio header does.
   */
  async waitForLevelAssets(): Promise<void> {
    await this.ensureView("levels");
    await expect(this.levelAssets).toBeVisible({ timeout: 30000 });
    await expect(this.levelAssetGroup).toBeVisible({ timeout: 30000 });
  }

  /**
   * Switches the view to one level, which is a read - not a navigation. The
   * scene documents it then fetches are waited on by the assertions that follow,
   * which retry against the rows themselves.
   */
  /**
   * Presses a level's own scene control - the way a person gets from a level
   * into the scene that level is shot in.
   *
   * The same button opens a scene that exists and creates one that does not, so
   * the label it carries is read from the row rather than assumed.
   */
  async pressLevelSceneControl(levelName: string): Promise<void> {
    // The project tab has to be in front before its views exist at all: the dock
    // renders one tab at a time, so after the previous press opened a scene
    // editor the whole workspace - and this row - was unmounted. Focusing the
    // project tab by tooltip prefix, because the workspace does not know its own
    // tab's name.
    const { clickTabByTooltip } = await import("../helpers/navigation-helper");
    await clickTabByTooltip(this.page, "Project: ");
    // Then the Levels view inside it, which is where the control lives. Skipping
    // this made the step click whatever button the Overview happened to have.
    await this.ensureView("levels");
    const row = this.page.locator(
      `[data-testid="project-level-row"][data-level-name="${levelName}"]`,
    );
    await expect(row).toBeVisible({ timeout: 30000 });
    await row.getByRole("button").first().click();

    // The control creates, files and opens, which is three requests - so the
    // click returns before any of it has happened. Waited for rather than
    // asserted immediately, or the step would read the dock as it was before the
    // button was ever pressed. The error state is the other legitimate ending,
    // and saying so is what makes a failure say which one it was.
    await expect
      .poll(
        async () => {
          if (await this.levelSceneError.isVisible().catch(() => false)) {
            return "failed";
          }
          const tooltip = await this.page
            .locator(".draggable-tab.active")
            .first()
            .getAttribute("data-pr-tooltip");
          return tooltip?.startsWith("Scene: ") ? "opened" : "pending";
        },
        { timeout: 30000 },
      )
      .toBe("opened");
  }

  /** The level row's own report that its scene could not be opened. */
  get levelSceneError(): Locator {
    return this.page.locator(".project-level-scene-error");
  }

  async showLevelAssetsFor(levelName: string): Promise<void> {
    await expect(this.levelAssetPicker).toBeVisible({ timeout: 30000 });
    await this.levelAssetPicker.selectOption({ label: levelName });
  }

  /**
   * Brings a workspace view into view if it is not already the selected one.
   *
   * Idempotent, like `ensureCharacterEditorOpen` and for the same reason: the
   * decision comes from the tab bar's own `aria-selected`, never from project
   * data. It lives here rather than in the steps so a step that acts on a surface
   * cannot forget it - a forgotten view switch reads as a missing feature rather
   * than a missing click.
   */
  private async ensureView(
    view: "overview" | "levels" | "cast" | "references",
  ): Promise<void> {
    const tab = this.page.getByTestId(`project-workspace-tab-${view}`);
    await expect(tab).toBeVisible({ timeout: 30000 });
    if ((await tab.getAttribute("aria-selected")) !== "true") {
      await tab.click();
    }
    await expect(tab).toHaveAttribute("aria-selected", "true", {
      timeout: 15000,
    });
  }

  async createLevel(
    name: string,
    description: string,
    status: string,
  ): Promise<void> {
    // Levels are on the Overview as well as the Levels view; Overview is where a
    // new project starts, so the form is looked for there first.
    await this.ensureView("overview");
    await this.page.getByRole("button", { name: "Add level" }).click();
    const form = this.page.locator(
      ".project-studio-card:has(#new-project-level)",
    );
    await expect(form).toBeVisible();
    await form.locator("#new-project-level").fill(name);
    await form.getByLabel("Level description").fill(description);
    await form.getByLabel("New level status").selectOption({ label: status });

    const responsePromise = this.page.waitForResponse(
      (response) =>
        response.url().includes("/levels") &&
        response.request().method() === "POST",
      { timeout: 15000 },
    );
    await form.getByRole("button", { name: "Create level" }).click();
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
    await expect(this.levelRow(name)).toBeVisible({ timeout: 15000 });
  }

  /**
   * Named idempotent helper, not a test-path branch: the editor is a
   * disclosure, so an assertion running after an action may find it already
   * open. Only the tab bar decides whether to click - never project data.
   */
  private async ensureCharacterEditorOpen(name: string): Promise<Locator> {
    await this.ensureView("cast");
    const card = this.characterCard(name);
    await expect(card).toBeVisible({ timeout: 15000 });
    if (
      (await card.getByTestId("project-character-section-tab").count()) === 0
    ) {
      await card.getByRole("button", { name: `Edit ${name}` }).click();
    }
    await expect(card.getByTestId("project-character-section-tab")).toHaveCount(
      5,
      { timeout: 15000 },
    );
    return card;
  }

  async openCharacter(name: string): Promise<Locator> {
    return this.ensureCharacterEditorOpen(name);
  }

  async openCharacterSection(
    name: string,
    section: "identity" | "notes" | "media" | "abilities" | "variants",
  ): Promise<Locator> {
    const card = await this.ensureCharacterEditorOpen(name);
    await card
      .locator(
        `[data-testid="project-character-section-tab"][data-section="${section}"]`,
      )
      .click();
    return card;
  }

  async createCharacter(
    name: string,
    description: string,
    tags: string[],
  ): Promise<void> {
    await this.ensureView("cast");
    await this.characters
      .getByRole("button", { name: "Add character" })
      .click();
    const form = this.characters.locator("form.project-character-form");
    await expect(form).toBeVisible();
    await form.getByLabel("Character name").fill(name);
    await form.getByLabel("Character description").fill(description);
    await form.getByLabel("Character tags").fill(tags.join(", "));

    const responsePromise = this.page.waitForResponse(
      (response) =>
        response.url().includes("/characters") &&
        response.request().method() === "POST",
      { timeout: 15000 },
    );
    await form.getByRole("button", { name: "Create character" }).click();
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
    await expect(this.characterCard(name)).toBeVisible({ timeout: 15000 });
  }

  async addAbility(
    characterName: string,
    abilityName: string,
    description: string,
  ): Promise<void> {
    const card = await this.openCharacterSection(characterName, "abilities");
    await card
      .getByRole("button", { name: `Add ability to ${characterName}` })
      .click();
    await card.getByLabel(`New ability for ${characterName}`).fill(abilityName);
    await card
      .getByLabel(`Ability description for ${characterName}`)
      .fill(description);

    const responsePromise = this.page.waitForResponse(
      (response) =>
        response.url().includes("/abilities") &&
        response.request().method() === "POST",
      { timeout: 15000 },
    );
    await card.getByRole("button", { name: "Save ability" }).click();
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
    await expect(
      card.locator(
        `[data-testid="project-character-ability"][data-name="${abilityName}"]`,
      ),
    ).toBeVisible({ timeout: 15000 });
  }

  async addVariant(
    characterName: string,
    variantName: string,
    description: string,
    levelName?: string,
  ): Promise<void> {
    const card = await this.openCharacterSection(characterName, "variants");
    await card
      .getByRole("button", { name: `Add variant to ${characterName}` })
      .click();
    await card.getByLabel(`New variant for ${characterName}`).fill(variantName);
    await card
      .getByLabel(`Variant description for ${characterName}`)
      .fill(description);
    if (levelName) {
      await card
        .getByLabel(`Variant level for ${characterName}`)
        .selectOption({ label: levelName });
    }

    const responsePromise = this.page.waitForResponse(
      (response) =>
        response.url().includes("/variants") &&
        response.request().method() === "POST",
      { timeout: 15000 },
    );
    await card.getByRole("button", { name: "Save variant" }).click();
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
    await expect(
      card.locator(
        `[data-testid="project-character-variant"][data-name="${variantName}"]`,
      ),
    ).toBeVisible({ timeout: 15000 });
  }

  async addCharacterNote(
    characterName: string,
    noteTitle: string,
    noteBody: string,
  ): Promise<void> {
    const card = await this.openCharacterSection(characterName, "notes");
    await card
      .getByRole("button", { name: `Add note to ${characterName}` })
      .click();
    await card.getByLabel(`Note title for ${characterName}`).fill(noteTitle);
    await card.getByLabel(`Note body for ${characterName}`).fill(noteBody);

    const responsePromise = this.page.waitForResponse(
      (response) =>
        response.url().includes("/production-notes") &&
        response.request().method() === "POST",
      { timeout: 15000 },
    );
    await card.getByRole("button", { name: "Save note" }).click();
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
    await expect(
      card.getByTestId("project-character-note").filter({
        hasText: noteTitle,
      }),
    ).toBeVisible({ timeout: 15000 });
  }

  async uploadReferenceImage(filePath: string): Promise<void> {
    await this.ensureView("references");
    const before = await this.referenceCards().count();
    const responsePromise = this.page.waitForResponse(
      (response) =>
        response.url().includes("/concept-images") &&
        response.request().method() === "POST",
      { timeout: 30000 },
    );
    await this.referenceBoard
      .getByTestId("project-reference-upload")
      .setInputFiles(filePath);
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
    await expect(this.referenceCards()).toHaveCount(before + 1, {
      timeout: 30000,
    });
  }

  async titleFirstReference(title: string): Promise<Locator> {
    const card = this.referenceCards().first();
    const input = card.getByTestId("project-reference-title");
    await expect(input).toBeVisible({ timeout: 15000 });
    await input.fill(title);
    const responsePromise = this.page.waitForResponse(
      (response) =>
        response.url().includes("/references/") &&
        response.request().method() === "PUT",
      { timeout: 15000 },
    );
    await input.blur();
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
    return card;
  }

  async linkReference(
    card: Locator,
    target: "level" | "character",
    targetName: string,
  ): Promise<void> {
    const row = card.locator(
      `.project-reference-link-row:has(button[aria-label="Link ${target}"])`,
    );
    await row.getByRole("button", { name: `Link ${target}` }).click();
    const picker = row.getByTestId("project-reference-picker");
    await expect(picker).toBeVisible();

    const responsePromise = this.page.waitForResponse(
      (response) =>
        response.url().includes("/links") &&
        response.request().method() === "POST",
      { timeout: 15000 },
    );
    await picker.getByRole("button", { name: targetName, exact: true }).click();
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
    await expect(
      card
        .getByTestId("project-reference-chip")
        .filter({ hasText: targetName }),
    ).toBeVisible({ timeout: 15000 });
  }

  async unlinkReference(card: Locator, targetName: string): Promise<void> {
    const chip = card
      .getByTestId("project-reference-chip")
      .filter({ hasText: targetName });
    await expect(chip).toBeVisible();
    const responsePromise = this.page.waitForResponse(
      (response) =>
        response.url().includes("/links/") &&
        response.request().method() === "DELETE",
      { timeout: 15000 },
    );
    await chip.getByRole("button", { name: `Unlink ${targetName}` }).click();
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
    await expect(chip).toHaveCount(0, { timeout: 15000 });
  }

  async addReferenceNote(
    card: Locator,
    noteTitle: string,
    noteBody: string,
  ): Promise<void> {
    await card.getByRole("button", { name: /^Add note to / }).click();
    const form = card.locator(".project-reference-note-form");
    await expect(form).toBeVisible();
    await form.getByLabel(/^Note title for /).fill(noteTitle);
    await form.getByLabel(/^Note body for /).fill(noteBody);

    const responsePromise = this.page.waitForResponse(
      (response) =>
        response.url().includes("/production-notes") &&
        response.request().method() === "POST",
      { timeout: 15000 },
    );
    await form.getByRole("button", { name: "Save note" }).click();
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
    await expect(
      card.getByTestId("project-reference-note").filter({ hasText: noteTitle }),
    ).toBeVisible({ timeout: 15000 });
  }

  async removeReference(card: Locator): Promise<void> {
    await card.getByRole("button", { name: /^Remove reference / }).click();
    const dialog = this.page.locator(".p-confirm-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Remove" }).click();
    await expect(card).toHaveCount(0, { timeout: 15000 });
  }
}
