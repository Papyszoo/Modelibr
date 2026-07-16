// Tiny stand-in for the companion Asset Store, serving exactly the
// Modelibr-integration contract (store repo docs/INTEGRATION.md) that the
// Asset Store E2E scenario needs: login/refresh, library, import-token
// minting, and the manifest/download endpoints the LOCAL BACKEND pulls
// from with `Authorization: ImportToken <token>`.
//
// It runs inside the webapi container's network namespace (compose
// `network_mode: service:webapi-e2e`), so ONE url — http://localhost:9280 —
// reaches it from both the browser (host port publish) and the backend
// (loopback, which the importer's URL safety allows for http).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 9280);
// The base baked into manifest downloadUrls — must be the store's own host
// so the backend trusts it (same-host rule) and sends the import token.
const PUBLIC_BASE = process.env.PUBLIC_BASE || `http://localhost:${PORT}`;

const EMAIL = "artist@store.test";
const PASSWORD = "e2e-store-pass";
const ACCESS_TOKEN = "e2e-access-token";
const REFRESH_TOKEN = "e2e-refresh-token";
const IMPORT_TOKEN = "e2e-import-token";
const ASSET_ID = "e2e-props-pack";

const here = path.dirname(fileURLToPath(import.meta.url));
const files = {
    // fileId → { name, contentType, bytes }
    1: {
        name: "test-cube.glb",
        contentType: "model/gltf-binary",
        bytes: readFileSync(path.join(here, "assets/test-cube.glb")),
    },
    2: {
        name: "preview.png",
        contentType: "image/png",
        bytes: readFileSync(path.join(here, "assets/blue_color.png")),
    },
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const manifest = {
    schemaVersion: 1,
    title: "E2E Props Pack",
    description: "Fixture pack served by the e2e store stand-in.",
    license: "CC0",
    tags: ["e2e", "props"],
    items: [
        {
            itemType: "Model",
            name: "E2E Test Cube",
            files: [
                {
                    fileName: files[1].name,
                    fileSize: files[1].bytes.length,
                    sha256: sha256(files[1].bytes),
                    role: "Mesh",
                    downloadUrl: `${PUBLIC_BASE}/api/files/1/download`,
                },
            ],
            previews: [],
        },
    ],
    previews: [
        {
            type: "Thumbnail",
            fileName: files[2].name,
            contentType: files[2].contentType,
            url: `${PUBLIC_BASE}/api/files/2/download`,
        },
    ],
};

const libraryItem = {
    assetId: ASSET_ID,
    title: "E2E Props Pack",
    author: "E2E Fixture",
    categoryName: "Props",
    license: "CC0",
    isPack: true,
    fileCount: 1,
    totalSize: files[1].bytes.length,
    previewThumbnailUrl: `${PUBLIC_BASE}/api/files/2/download`,
    addedAt: "2026-07-01T00:00:00+00:00",
};

const json = (res, status, body) => {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
    });
    res.end(payload);
};

const readBody = (req) =>
    new Promise((resolve) => {
        let data = "";
        req.on("data", (chunk) => (data += chunk));
        req.on("end", () => {
            try {
                resolve(data ? JSON.parse(data) : {});
            } catch {
                resolve({});
            }
        });
    });

const hasBearer = (req) =>
    (req.headers.authorization || "").startsWith(`Bearer ${ACCESS_TOKEN}`);
const hasImportToken = (req) =>
    req.headers.authorization === `ImportToken ${IMPORT_TOKEN}` ||
    hasBearer(req);

const server = http.createServer(async (req, res) => {
    // Open CORS — mirrors the store's credential-less ModelibrImport policy.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
    }

    const url = new URL(req.url, PUBLIC_BASE);
    const route = `${req.method} ${url.pathname}`;
    console.log(`[store-fixture] ${route}`);

    if (route === "GET /health") {
        return json(res, 200, { status: "ok" });
    }

    if (route === "POST /api/auth/login") {
        const body = await readBody(req);
        if (body.email !== EMAIL || body.password !== PASSWORD) {
            return json(res, 401, { message: "Invalid email or password." });
        }
        return json(res, 200, {
            accessToken: ACCESS_TOKEN,
            refreshToken: REFRESH_TOKEN,
            refreshTokenExpiresAt: new Date(Date.now() + 86400000).toISOString(),
            username: "e2e-artist",
            role: "User",
        });
    }

    if (route === "POST /api/auth/refresh") {
        const body = await readBody(req);
        if (body.refreshToken !== REFRESH_TOKEN) {
            return json(res, 401, { message: "Invalid refresh token." });
        }
        return json(res, 200, {
            accessToken: ACCESS_TOKEN,
            refreshToken: REFRESH_TOKEN,
            refreshTokenExpiresAt: new Date(Date.now() + 86400000).toISOString(),
            username: "e2e-artist",
            role: "User",
        });
    }

    if (route === "GET /api/library") {
        if (!hasBearer(req)) return json(res, 401, { message: "Unauthorized" });
        return json(res, 200, {
            items: [libraryItem],
            page: 1,
            pageSize: 24,
            totalCount: 1,
            totalPages: 1,
        });
    }

    if (route === `POST /api/library/${ASSET_ID}/import-token`) {
        if (!hasBearer(req)) return json(res, 401, { message: "Unauthorized" });
        return json(res, 200, {
            token: IMPORT_TOKEN,
            scheme: "ImportToken",
            expiresAt: new Date(Date.now() + 600000).toISOString(),
        });
    }

    if (route === `GET /api/assets/${ASSET_ID}/manifest`) {
        if (!hasImportToken(req))
            return json(res, 401, { message: "Unauthorized" });
        return json(res, 200, manifest);
    }

    const download = url.pathname.match(/^\/api\/files\/(\d+)\/download$/);
    if (req.method === "GET" && download) {
        const file = files[download[1]];
        if (!file) return json(res, 404, { message: "No such file." });
        // Previews are fetched by the browser <img> (no header); manifests'
        // file downloads come from the backend with the import token.
        if (download[1] === "1" && !hasImportToken(req))
            return json(res, 401, { message: "Unauthorized" });
        res.writeHead(200, {
            "Content-Type": file.contentType,
            "Content-Length": file.bytes.length,
        });
        return res.end(file.bytes);
    }

    return json(res, 404, { message: `No route: ${route}` });
});

server.listen(PORT, () => {
    console.log(`[store-fixture] listening on :${PORT} (base ${PUBLIC_BASE})`);
});
