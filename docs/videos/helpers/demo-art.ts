import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { expect, type Page } from "@playwright/test";
import { withScratchPage } from "./video-helpers";

const assetsDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../tests/e2e/assets",
);
const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:8090";

/**
 * The e2e test meshes, uploaded under prop-like names: a model is named after
 * its file, and "test-cube" twice in a grid reads as fixture clutter.
 */
const demoModelNames: Record<string, string> = {
    "test-cube.glb": "cargo-crate",
    "test-cone.fbx": "traffic-cone",
    "test-cylinder.fbx": "fuel-barrel",
    "test-torus.fbx": "spare-tire",
    "test-icosphere.fbx": "boulder",
    "textured-cube.fbx": "supply-box",
    "test-cube.stl": "stone-block",
};

/** Upload one of the e2e test meshes as a model; returns its id. */
export async function uploadDemoModel(page: Page, file: string, name = demoModelNames[file]) {
    const response = await page.request.post(`${API_BASE_URL}/models`, {
        multipart: {
            file: {
                name: `${name ?? path.parse(file).name}${path.extname(file)}`,
                mimeType: "application/octet-stream",
                buffer: fs.readFileSync(path.join(assetsDir, file)),
            },
        },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    return Number(body.id ?? body.modelId);
}

/** Upload a mesh as the new, active version of an existing model. */
export async function uploadDemoVersion(page: Page, modelId: number, file: string, name: string) {
    const response = await page.request.post(`${API_BASE_URL}/models/${modelId}/versions`, {
        multipart: {
            file: {
                name: `${name}${path.extname(file)}`,
                mimeType: "application/octet-stream",
                buffer: fs.readFileSync(path.join(assetsDir, file)),
            },
            description: "Final tire",
            setAsActive: "true",
        },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
}

/**
 * Demo imagery for the clips, drawn from inline SVG at setup time so the
 * clips show plausible game art instead of flat test-colour squares, without
 * committing binaries. Rendering is deterministic: same SVG, same PNG.
 */
export const demoArt = {
    playButton: `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
            <defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#2563eb"/></linearGradient></defs>
            <rect x="24" y="84" width="208" height="88" rx="28" fill="#1e3a8a"/>
            <rect x="24" y="76" width="208" height="88" rx="28" fill="url(#b)"/>
            <rect x="40" y="86" width="176" height="22" rx="11" fill="#ffffff" opacity="0.25"/>
            <path d="M104 98 L104 142 L142 120 Z" fill="#ffffff"/>
            <rect x="150" y="104" width="10" height="32" rx="4" fill="#ffffff" opacity="0.9"/>
        </svg>`,
    coin: `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
            <defs><radialGradient id="g" cx="0.4" cy="0.35" r="0.7">
                <stop offset="0" stop-color="#fde68a"/><stop offset="0.6" stop-color="#f59e0b"/>
                <stop offset="1" stop-color="#b45309"/></radialGradient></defs>
            <circle cx="128" cy="136" r="88" fill="#92400e"/>
            <circle cx="128" cy="128" r="88" fill="url(#g)"/>
            <circle cx="128" cy="128" r="64" fill="none" stroke="#fef3c7" stroke-width="6" opacity="0.7"/>
            <path d="M128 82 L141 113 L174 115 L148 136 L157 168 L128 150 L99 168 L108 136 L82 115 L115 113 Z" fill="#fffbeb"/>
        </svg>`,
    heart: `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
            <defs><linearGradient id="h" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#fb7185"/><stop offset="1" stop-color="#be123c"/></linearGradient></defs>
            <path d="M128 214 C 60 164 28 128 28 92 C 28 62 52 40 82 40 C 102 40 118 52 128 68 C 138 52 154 40 174 40 C 204 40 228 62 228 92 C 228 128 196 164 128 214 Z" fill="url(#h)"/>
            <ellipse cx="84" cy="84" rx="22" ry="14" fill="#ffffff" opacity="0.45" transform="rotate(-30 84 84)"/>
        </svg>`,
    gem: `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
            <path d="M72 56 L184 56 L232 108 L128 220 L24 108 Z" fill="#059669"/>
            <path d="M72 56 L184 56 L160 108 L96 108 Z" fill="#34d399"/>
            <path d="M24 108 L96 108 L128 220 Z" fill="#10b981"/>
            <path d="M232 108 L160 108 L128 220 Z" fill="#047857"/>
            <path d="M96 108 L160 108 L128 220 Z" fill="#6ee7b7" opacity="0.8"/>
        </svg>`,
    /** A wide landscape scene, used for project covers and references. */
    scene(sky: [string, string], ground: string, accent: string) {
        return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 270">
            <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs>
            <rect width="480" height="270" fill="url(#s)"/>
            <circle cx="360" cy="78" r="30" fill="${accent}" opacity="0.9"/>
            <path d="M0 190 L70 130 L130 175 L210 105 L300 180 L370 140 L480 196 L480 270 L0 270 Z" fill="${ground}" opacity="0.55"/>
            <path d="M0 220 L90 180 L170 214 L260 170 L350 218 L420 196 L480 214 L480 270 L0 270 Z" fill="${ground}"/>
        </svg>`;
    },
};

/** Render an SVG to a transparent PNG buffer of the given size. */
export async function renderSvg(page: Page, svg: string, width = 256, height = width) {
    return withScratchPage(page, async (artPage) => {
        await artPage.setViewportSize({ width, height });
        await artPage.setContent(
            `<style>html,body{margin:0;background:transparent}svg{display:block;width:${width}px;height:${height}px}</style>${svg}`,
        );
        return artPage.locator("svg").screenshot({ omitBackground: true, scale: "css" });
    });
}

/**
 * Short, distinct demo sounds as 16-bit mono WAV, so each card and the
 * editor show a recognisable waveform. A seeded generator keeps them identical
 * on every render.
 */
export function demoSound(kind: "ambience" | "click" | "chime"): Buffer {
    const rate = 22050;
    const seconds = { ambience: 4, click: 0.6, chime: 1.8 }[kind];
    const samples = Math.round(rate * seconds);
    let seed = 1234567;
    const noise = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff - 0.5;
    };

    const data = Buffer.alloc(samples * 2);
    let smooth = 0;
    for (let i = 0; i < samples; i++) {
        const t = i / rate;
        let v = 0;
        if (kind === "ambience") {
            smooth = smooth * 0.96 + noise() * 0.04;
            const swell = 0.55 + 0.45 * Math.sin(t * 1.7) * Math.sin(t * 0.6 + 1);
            v = smooth * 9 * swell + Math.sin(t * 2 * Math.PI * 880 + Math.sin(t * 9) * 3) * 0.05 * (Math.sin(t * 3) > 0.7 ? 1 : 0);
        } else if (kind === "click") {
            v = (noise() * 0.9 + Math.sin(t * 2 * Math.PI * 1800) * 0.6) * Math.exp(-t * 28)
                + Math.sin(t * 2 * Math.PI * 900) * 0.35 * Math.exp(-Math.max(0, t - 0.12) * 30) * (t > 0.12 ? 1 : 0);
        } else {
            const notes = [523.25, 659.25, 783.99, 1046.5];
            notes.forEach((freq, n) => {
                const start = n * 0.18;
                if (t >= start) {
                    v += Math.sin((t - start) * 2 * Math.PI * freq) * 0.32 * Math.exp(-(t - start) * 3.2);
                }
            });
        }
        data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), i * 2);
    }

    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + data.length, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(rate, 24);
    header.writeUInt32LE(rate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(data.length, 40);
    return Buffer.concat([header, data]);
}

/**
 * A tiled PBR material (albedo, normal, roughness PNGs) drawn on a canvas, so
 * the texture-set clip previews something with colour and relief. The tile
 * colours come from a seeded generator, so every render is identical.
 */
export async function demoMaterial(
    page: Page,
    options: { tile: [number, number, number]; grout: [number, number, number]; tiles?: number },
) {
    return withScratchPage(page, async (artPage) => {
        const urls = await artPage.evaluate(({ tile, grout, tiles = 4 }) => {
            const size = 512;
            const cell = size / tiles;
            const gap = cell * 0.06;
            let seed = 42;
            const rand = () => {
                seed = (seed * 16807) % 2147483647;
                return seed / 2147483647;
            };
            const shades = Array.from({ length: tiles * tiles }, () => 0.82 + rand() * 0.3);
            const height = (x: number, y: number) => {
                const cx = ((x % cell) + cell) % cell;
                const cy = ((y % cell) + cell) % cell;
                const edge = Math.min(cx, cy, cell - cx, cell - cy);
                if (edge < gap) return 0;
                return Math.min(1, (edge - gap) / (cell * 0.08));
            };
            const canvas = (paint: (x: number, y: number) => [number, number, number]) => {
                const c = document.createElement("canvas");
                c.width = c.height = size;
                const ctx = c.getContext("2d")!;
                const img = ctx.createImageData(size, size);
                for (let y = 0; y < size; y++) {
                    for (let x = 0; x < size; x++) {
                        const [r, g, b] = paint(x, y);
                        const i = (y * size + x) * 4;
                        img.data[i] = r;
                        img.data[i + 1] = g;
                        img.data[i + 2] = b;
                        img.data[i + 3] = 255;
                    }
                }
                ctx.putImageData(img, 0, 0);
                return c.toDataURL("image/png");
            };
            const albedo = canvas((x, y) => {
                if (height(x, y) === 0) return grout;
                const shade = shades[Math.floor(y / cell) * tiles + Math.floor(x / cell)];
                return tile.map((v) => Math.min(255, v * shade)) as [number, number, number];
            });
            const normal = canvas((x, y) => {
                const dx = (height(x + 1, y) - height(x - 1, y)) * 2.5;
                const dy = (height(x, y + 1) - height(x, y - 1)) * 2.5;
                const len = Math.hypot(dx, dy, 1);
                return [((-dx / len) * 0.5 + 0.5) * 255, ((dy / len) * 0.5 + 0.5) * 255, (1 / len) * 255];
            });
            const roughness = canvas((x, y) => {
                const v = height(x, y) === 0 ? 235 : 110;
                return [v, v, v];
            });
            return { albedo, normal, roughness };
        }, options);
        const toBuffer = (url: string) => Buffer.from(url.split(",")[1], "base64");
        return {
            albedo: toBuffer(urls.albedo),
            normal: toBuffer(urls.normal),
            roughness: toBuffer(urls.roughness),
        };
    });
}

// Texture type ids as the API expects them.
const ALBEDO = 1;
const NORMAL = 2;
const ROUGHNESS = 5;

/**
 * A global (tileable) texture set with albedo, normal and roughness maps from
 * demoMaterial, waiting until all three are attached. Returns its id.
 */
export async function createDemoTextureSet(
    page: Page,
    name: string,
    colours: { tile: [number, number, number]; grout: [number, number, number]; tiles?: number },
) {
    const maps = await demoMaterial(page, colours);
    const slug = name.toLowerCase().replace(/\s+/g, "-");
    const files = [
        { file: `${slug}_albedo.png`, buffer: maps.albedo, textureType: ALBEDO },
        { file: `${slug}_normal.png`, buffer: maps.normal, textureType: NORMAL },
        { file: `${slug}_roughness.png`, buffer: maps.roughness, textureType: ROUGHNESS },
    ];
    const [first, ...rest] = files;
    const createResponse = await page.request.post(
        `${API_BASE_URL}/texture-sets/with-file?name=${encodeURIComponent(name)}&textureType=${first.textureType}&kind=1`,
        { multipart: { file: { name: first.file, mimeType: "image/png", buffer: first.buffer } } },
    );
    expect(createResponse.ok()).toBeTruthy();
    const createBody = await createResponse.json();
    const textureSetId = Number(createBody.textureSetId ?? createBody.id);

    for (const map of rest) {
        const upload = await page.request.post(`${API_BASE_URL}/files?textureSetId=${textureSetId}`, {
            multipart: { file: { name: map.file, mimeType: "image/png", buffer: map.buffer } },
        });
        expect(upload.ok()).toBeTruthy();
        const uploadBody = await upload.json();
        const attach = await page.request.post(
            `${API_BASE_URL}/texture-sets/${textureSetId}/textures`,
            { data: { FileId: Number(uploadBody.id ?? uploadBody.fileId), TextureType: map.textureType } },
        );
        expect(attach.ok()).toBeTruthy();
    }

    await expect
        .poll(
            async () => {
                const response = await page.request.get(`${API_BASE_URL}/texture-sets/${textureSetId}`);
                return response.ok() ? ((await response.json()).textures?.length ?? 0) : -1;
            },
            { timeout: 15000, intervals: [500, 1000, 1500] },
        )
        .toBe(files.length);
    return textureSetId;
}
