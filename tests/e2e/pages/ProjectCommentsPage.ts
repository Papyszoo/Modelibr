import { Locator, Page, expect } from "@playwright/test";

/** Escapes a name for use inside a RegExp - asset names carry dots and dashes. */
function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The project comments surfaces: the comments badge every project element
 * carries, the panel it opens, and the one comment thread every surface uses
 * (overview, character section, reference card, panel).
 *
 * Comments are addressed by their `data-comment-title`, which every thread
 * renders whatever its row test id is - so one helper serves all of them.
 */
export class ProjectCommentsPage {
    readonly page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    /**
     * The badge of one element, by the element's name. Anchored, so a badge on
     * "Crate" is never matched by one on "Crate Lid".
     */
    badge(targetName: string): Locator {
        return this.page.getByRole("button", {
            name: new RegExp(
                `^Comments on ${escapeRegExp(targetName)}(: \\d+ open)?$`,
            ),
        });
    }

    async expectBadgeOpenCount(
        targetName: string,
        count: number,
    ): Promise<void> {
        const badge = this.badge(targetName);
        await expect(badge).toBeVisible({ timeout: 30000 });
        await expect(badge).toHaveAttribute("data-open-count", String(count), {
            timeout: 15000,
        });
    }

    panel(targetName: string): Locator {
        return this.page.getByRole("dialog", {
            name: `Comments - ${targetName}`,
        });
    }

    async openPanel(targetName: string): Promise<Locator> {
        const badge = this.badge(targetName);
        await expect(badge).toBeVisible({ timeout: 30000 });
        await badge.click();
        const panel = this.panel(targetName);
        await expect(panel).toBeVisible({ timeout: 15000 });
        return panel;
    }

    async closePanel(targetName: string): Promise<void> {
        const panel = this.panel(targetName);
        await this.page.keyboard.press("Escape");
        await expect(panel).toBeHidden({ timeout: 15000 });
    }

    /** One comment in `scope`, by its title. */
    comment(scope: Locator, title: string): Locator {
        return scope.locator(`[data-comment-title="${title}"]`);
    }

    private waitForCommentWrite(method: "POST" | "PUT") {
        return this.page.waitForResponse(
            (response) =>
                /\/projects\/\d+\/comments(\/\d+)?$/.test(
                    new URL(response.url()).pathname,
                ) && response.request().method() === method,
            { timeout: 15000 },
        );
    }

    /**
     * Writes a comment with a thread's composer. The panel keeps its composer
     * open; inline threads (overview, character, reference) hide it behind
     * their + button, so the caller says which kind of thread it is.
     */
    async addComment(
        scope: Locator,
        targetName: string,
        title: string,
        body: string,
        composer: "always" | "toggle",
    ): Promise<void> {
        if (composer === "toggle") {
            await scope
                .getByRole("button", { name: `Add comment to ${targetName}` })
                .click();
        }
        const form = scope.getByTestId("project-comment-form");
        await expect(form).toBeVisible({ timeout: 15000 });
        await form.getByLabel(`Comment title for ${targetName}`).fill(title);
        await form.getByLabel(`Comment for ${targetName}`).fill(body);

        const response = this.waitForCommentWrite("POST");
        await form.getByRole("button", { name: "Add comment" }).click();
        expect((await response).ok()).toBeTruthy();
        await expect(this.comment(scope, title)).toBeVisible({
            timeout: 15000,
        });
    }

    async resolve(
        scope: Locator,
        title: string,
        resolution?: string,
    ): Promise<void> {
        const item = this.comment(scope, title);
        await item.getByRole("button", { name: `Resolve ${title}` }).click();
        if (resolution) {
            await item
                .getByLabel(`Resolution for ${title}`)
                .fill(resolution);
        }
        const response = this.waitForCommentWrite("PUT");
        await item
            .getByRole("button", { name: "Resolve", exact: true })
            .click();
        expect((await response).ok()).toBeTruthy();
        await expect(item).toHaveAttribute("data-status", "resolved", {
            timeout: 15000,
        });
    }

    async reopen(scope: Locator, title: string): Promise<void> {
        const item = this.comment(scope, title);
        const response = this.waitForCommentWrite("PUT");
        await item.getByRole("button", { name: `Reopen ${title}` }).click();
        expect((await response).ok()).toBeTruthy();
        await expect(item).toHaveAttribute("data-status", "open", {
            timeout: 15000,
        });
    }

    async togglePin(scope: Locator, title: string, pin: boolean): Promise<void> {
        const item = this.comment(scope, title);
        const response = this.waitForCommentWrite("PUT");
        await item
            .getByRole("button", {
                name: pin ? `Pin ${title} as a decision` : `Unpin ${title}`,
            })
            .click();
        expect((await response).ok()).toBeTruthy();
    }

    async edit(
        scope: Locator,
        title: string,
        newTitle: string,
        newBody: string,
    ): Promise<void> {
        await this.comment(scope, title)
            .getByRole("button", { name: `Edit ${title}` })
            .click();
        const form = scope.locator('[data-testid$="-edit"]');
        await expect(form).toBeVisible({ timeout: 15000 });
        await form.getByLabel("Edit comment title").fill(newTitle);
        await form.getByLabel("Edit comment", { exact: true }).fill(newBody);
        const response = this.waitForCommentWrite("PUT");
        await form.getByRole("button", { name: "Save", exact: true }).click();
        expect((await response).ok()).toBeTruthy();
        await expect(this.comment(scope, newTitle)).toBeVisible({
            timeout: 15000,
        });
    }

    /**
     * A resolved comment is quieter, but only while nothing points at it: it
     * comes back to full strength on hover and focus so it stays readable. So
     * the pointer is parked and focus released before its resting style is read.
     */
    async expectDeEmphasised(scope: Locator, title: string): Promise<void> {
        await this.page.mouse.move(0, 0);
        await this.page.evaluate(() =>
            (document.activeElement as HTMLElement | null)?.blur(),
        );
        const item = this.comment(scope, title);
        await expect(item).toHaveClass(/\bis-resolved\b/);
        await expect(item).toHaveCSS("opacity", "0.62", { timeout: 15000 });
    }

    resolution(scope: Locator, title: string): Locator {
        return this.comment(scope, title).getByTestId(
            "project-comment-resolution",
        );
    }
}
