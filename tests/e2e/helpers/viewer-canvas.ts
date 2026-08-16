import { type Page } from "@playwright/test";

import { waitForR3FCanvas } from "./list-toolbar-helper";

/**
 * Container of the model viewer's OWN three.js canvas.
 *
 * Six components mount a react-three-fiber `<Canvas>` (scenes, model viewer,
 * script preview, stage editor, texture-set preview, environment-map preview)
 * and both dock sides render their active tab simultaneously, so several
 * `<canvas>` elements are normally in the DOM at once. A bare `canvas`
 * locator binds to whichever one is FIRST in document order and then waits
 * for *that* element - which may belong to another feature and may never
 * become visible. That is what made `04-multifile-gltf-import` fail 2 runs in
 * 3 (2026-08-16) while the model viewer itself was loading correctly:
 *
 *   waiting for locator('canvas') to be visible
 *   - locator resolved to hidden <canvas data-engine="three.js r185">
 *
 * Always name the viewer you mean. R3F puts `className`/`data-*` on its
 * wrapper div rather than on the `<canvas>`, so this is a container selector
 * and the canvas is a descendant of it.
 */
export const MODEL_VIEWER_CANVAS = '[data-testid="model-viewer-canvas"]';

/**
 * Wait for the model viewer's canvas to come up with a live WebGL drawing
 * buffer. Delegates to {@link waitForR3FCanvas}, which checks the drawing
 * buffer rather than CSS visibility - a stronger signal, and one that does not
 * trip over the moment where the absolutely-positioned R3F wrapper is still
 * 0x0 waiting on its flex parent.
 */
export async function waitForModelViewerCanvas(
    page: Page,
    options: { timeout?: number } = {},
): Promise<void> {
    await waitForR3FCanvas(page, MODEL_VIEWER_CANVAS, options);
}
