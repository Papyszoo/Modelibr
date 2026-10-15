import { createBdd } from "playwright-bdd";
import { expect, type Page } from "@playwright/test";
import { inflateRawSync } from "node:zlib";
import { VfxPage } from "../pages/VfxPage";
import { getScenarioState } from "../fixtures/shared-state";

const { Given, When, Then } = createBdd();

const apiBase = () => process.env.API_BASE_URL || "http://localhost:8090";

/** The effect the scenario created through the UI, by the id it was created with. */
function createdEffectId(page: Page): number {
  const id = getScenarioState(page).getCustom<number>("vfxId");
  if (!id) {
    throw new Error(
      "No VFX effect was created in this scenario - create one before addressing it.",
    );
  }
  return id;
}

// ── Create ───────────────────────────────────────────────────────────────────

Given("the user is on the new-tab page", async ({ page }) => {
  await new VfxPage(page).openNewTabPage();
});

When("the user clicks the VFX tile", async ({ page }) => {
  await new VfxPage(page).clickVfxTile();
});

Then("the VFX list is displayed with a create button", async ({ page }) => {
  const vfx = new VfxPage(page);
  await expect(vfx.listLocator).toBeVisible();
  await expect(page.getByTestId("vfx-create")).toBeVisible();
});

When("the user clicks the create button", async ({ page }) => {
  const id = await new VfxPage(page).createEffect();
  getScenarioState(page).setCustom("vfxId", id);
});

Then("the VFX editor is displayed", async ({ page }) => {
  await expect(new VfxPage(page).editorLocator).toBeVisible();
});

// ── Components and persistence ───────────────────────────────────────────────

Given("the user has created a VFX effect", async ({ page }) => {
  const vfx = new VfxPage(page);
  await vfx.goto();
  const id = await vfx.createEffect();
  getScenarioState(page).setCustom("vfxId", id);
});

Given("the user has a VFX effect open in the editor", async ({ page }) => {
  const vfx = new VfxPage(page);
  await vfx.goto();
  const id = await vfx.createEffect();
  getScenarioState(page).setCustom("vfxId", id);
});

When("the user adds a particles component", async ({ page }) => {
  await new VfxPage(page).addParticlesComponent();
});

Then("the timeline shows one track for particles", async ({ page }) => {
  const vfx = new VfxPage(page);
  await expect(vfx.timelineTracks()).toHaveCount(1);
  await expect(vfx.tracksOfType("particles")).toHaveCount(1);
});

When("the user adds a light component", async ({ page }) => {
  await new VfxPage(page).addLightComponent();
});

Then(
  "the timeline shows two tracks \\(particles and light)",
  async ({ page }) => {
    const vfx = new VfxPage(page);
    await expect(vfx.timelineTracks()).toHaveCount(2);
    await expect(vfx.tracksOfType("particles")).toHaveCount(1);
    await expect(vfx.tracksOfType("light")).toHaveCount(1);
  },
);

Then(
  "the effect autosaves with {string} message",
  async ({ page }, text: string) => {
    // The light step already waited for the PUT, so this readout is the one
    // that write produced - not the "Saved" from before the edit.
    await expect(new VfxPage(page).saveStateLocator).toHaveText(text, {
      timeout: 15000,
    });
  },
);

When(
  "the user navigates back to the VFX list and reopens the effect",
  async ({ page }) => {
    await new VfxPage(page).reopenEffect(createdEffectId(page));
  },
);

Then(
  "the particles and light components are still present in the timeline",
  async ({ page }) => {
    const vfx = new VfxPage(page);
    await expect(vfx.tracksOfType("particles")).toHaveCount(1);
    await expect(vfx.tracksOfType("light")).toHaveCount(1);

    // And on the server, read independently of the client's React Query cache:
    // the timeline above could be a warm cache, the stored definition cannot.
    const response = await page.request.get(
      `${apiBase()}/vfx/${createdEffectId(page)}`,
    );
    expect(response.ok()).toBeTruthy();
    const detail = await response.json();
    const types = detail.definition.components.map(
      (component: { type: string }) => component.type,
    );
    expect(types).toContain("particles");
    expect(types).toContain("light");
  },
);

// ── Timeline scrub ───────────────────────────────────────────────────────────

When(
  "the user clicks the timeline ruler at a non-zero position",
  async ({ page }) => {
    const expected = await new VfxPage(page).clickRulerAtFraction(0.5);
    getScenarioState(page).setCustom("vfxScrubTime", expected);
  },
);

Then(
  "the time readout changes from {float} to the clicked position",
  async ({ page }, from: number) => {
    const expected = getScenarioState(page).getCustom<number>("vfxScrubTime");
    const readout = new VfxPage(page).timeReadout();

    // Retrying, not a single read: the click has to have moved it, so the
    // starting value is what this waits to leave.
    await expect(readout).not.toHaveText(`${from.toFixed(2)}s`);

    const seconds = parseFloat(await readout.innerText());
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeCloseTo(expected ?? 0, 1);
  },
);

// ── API contract ─────────────────────────────────────────────────────────────

Given("the API endpoint for VFX is available", async ({ page }) => {
  const response = await page.request.get(`${apiBase()}/vfx`);
  expect(response.ok()).toBeTruthy();
});

When(
  "the user sends an invalid VFX definition via POST \\/vfx",
  async ({ page }) => {
    const response = await page.request.post(`${apiBase()}/vfx`, {
      data: { name: "Invalid effect", definition: invalidDefinition() },
    });
    getScenarioState(page).setCustom("vfxInvalid", {
      status: response.status(),
      body: await response.json(),
    });
  },
);

