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

  async createLevel(
    name: string,
    description: string,
    status: string,
  ): Promise<void> {
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
