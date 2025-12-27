import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";

const { Given, Then } = createBdd();

Given("I open the home page", async ({ page }) => {
    await page.goto("/");
});

Then(
    "I should see the application title {string}",
    async ({ page }, title: string) => {
        await expect(page).toHaveTitle(new RegExp(title));
    }
);
