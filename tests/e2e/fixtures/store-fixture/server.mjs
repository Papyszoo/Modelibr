// Tiny stand-in for the companion Asset Store, serving exactly the
// Modelibr-integration contract (store repo docs/INTEGRATION.md) that the
// Asset Store E2E scenario needs: login/refresh, library, import-token
// minting, and the manifest/download endpoints the LOCAL BACKEND pulls
// from with `Authorization: ImportToken <token>`.
//
// It runs inside the webapi container's network namespace (compose
// `network_mode: service:webapi-e2e`), so ONE url - http://localhost:9280 -
// reaches it from both the browser (host port publish) and the backend
// (loopback, which the importer's URL safety allows for http).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 9280);
// The browser talks to the store's fixed https origin, so the fixture also
// serves TLS for the host-resolver mapping the Playwright config installs.
const TLS_PORT = Number(process.env.TLS_PORT || 0);
const TLS_CERT = process.env.TLS_CERT || "server.crt";
const TLS_KEY = process.env.TLS_KEY || "server.key";
// The base baked into manifest downloadUrls - must be the store's own host
// so the backend trusts it (same-host rule) and sends the import token.
const PUBLIC_BASE = process.env.PUBLIC_BASE || `http://localhost:${PORT}`;

const EMAIL = "artist@store.test";
const PASSWORD = "e2e-store-pass";
const ACCESS_TOKEN = "e2e-access-token";
const REFRESH_TOKEN = "e2e-refresh-token";
const IMPORT_TOKEN = "e2e-import-token";
// The browser sign-in path browses the store by its own non-Guid pack id.
const ASSET_ID = "e2e-props-pack";
// The agent catalog path (MCP) requires the store's public catalog contract:
// anonymous routes and Guid asset ids. A separate, free, GUID-keyed asset keeps
// those two paths from sharing bytes (SHA dedupe) or provenance.
const CATALOG_ASSET_ID = "3b1a2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const CATALOG_ITEM_ID = "7c8d9e0f-1a2b-4c3d-9e4f-5a6b7c8d9e0f";
const CATALOG_PREVIEW_ID = "9e0f1a2b-3c4d-4e5f-8a6b-7c8d9e0f1a2b";
const CATALOG_TITLE = "E2E Catalog Cube";
// A second anonymous Guid asset for the signed-out UI import scenario. It is
// kept SEPARATE from the MCP catalog asset and the texture pack so no two
// scenarios race the same pack (they run in parallel): different ids,
// different bytes.
const FREE_ASSET_ID = "2d3c4b5a-6e7f-4890-9a1b-2c3d4e5f6a7b";
const FREE_ITEM_ID = "8a9b0c1d-2e3f-4a5b-8c7d-6e5f4a3b2c1d";
const FREE_PACK_TITLE = "E2E Free Props Pack";
const FREE_TITLE = "E2E Free Cube";
// The free TEXTURE pack: a second anonymous Guid asset whose items are
// TextureSets. Its maps are the formats real store texture packs ship -
// KTX2, WebP and PNG - which the importer must accept as textures.
const TEXTURE_ASSET_ID = "6f1e2d3c-4b5a-6978-8c9d-0e1f2a3b4c5d";
const TEXTURE_ITEM_ID = "1a2b3c4d-5e6f-4a7b-9c8d-7e6f5a4b3c2d";
const TEXTURE_PACK_TITLE = "E2E Texture Pack";
const TEXTURE_SET_TITLE = "E2E Brick Material";
const TEXTURE_CATEGORY = "E2E Store Textures";

const here = path.dirname(fileURLToPath(import.meta.url));

