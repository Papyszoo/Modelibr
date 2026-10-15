// Post-production for one recorded docs clip, driven by the timeline the spec
// writes next to the raw screencast (helpers/video-helpers.ts):
//
//   1. Dead time: every stretch where the frame is frozen for longer than
//      FREEZE_MIN is shortened to a short beat, and spans the spec marked
//      with offCamera() (loaders, page changes) are cut outright. The
//      opening shot, each caption's reading time, dwell() spans and the
//      final hold are protected.
//   2. Camera: an eased zoom/pan (Screen Studio style) toward the regions the
//      spec frames with focusOn/holdOn, panning along when an action would
//      leave a zoomed frame. It is planned on the cut timeline, so a cut never
//      lands mid-move. The raw clip is recorded at 2x device scale, so zoomed
//      text stays sharp.
//   3. Captions: the PNGs rendered in the app's own colours are faded in and
//      out. Each sits at the bottom of the frame unless an action happens
//      there while it is up; then it moves to the top, or steps aside for
//      the moments where both edges are busy.
//
// Everything is derived from the timeline and the frames, so a re-render of
// the same spec produces the same edit.

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import ffmpegPath from "ffmpeg-static";

import { parseFreezeSegments, runFfmpeg } from "./video-analysis.js";

const OUTPUT = { width: 1920, height: 1080 };
const FPS = 25;

const FREEZE_MIN = 1.0; // seconds of stillness before it counts as dead time
const FREEZE_KEEP_HEAD = 0.55; // beat kept after a change lands
const FREEZE_KEEP_TAIL = 0.15; // beat kept before the next movement
const INTRO_PROTECT = 1.8; // the opening shot and first caption stay intact
const CAPTION_MIN = 1.9; // every caption stays readable at least this long

const MAX_ZOOM = 1.8;
const FRAME_PADDING = 40; // CSS px around an explicitly framed region
const FOLLOW_MARGIN = 28; // an action this far inside the frame does not move it
const MOVE_SECONDS = 0.8;
const MOVE_LEAD = 0.15; // start moving slightly before the action
const MIN_DWELL = 0.25;
const INTRO_SHOT = 0.9; // the clip opens on the whole screen before any move
// Captions sit over the bottom of the frame; framings keep their subject
// above this share of the frame so a caption never covers it.
const CAPTION_BAND = 0.13;
// How long after a glide starts its target counts as "being acted on".
const ACTION_SPAN = 1.6;
const CAPTION_EDGE = 0.16; // share of the frame height a caption occupies

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function subtractSpans(span, removedSpans) {
    let pieces = [span];
    for (const [rs, re] of removedSpans) {
        pieces = pieces.flatMap(([s, e]) => {
            if (re <= s || rs >= e) return [[s, e]];
            const out = [];
            if (rs > s) out.push([s, rs]);
            if (re < e) out.push([re, e]);
            return out;
        });
    }
    return pieces;
}

function mergeSpans(spans) {
    const sorted = spans
        .filter(([s, e]) => e - s > 0.04)
        .sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [s, e] of sorted) {
        const last = merged[merged.length - 1];
        if (last && s <= last[1] + 0.04) {
            last[1] = Math.max(last[1], e);
        } else {
            merged.push([s, e]);
        }
    }
    return merged;
}

function planCuts(timeline, freezeSegments, duration) {
    const protectedSpans = [[0, INTRO_PROTECT], ...(timeline.dwells ?? [])];
    for (const entry of timeline.captions) {
        if (entry.text) protectedSpans.push([entry.t, entry.t + CAPTION_MIN]);
    }
    if (timeline.holdFrom !== null && timeline.holdFrom !== undefined) {
        protectedSpans.push([timeline.holdFrom, duration + 1]);
    }

    const freezeCuts = freezeSegments
        .filter((segment) => segment.end - segment.start >= FREEZE_MIN)
        .flatMap((segment) =>
            subtractSpans(
                [segment.start + FREEZE_KEEP_HEAD, segment.end - FREEZE_KEEP_TAIL],
                protectedSpans,
            ),
        );

    return mergeSpans([...timeline.cuts, ...freezeCuts]).filter(
        ([s, e]) => e - s >= 0.12,
    );
}