Then(
  "the response indicates validation errors with field paths",
  async ({ page }) => {
    const slot = getScenarioState(page).getCustom<{
      status: number;
      body: {
        error: string;
        problems: Array<{ path: string; message: string }>;
      };
    }>("vfxInvalid");

    expect(slot?.status).toBe(400);
    expect(slot?.body.error).toBe("InvalidVfxDefinition");
    expect(slot?.body.problems.length ?? 0).toBeGreaterThan(0);
    for (const problem of slot?.body.problems ?? []) {
      expect(typeof problem.path).toBe("string");
      expect(problem.path.length).toBeGreaterThan(0);
      expect(typeof problem.message).toBe("string");
    }
    // The path names the exact field, not just "the definition is wrong".
    expect((slot?.body.problems ?? []).map((p) => p.path)).toContain(
      "components[0].particles.rate",
    );
  },
);

When(
  "the user sends a valid VFX definition via POST \\/vfx",
  async ({ page }) => {
    const response = await page.request.post(`${apiBase()}/vfx`, {
      data: {
        name: "Godot Export Check",
        definition: { version: 1, duration: 2, loop: false, components: [] },
      },
    });
    getScenarioState(page).setCustom("vfxValid", {
      status: response.status(),
      body: await response.json(),
    });
  },
);

Then("the response is {int} Created", async ({ page }, status: number) => {
  const slot = getScenarioState(page).getCustom<{
    status: number;
    body: { id: number };
  }>("vfxValid");

  expect(slot?.status).toBe(status);
  expect(slot?.body.id).toBeGreaterThan(0);
  getScenarioState(page).setCustom("vfxId", slot?.body.id);
});

When(
  "the user requests the Godot export for the effect",
  async ({ page }) => {
    const response = await page.request.get(
      `${apiBase()}/vfx/${createdEffectId(page)}/export/godot`,
    );
    getScenarioState(page).setCustom("vfxExport", {
      status: response.status(),
      contentType: response.headers()["content-type"],
      body: await response.body(),
    });
  },
);

Then(
  "the response is {int} with content-type application\\/zip",
  async ({ page }, status: number) => {
    const slot = getScenarioState(page).getCustom<{
      status: number;
      contentType: string;
    }>("vfxExport");

    expect(slot?.status).toBe(status);
    expect(slot?.contentType).toContain("application/zip");
  },
);

Then("the zip file contains Godot-compatible content", async ({ page }) => {
  const slot = getScenarioState(page).getCustom<{ body: Buffer }>("vfxExport");
  const entries = readZipEntries(slot!.body);

  const sceneEntry = [...entries.keys()].find((name) => name.endsWith(".tscn"));
  expect(sceneEntry, "the export holds no .tscn scene").toBeTruthy();
  expect([...entries.keys()].some((name) => name.endsWith("README.txt"))).toBe(
    true,
  );

  // The scene's own bytes, not just its filename: a .tscn that is not a Godot
  // scene would pass a name check and fail Godot.
  expect(entries.get(sceneEntry!)).toContain("[gd_scene format=3]");
});

// ── Delete ───────────────────────────────────────────────────────────────────

When("the user navigates to the VFX list", async ({ page }) => {
  await new VfxPage(page).goToList();
});

When(
  "the user clicks the delete button for that effect",
  async ({ page }) => {
    const confirmation = await new VfxPage(page).deleteEffect(
      createdEffectId(page),
    );
    getScenarioState(page).setCustom("vfxDeleteConfirmation", confirmation);
  },
);

Then("the effect is removed from the list", async ({ page }) => {
  await expect(new VfxPage(page).effectTile(createdEffectId(page))).toHaveCount(
    0,
  );
});

Then("a confirmation or success message appears", async ({ page }) => {
  // The list confirms through its delete dialog before anything is removed;
  // that dialog is the only message the app shows for this action, so the
  // assertion is that the user was asked, naming what they were deleting.
  const confirmation = getScenarioState(page).getCustom<string>(
    "vfxDeleteConfirmation",
  );
  expect(confirmation).toBeTruthy();
  expect(confirmation).toContain("Delete");
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * A definition the server must reject, with a problem that names a field path.
 *
 * The only fault is the negative `rate`, so the response's problem list is
 * small and its path is predictable (`components[0].particles.rate`).
 */
function invalidDefinition() {
  return {
    version: 1,
    duration: 2,
    loop: false,
    components: [
      {
        id: "particles-1",
        type: "particles",
        name: "Particles 1",
        start: 0,
        duration: 1,
        particles: {
          mode: "continuous",
          rate: -1,
          lifetime: 1,
          speed: 1,
          spread: 10,
          gravity: 0,
          sizeStart: 0.1,
          sizeEnd: 0,
          colorStart: "#ffffff",
          colorEnd: "#000000",
          opacityStart: 1,
          opacityEnd: 0,
          blending: "additive",
          seed: 1,
        },
      },
    ],
  };
}

/**
 * Reads the text entries out of a zip with Node's own inflate.
 *
 * The E2E package carries no zip dependency, and the Godot export is a plain
 * deflated archive that .NET writes with the sizes in each local file header,
 * so a walk of the local headers is enough and keeps the check on the actual
 * bytes rather than on a filename.
 */
function readZipEntries(buffer: Buffer): Map<string, string> {
  const entries = new Map<string, string>();
  let offset = 0;

  while (
    offset + 30 <= buffer.length &&
    buffer.readUInt32LE(offset) === 0x04034b50
  ) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);

    const nameStart = offset + 30;
    const name = buffer.toString("utf8", nameStart, nameStart + nameLength);
    const dataStart = nameStart + nameLength + extraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);

    entries.set(
      name,
      method === 0
        ? data.toString("utf8")
        : inflateRawSync(data).toString("utf8"),
    );
    offset = dataStart + compressedSize;
  }

  return entries;
}