// The shared test-cube.glb is uploaded RAW by other e2e scenarios (e.g.
// upload-window, model-categories), so serving it byte-identical makes the
// importer SHA-256-dedupe onto that pre-existing model (named "test-cube")
// instead of creating "E2E Test Cube" - failing the provenance scenario in
// full-suite runs. Re-tag the GLB's JSON chunk (spec-compliant asset.extras
// edit, same technique as fixtures/unique-file-generator.ts) so the store's
// bytes are unique to the fixture while staying a valid GLB. Deterministic on
// purpose: retries and re-imports must still dedupe against the FIRST import
// of this fixture within a run.
function retagGlb(buffer, marker) {
    if (buffer.readUInt32LE(0) !== 0x46546c67) {
        throw new Error("store-fixture: asset is not a GLB");
    }
    const jsonLen = buffer.readUInt32LE(12);
    if (buffer.readUInt32LE(16) !== 0x4e4f534a) {
        throw new Error("store-fixture: first GLB chunk is not JSON");
    }
    const gltf = JSON.parse(
        buffer
            .subarray(20, 20 + jsonLen)
            .toString("utf8")
            .trim(),
    );
    gltf.asset = gltf.asset || { version: "2.0" };
    gltf.asset.extras = { ...gltf.asset.extras, _storeFixture: marker };
    let json = JSON.stringify(gltf);
    json += " ".repeat((4 - (json.length % 4)) % 4);
    const jsonBuf = Buffer.from(json, "utf8");
    const bin = buffer.subarray(20 + jsonLen);
    const out = Buffer.alloc(12 + 8 + jsonBuf.length + bin.length);
    buffer.copy(out, 0, 0, 12);
    out.writeUInt32LE(out.length, 8);
    out.writeUInt32LE(jsonBuf.length, 12);
    out.writeUInt32LE(0x4e4f534a, 16); // 'JSON'
    jsonBuf.copy(out, 20);
    bin.copy(out, 20 + jsonBuf.length);
    return out;
}