function mapTime(t, cuts) {
    let removed = 0;
    for (const [s, e] of cuts) {
        if (s >= t) break;
        removed += Math.min(t, e) - s;
    }
    return t - removed;
}

function frameFor(event, viewport, band) {
    const { width: W, height: H } = viewport;
    if (!event.box) {
        return { x: 0, y: 0, w: W };
    }

    const { x, y, width, height } = event.box;
    const usable = 1 - band;
    let zoom =
        event.zoom ??
        Math.min(
            W / (width + 2 * FRAME_PADDING),
            (H * usable) / (height + 2 * FRAME_PADDING),
        );
    // The target always fits, with a margin: a zoom never crops the thing
    // the spec pointed at.
    zoom = Math.min(
        zoom,
        W / (width + 2 * FOLLOW_MARGIN),
        (H * usable) / (height + 2 * FOLLOW_MARGIN),
    );
    zoom = clamp(zoom, 1, MAX_ZOOM);

    const w = W / zoom;
    const h = H / zoom;
    return {
        x: clamp(x + width / 2 - w / 2, 0, W - w),
        y: clamp(y + height / 2 - (h * usable) / 2, 0, H - h),
        w,
    };
}

function frameContains(frame, box, viewport, band) {
    const h = (frame.w * viewport.height) / viewport.width;
    return (
        box.x >= frame.x + FOLLOW_MARGIN &&
        box.y >= frame.y + FOLLOW_MARGIN &&
        box.x + box.width <= frame.x + frame.w - FOLLOW_MARGIN &&
        box.y + box.height <= frame.y + h * (1 - band) - FOLLOW_MARGIN
    );
}

function sameFrame(a, b) {
    return Math.abs(a.x - b.x) < 6 && Math.abs(a.y - b.y) < 6 && Math.abs(a.w - b.w) < 6;
}

function ease(u) {
    return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(2 - 2 * u, 3) / 2;
}

function planCamera(events, viewport, band) {
    let current = { x: 0, y: 0, w: viewport.width };
    let lastEnd = -Infinity;
    const moves = [];

    for (const event of events) {
        // Explicit framings (focusOn/holdOn) decide the zoom. Actions only
        // pan an already zoomed frame when they would leave it; at full
        // frame everything is already in view.
        if (event.auto) {
            if (current.w >= viewport.width - 1) continue;
            if (frameContains(current, event.box, viewport, band)) continue;
        }
        const target = event.auto
            ? frameFor({ ...event, zoom: viewport.width / current.w }, viewport, band)
            : frameFor(event, viewport, band);
        if (sameFrame(current, target)) {
            continue;
        }
        const start = Math.max(INTRO_SHOT, event.t - MOVE_LEAD, lastEnd + MIN_DWELL);
        moves.push({ start, end: start + MOVE_SECONDS, from: current, to: target });
        current = target;
        lastEnd = start + MOVE_SECONDS;
    }
    return moves;
}

function frameAt(t, moves, viewport) {
    let frame = { x: 0, y: 0, w: viewport.width };
    for (const move of moves) {
        if (t < move.start) return move.from;
        if (t < move.end) {
            const e = ease((t - move.start) / (move.end - move.start));
            return {
                x: move.from.x + (move.to.x - move.from.x) * e,
                y: move.from.y + (move.to.y - move.from.y) * e,
                w: move.from.w + (move.to.w - move.from.w) * e,
            };
        }
        frame = move.to;
    }
    return frame;
}

/**
 * Where each caption goes. Bottom by default; if something the spec acts on
 * sits under the bottom caption while it is up, the caption moves to the top;
 * if both edges are busy it stays at the less busy one and steps aside while
 * those actions happen. A spec can force a position.
 */
