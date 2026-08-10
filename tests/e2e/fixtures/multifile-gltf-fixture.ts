import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.join(__dirname, "..", "assets", "multifile-gltf");
const TEMP_DIR = path.join(__dirname, "..", "data");

/**
 * A staged multi-file glTF import group: a loose `.gltf` primary plus its external
 * `.bin` buffer and `.png` texture. The primary is given a per-run-unique name (and a
 * unique `asset.extras` marker) so its SHA256 doesn't collapse under server-side
 * dedup and the derived model name is unique per scenario. The `.bin`/`.png` keep the
 * exact filenames the `.gltf` references by relative URI (`Quad.bin`, `Quad.png`) —
 * that's what the worker's LoadingManager URLModifier resolves against.
 */
export interface StagedMultiFileGltf {
    /** The directory holding all three files. */
    dir: string;
    /** Absolute paths: [primary .gltf, Quad.bin, Quad.png]. */
    files: string[];
    /** Absolute path of the primary `.gltf`. */
    primary: string;
    /** The model name Modelibr derives from the primary file (no extension). */
    modelName: string;
}

/** Stage the fixture into a fresh temp dir with a unique primary name. */
export async function stageMultiFileGltf(): Promise<StagedMultiFileGltf> {
    const shortId = crypto.randomUUID().substring(0, 8);
    const dir = path.join(TEMP_DIR, `multifile-${shortId}`);
    await fs.mkdir(dir, { recursive: true });

    // Vary the primary's content + name so it never dedups across runs, but keep the
    // external URIs it references intact (Quad.bin / Quad.png).
    const gltf = JSON.parse(
        await fs.readFile(path.join(SOURCE_DIR, "Quad.gltf"), "utf8"),
    );
    gltf.asset = gltf.asset ?? {};
    gltf.asset.extras = { ...(gltf.asset.extras ?? {}), _e2eUniqueId: shortId };

    const modelName = `Quad-${shortId}`;
    const primary = path.join(dir, `${modelName}.gltf`);
    await fs.writeFile(primary, JSON.stringify(gltf));

    const bin = path.join(dir, "Quad.bin");
    const png = path.join(dir, "Quad.png");
    await fs.copyFile(path.join(SOURCE_DIR, "Quad.bin"), bin);
    await fs.copyFile(path.join(SOURCE_DIR, "Quad.png"), png);

    return { dir, files: [primary, bin, png], primary, modelName };
}

/**
 * Zip a staged group into a self-contained `.zip` for the zip-import path. Built
 * in-process (store method, no external `zip` binary) so the suite stays hermetic.
 * The archive entries are the bare filenames the `.gltf` references, so the backend's
 * unzip-then-group produces the same shape as the folder path.
 */
export async function zipMultiFileGltf(
    staged: StagedMultiFileGltf,
): Promise<string> {
    const entries = await Promise.all(
        staged.files.map(async (f) => ({
            name: path.basename(f),
            data: await fs.readFile(f),
        })),
    );
    const zipPath = path.join(staged.dir, `${staged.modelName}.zip`);
    await fs.writeFile(zipPath, buildZip(entries));
    return zipPath;
}

// ── Minimal ZIP writer (deflate, one entry per file) ────────────────────────────
function buildZip(entries: { name: string; data: Buffer }[]): Buffer {
    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;

    for (const entry of entries) {
        const nameBuf = Buffer.from(entry.name, "utf8");
        const crc = crc32(entry.data);
        const compressed = zlib.deflateRawSync(entry.data);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0); // local file header signature
        local.writeUInt16LE(20, 4); // version needed
        local.writeUInt16LE(0, 6); // flags
        local.writeUInt16LE(8, 8); // method: deflate
        local.writeUInt16LE(0, 10); // mod time
        local.writeUInt16LE(0, 12); // mod date
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(compressed.length, 18);
        local.writeUInt32LE(entry.data.length, 22);
        local.writeUInt16LE(nameBuf.length, 26);
        local.writeUInt16LE(0, 28); // extra length
        locals.push(local, nameBuf, compressed);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0); // central dir signature
        central.writeUInt16LE(20, 4); // version made by
        central.writeUInt16LE(20, 6); // version needed
        central.writeUInt16LE(0, 8); // flags
        central.writeUInt16LE(8, 10); // method
        central.writeUInt16LE(0, 12);
        central.writeUInt16LE(0, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(compressed.length, 20);
        central.writeUInt32LE(entry.data.length, 24);
        central.writeUInt16LE(nameBuf.length, 28);
        central.writeUInt16LE(0, 30); // extra
        central.writeUInt16LE(0, 32); // comment
        central.writeUInt16LE(0, 34); // disk
        central.writeUInt16LE(0, 36); // internal attrs
        central.writeUInt32LE(0, 38); // external attrs
        central.writeUInt32LE(offset, 42); // local header offset
        centrals.push(central, nameBuf);

        offset += local.length + nameBuf.length + compressed.length;
    }

    const centralBuf = Buffer.concat(centrals);
    const localBuf = Buffer.concat(locals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); // end of central dir signature
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralBuf.length, 12);
    end.writeUInt32LE(localBuf.length, 16); // central dir offset
    end.writeUInt16LE(0, 20);

    return Buffer.concat([localBuf, centralBuf, end]);
}

function crc32(buf: Buffer): number {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        crc ^= buf[i];
        for (let k = 0; k < 8; k++) {
            crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}