const files = {
    // fileId → { name, contentType, bytes }
    1: {
        name: "test-cube.glb",
        contentType: "model/gltf-binary",
        bytes: retagGlb(
            readFileSync(path.join(here, "assets/test-cube.glb")),
            "e2e-store-fixture",
        ),
    },
    2: {
        name: "preview.png",
        contentType: "image/png",
        bytes: readFileSync(path.join(here, "assets/blue_color.png")),
    },
    // The agent catalog asset's mesh. Re-tagged with a DIFFERENT marker than the
    // browser pack's file so its SHA-256 differs - otherwise the first import
    // would dedupe the second one's model away.
    3: {
        name: "test-cube.glb",
        contentType: "model/gltf-binary",
        bytes: retagGlb(
            readFileSync(path.join(here, "assets/test-cube.glb")),
            "e2e-store-catalog",
        ),
    },
    // The texture pack's maps. Freshly generated files (not shared with other
    // scenarios' uploads), one per shipped container format.
    4: {
        name: "brick_albedo.ktx2",
        contentType: "image/ktx2",
        bytes: readFileSync(
            path.join(here, "assets/store-texture-brick_albedo.ktx2"),
        ),
    },
    5: {
        name: "brick_normal.webp",
        contentType: "image/webp",
        bytes: readFileSync(
            path.join(here, "assets/store-texture-brick_normal.webp"),
        ),
    },
    6: {
        name: "brick_roughness.png",
        contentType: "image/png",
        bytes: readFileSync(
            path.join(here, "assets/store-texture-brick_roughness.png"),
        ),
    },
    // The signed-out UI scenario's mesh - re-tagged with its own marker so its
    // SHA-256 is unique to this asset (see the catalog file's comment).
    7: {
        name: "test-cube.glb",
        contentType: "model/gltf-binary",
        bytes: retagGlb(
            readFileSync(path.join(here, "assets/test-cube.glb")),
            "e2e-store-free-props",
        ),
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
            id: "11111111-1111-1111-1111-111111111111",
            itemType: "Model",
            name: "E2E Test Cube",
            // Taxonomy v1 category - the importer must find-or-create the
            // "Props" model category and file the imported model under it.
            metadataJson: JSON.stringify({ category: "Props" }),
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

// Catalog detail (GET /api/assets/{id}) - what the Asset Store tab's pack
// detail view lists for per-item import selection. Item ids match the
// manifest's so selectedItemIds round-trip to the importer.
const assetDetail = {
    id: ASSET_ID,
    title: "E2E Props Pack",
    author: "E2E Fixture",
    isPack: true,
    files: [
        {
            id: "f1",
            fileName: files[1].name,
            relativePath: files[1].name,
            fileSize: files[1].bytes.length,
        },
    ],
    items: [
        {
            id: "11111111-1111-1111-1111-111111111111",
            itemType: "Model",
            name: "E2E Test Cube",
            isPreviewable: true,
            fileIds: ["f1"],
            category: "Props",
        },
    ],
    previews: [],
};

const libraryItem = {
    assetId: ASSET_ID,
    title: "E2E Props Pack",
    author: "E2E Fixture",
    // Mirrors the store's LibraryEntryResponse.ItemTypes (its CategoryName is gone).
    itemTypes: ["Model"],
    license: "CC0",
    isPack: true,
    fileCount: 1,
    totalSize: files[1].bytes.length,
    previewThumbnailUrl: `${PUBLIC_BASE}/api/files/2/download`,
    addedAt: "2026-07-01T00:00:00+00:00",
};

// Catalog detail (GET /api/assets/{guid}) - the shape the backend's
// StoreCatalogClient deserializes into StoreAssetDto. Anonymous, and the id
// is a Guid because the catalog client parses it as one.
const catalogAssetDetail = {
    id: CATALOG_ASSET_ID,
    title: "E2E Catalog Pack",
    description: "Fixture pack for the agent catalog path.",
    author: "E2E Fixture",
    thumbnailUrl: `${PUBLIC_BASE}/api/files/2/download`,
    itemTypes: ["Model"],
    formats: ["glb"],
    fileSize: files[3].bytes.length,
    isPack: true,
    itemCount: 1,
    downloadCount: 0,
    tags: ["e2e", "catalog"],
    price: 0,
    currency: "USD",
    creditName: "E2E Fixture",
    creditUrl: `${PUBLIC_BASE}/credits/e2e-fixture`,
    license: "CC0",
    items: [
        {
            id: CATALOG_ITEM_ID,
            itemType: "Model",
            name: CATALOG_TITLE,
            isPreviewable: true,
            category: "Catalog Props",
            subcategory: null,
        },
    ],
    previews: [
        {
            id: CATALOG_PREVIEW_ID,
            type: "Thumbnail",
            url: `${PUBLIC_BASE}/api/files/2/download`,
            fileName: "preview.png",
            packItemId: CATALOG_ITEM_ID,
        },
    ],
};

// Catalog manifest (GET /api/assets/{guid}/manifest) - anonymous because a free
// approved asset is fetchable with no credential (the agent import sends none).
const catalogManifest = {
    schemaVersion: 1,
    title: "E2E Catalog Pack",
    description: "Fixture pack for the agent catalog path.",
    license: "CC0",
    author: "E2E Fixture",
    creditName: "E2E Fixture",
    creditUrl: `${PUBLIC_BASE}/credits/e2e-fixture`,
    tags: ["e2e", "catalog"],
    items: [
        {
            id: CATALOG_ITEM_ID,
            itemType: "Model",
            name: CATALOG_TITLE,
            metadataJson: JSON.stringify({ category: "Catalog Props" }),
            description: "A catalog-imported cube.",
            tags: ["catalog-import"],
            files: [
                {
                    fileName: files[3].name,
                    fileSize: files[3].bytes.length,
                    sha256: sha256(files[3].bytes),
                    role: "Mesh",
                    downloadUrl: `${PUBLIC_BASE}/api/files/3/download`,
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

// The free TEXTURE pack's catalog detail (GET /api/assets/{guid}), anonymous.
// One TextureSet item carrying the maps a real PBR material ships - a KTX2
// albedo, a WebP normal and a PNG roughness.
const texturePackDetail = {
    id: TEXTURE_ASSET_ID,
    title: TEXTURE_PACK_TITLE,
    description: "Fixture texture pack for the free texture-set import path.",
    author: "E2E Fixture",
    thumbnailUrl: `${PUBLIC_BASE}/api/files/2/download`,
    itemTypes: ["TextureSet"],
    formats: ["ktx2", "webp", "png"],
    fileSize:
        files[4].bytes.length + files[5].bytes.length + files[6].bytes.length,
    isPack: true,
    itemCount: 1,
    downloadCount: 0,
    tags: ["e2e", "textures"],
    price: 0,
    currency: "USD",
    creditName: "E2E Fixture",
    creditUrl: `${PUBLIC_BASE}/credits/e2e-fixture`,
    license: "CC0",
    items: [
        {
            id: TEXTURE_ITEM_ID,
            itemType: "TextureSet",
            name: TEXTURE_SET_TITLE,
            isPreviewable: false,
            category: TEXTURE_CATEGORY,
            subcategory: null,
        },
    ],
    previews: [],
};

// The texture pack's manifest (GET /api/assets/{guid}/manifest), anonymous.
const texturePackManifest = {
    schemaVersion: 1,
    title: TEXTURE_PACK_TITLE,
    description: "Fixture texture pack for the free texture-set import path.",
    license: "CC0",
    author: "E2E Fixture",
    creditName: "E2E Fixture",
    creditUrl: `${PUBLIC_BASE}/credits/e2e-fixture`,
    tags: ["e2e", "textures"],
    items: [
        {
            id: TEXTURE_ITEM_ID,
            itemType: "TextureSet",
            name: TEXTURE_SET_TITLE,
            metadataJson: JSON.stringify({ category: TEXTURE_CATEGORY }),
            files: [
                {
                    fileName: files[4].name,
                    fileSize: files[4].bytes.length,
                    sha256: sha256(files[4].bytes),
                    role: "Texture:Albedo",
                    downloadUrl: `${PUBLIC_BASE}/api/files/4/download`,
                },
                {
                    fileName: files[5].name,
                    fileSize: files[5].bytes.length,
                    sha256: sha256(files[5].bytes),
                    role: "Texture:Normal",
                    downloadUrl: `${PUBLIC_BASE}/api/files/5/download`,
                },
                {
                    fileName: files[6].name,
                    fileSize: files[6].bytes.length,
                    sha256: sha256(files[6].bytes),
                    role: "Texture:Roughness:R",
                    downloadUrl: `${PUBLIC_BASE}/api/files/6/download`,
                },
            ],
            previews: [],
        },
    ],
    previews: [],
};

// The signed-out UI import scenario's asset - anonymous Guid id, free, and its
// own bytes so nothing else dedupes against it.
const freePackDetail = {
    id: FREE_ASSET_ID,
    title: FREE_PACK_TITLE,
    description: "Fixture pack for the signed-out UI import path.",
    author: "E2E Fixture",
    thumbnailUrl: `${PUBLIC_BASE}/api/files/2/download`,
    itemTypes: ["Model"],
    formats: ["glb"],
    fileSize: files[7].bytes.length,
    isPack: true,
    itemCount: 1,
    downloadCount: 0,
    tags: ["e2e", "free"],
    price: 0,
    currency: "USD",
    creditName: "E2E Fixture",
    creditUrl: `${PUBLIC_BASE}/credits/e2e-fixture`,
    license: "CC0",
    items: [
        {
            id: FREE_ITEM_ID,
            itemType: "Model",
            name: FREE_TITLE,
            isPreviewable: true,
            category: "Free Props",
            subcategory: null,
        },
    ],
    previews: [],
};

const freePackManifest = {
    schemaVersion: 1,
    title: FREE_PACK_TITLE,
    description: "Fixture pack for the signed-out UI import path.",
    license: "CC0",
    author: "E2E Fixture",
    creditName: "E2E Fixture",
    creditUrl: `${PUBLIC_BASE}/credits/e2e-fixture`,
    tags: ["e2e", "free"],
    items: [
        {
            id: FREE_ITEM_ID,
            itemType: "Model",
            name: FREE_TITLE,
            metadataJson: JSON.stringify({ category: "Free Props" }),
            files: [
                {
                    fileName: files[7].name,
                    fileSize: files[7].bytes.length,
                    sha256: sha256(files[7].bytes),
                    role: "Mesh",
                    downloadUrl: `${PUBLIC_BASE}/api/files/7/download`,
                },
            ],
            previews: [],
        },
    ],
    previews: [],
};

const catalogAssets = [catalogAssetDetail, freePackDetail, texturePackDetail];

const catalogAssetById = (id) =>
    catalogAssets.find((asset) => asset.id.toLowerCase() === id.toLowerCase());

// GET /api/assets - the public catalog search. The backend's StoreCatalogClient
// calls this anonymously with page/pageSize and the optional filters; the
// browser's signed-out tab uses it as a plain list.
function catalogSearchResults(url) {
    const search = (url.searchParams.get("search") || "").trim().toLowerCase();
    const itemType = url.searchParams.get("itemType");
    const tag = url.searchParams.get("tag");
    const format = url.searchParams.get("format");

    const items = catalogAssets.filter((asset) => {
        const haystack =
            `${asset.title} ${asset.author} ${asset.description}`.toLowerCase();
        return (
            (!search || haystack.includes(search)) &&
            (!itemType || asset.itemTypes.includes(itemType)) &&
            (!tag || asset.tags.includes(tag)) &&
            (!format || asset.formats.includes(format))
        );
    });
    return {
        items,
        page: 1,
        pageSize: 12,
        totalCount: items.length,
        totalPages: items.length > 0 ? 1 : 0,
    };
}

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

const handleRequest = async (req, res) => {
    // Open CORS - mirrors the store's credential-less ModelibrImport policy.
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

    if (route === `GET /api/assets/${ASSET_ID}`) {
        if (!hasBearer(req)) return json(res, 401, { message: "Unauthorized" });
        return json(res, 200, assetDetail);
    }

    if (route === `GET /api/assets/${ASSET_ID}/manifest`) {
        if (!hasImportToken(req))
            return json(res, 401, { message: "Unauthorized" });
        return json(res, 200, manifest);
    }

    // ── Agent catalog contract (anonymous, Guid ids) ──────────────────────
    // The backend's StoreCatalogClient sends no credential and parses asset
    // ids as Guids, so these routes must not require the browser's Bearer.
    if (route === "GET /api/assets") {
        return json(res, 200, catalogSearchResults(url));
    }

    const catalogDetail = url.pathname.match(
        /^\/api\/assets\/([0-9a-fA-F-]{36})$/,
    );
    if (req.method === "GET" && catalogDetail) {
        const asset = catalogAssetById(catalogDetail[1]);
        if (asset) return json(res, 200, asset);
        return json(res, 404, { message: "No such asset." });
    }

    const catalogManifestRoute = url.pathname.match(
        /^\/api\/assets\/([0-9a-fA-F-]{36})\/manifest$/,
    );
    if (req.method === "GET" && catalogManifestRoute) {
        const id = catalogManifestRoute[1].toLowerCase();
        if (id === CATALOG_ASSET_ID) {
            return json(res, 200, catalogManifest);
        }
        if (id === FREE_ASSET_ID) {
            return json(res, 200, freePackManifest);
        }
        if (id === TEXTURE_ASSET_ID) {
            return json(res, 200, texturePackManifest);
        }
        return json(res, 404, { message: "No such asset." });
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
};

http.createServer(handleRequest).listen(PORT, () => {
    console.log(`[store-fixture] listening on :${PORT} (base ${PUBLIC_BASE})`);
});

if (TLS_PORT) {
    https
        .createServer(
            {
                cert: readFileSync(TLS_CERT),
                key: readFileSync(TLS_KEY),
            },
            handleRequest,
        )
        .listen(TLS_PORT, () => {
            console.log(
                `[store-fixture] listening on https://store.modelibr.com:${TLS_PORT}`,
            );
        });
}