function placeCaptions(captions, actions, moves, viewport) {
    return captions.flatMap((caption) => {
        const halfWidth = caption.widthShare / 2 + 0.02;
        const conflicts = { top: [], bottom: [] };
        for (const action of actions) {
            // An action that only grazes the caption's window (it ended
            // just as the caption appeared) does not move it.
            if (action.t + ACTION_SPAN - caption.start < 0.5 || action.t >= caption.end) continue;
            const frame = frameAt(action.t + MOVE_SECONDS, moves, viewport);
            const h = (frame.w * viewport.height) / viewport.width;
            // Widened a little: the controls next to a clicked one (Cancel
            // beside Add Selected) are part of the moment too.
            const left = (action.box.x - 60 - frame.x) / frame.w;
            const right = (action.box.x + action.box.width + 60 - frame.x) / frame.w;
            const top = (action.box.y - 20 - frame.y) / h;
            const bottom = (action.box.y + action.box.height + 20 - frame.y) / h;
            if (right < 0.5 - halfWidth || left > 0.5 + halfWidth) continue;
            const span = [action.t - 0.2, action.t + ACTION_SPAN];
            if (bottom > 1 - CAPTION_EDGE && top < 1) conflicts.bottom.push(span);
            if (top < CAPTION_EDGE && bottom > 0) conflicts.top.push(span);
        }

        let position = caption.position;
        if (!position) {
            if (conflicts.bottom.length === 0) position = "bottom";
            else if (conflicts.top.length === 0) position = "top";
            else position = conflicts.top.length < conflicts.bottom.length ? "top" : "bottom";
        }
        const busy = caption.position ? [] : mergeSpans(conflicts[position]);
        return subtractSpans([caption.start, caption.end], busy)
            .filter(([s, e]) => e - s >= 0.6)
            .map(([start, end]) => ({ ...caption, start, end, position }));
    });
}

function fmt(value) {
    return Number(value.toFixed(4)).toString();
}

/** Piecewise eased expression of `ot` (output time) for one frame property. */
function cameraExpression(moves, key, initial) {
    let expr = fmt(moves.length ? moves[moves.length - 1].to[key] : initial);
    for (let i = moves.length - 1; i >= 0; i--) {
        const { start, end, from, to } = moves[i];
        const u = `((ot-${fmt(start)})/${fmt(end - start)})`;
        const easing = `if(lt(${u},0.5),4*pow(${u},3),1-pow(2-2*${u},3)/2)`;
        const moving = `${fmt(from[key])}+(${fmt(to[key] - from[key])})*${easing}`;
        expr = `if(lt(ot,${fmt(start)}),${fmt(from[key])},if(lt(ot,${fmt(end)}),${moving},${expr}))`;
    }
    return expr;
}

function pngWidth(file) {
    return fs.readFileSync(file).readUInt32BE(16);
}

/**
 * Turn a raw recording plus its timeline into the published clip.
 * Returns a summary of the edit for the report.
 */
export function polishVideo({ rawPath, timelinePath, outPath, duration }) {
    if (!ffmpegPath) {
        throw new Error("ffmpeg-static binary is unavailable");
    }

    const timeline = JSON.parse(fs.readFileSync(timelinePath, "utf8"));
    const viewport = timeline.viewport;
    const { width: W } = viewport;
    const scale = timeline.scale;
    // The screencast keeps writing frames while stop() flushes; the clip
    // ends where the spec stopped it, not where the file happens to end.
    const end = Math.min(duration, timeline.duration ?? duration);

    const freezes = parseFreezeSegments(
        runFfmpeg(["-i", rawPath, "-vf", `freezedetect=n=0.001:d=${FREEZE_MIN}`, "-an", "-f", "null", "-"]),
        duration,
    );
    const cuts = planCuts(timeline, freezes, end);
    const outputDuration = mapTime(end, cuts);

    const band = timeline.captions.some((entry) => entry.text) ? CAPTION_BAND : 0;
    const events = timeline.camera
        .map((event) => ({ ...event, t: mapTime(event.t, cuts) }))
        .sort((a, b) => a.t - b.t);
    const moves = planCamera(events, viewport, band);

    const keep = cuts.length
        ? `select='not(${cuts.map(([s, e]) => `between(t,${fmt(s)},${fmt(e)})`).join("+")})',`
        : "";
    const zoom = `${W}/(${cameraExpression(moves, "w", W)})`;
    const x = `(${cameraExpression(moves, "x", 0)})*${scale}`;
    const y = `(${cameraExpression(moves, "y", 0)})*${scale}`;

    const filters = [
        // rgb24 avoids zoompan snapping the crop to even (chroma) pixels,
        // which shows as a stutter during slow pans.
        `[0:v]fps=${FPS},${keep}format=rgb24,` +
            `zoompan=z='${zoom}':x='${x}':y='${y}':d=1:fps=${FPS}:s=${OUTPUT.width}x${OUTPUT.height}[cam0]`,
    ];

    // Captions: rendered at the page's device scale, composited at the
    // output's CSS-px scale so they read the same size in every clip.
    const captionScale = OUTPUT.width / W / scale;
    const rawDir = path.dirname(rawPath);
    const captionEntries = timeline.captions
        .map((entry, i, all) => {
            const start = mapTime(entry.t, cuts);
            const next = i + 1 < all.length ? mapTime(all[i + 1].t, cuts) - 0.1 : outputDuration;
            return { ...entry, start, end: Math.max(start + 0.5, next) };
        })
        .filter((entry) => entry.text)
        .map((entry) => {
            const image = path.join(rawDir, entry.image);
            return {
                ...entry,
                image,
                widthShare: (pngWidth(image) * captionScale) / OUTPUT.width,
            };
        });
    const actions = events.filter((event) => event.auto && event.box);
    const captions = placeCaptions(captionEntries, actions, moves, viewport);

    const inputs = ["-i", rawPath];
    const edge = Math.round(12 * (OUTPUT.width / W));
    let last = "cam0";
    captions.forEach((entry, i) => {
        const length = entry.end - entry.start;
        inputs.push("-loop", "1", "-framerate", String(FPS), "-t", fmt(length), "-i", entry.image);
        const fadeIn = entry.start < 0.05 ? "" : "fade=t=in:st=0:d=0.25:alpha=1,";
        const fadeOut =
            entry.end >= outputDuration - 0.05
                ? ""
                : `fade=t=out:st=${fmt(Math.max(0, length - 0.25))}:d=0.25:alpha=1,`;
        filters.push(
            `[${i + 1}:v]format=rgba,scale=iw*${fmt(captionScale)}:-1,${fadeIn}${fadeOut}` +
                `setpts=PTS+${fmt(entry.start)}/TB[cap${i}]`,
        );
        const yPos = entry.position === "top" ? `${Math.round(edge / 2)}` : `H-h-${edge}`;
        filters.push(
            `[${last}][cap${i}]overlay=x=(W-w)/2:y=${yPos}:eof_action=pass[cam${i + 1}]`,
        );
        last = `cam${i + 1}`;
    });

    const result = spawnSync(
        ffmpegPath,
        [
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            ...inputs,
            "-filter_complex",
            filters.join(";"),
            "-map",
            `[${last}]`,
            "-t",
            fmt(outputDuration),
            "-an",
            "-c:v",
            "libvpx-vp9",
            "-crf",
            "31",
            "-b:v",
            "0",
            "-row-mt",
            "1",
            "-deadline",
            "good",
            "-cpu-used",
            "2",
            "-pix_fmt",
            "yuv420p",
            outPath,
        ],
        { stdio: "inherit" },
    );
    if (result.status !== 0) {
        throw new Error(`ffmpeg failed to polish ${rawPath}`);
    }

    return {
        rawDuration: duration,
        outputDuration: Number(outputDuration.toFixed(2)),
        cuts,
        moves: moves.length,
        captions: captions.length,
        topCaptions: captions.filter((entry) => entry.position === "top").length,
    };
}
