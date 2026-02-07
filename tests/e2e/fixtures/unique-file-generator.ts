import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class UniqueFileGenerator {
    private static ASSETS_DIR = path.join(__dirname, "..", "assets");
    private static TEMP_DIR = path.join(__dirname, "..", "data");

    /**
     * Generates a unique copy of the source file with modified content
     * to produce a unique SHA256 hash (avoiding server-side deduplication).
     *
     * Supported formats:
     * - GLB: injects unique extras into JSON chunk (spec-compliant)
     * - PNG: injects a tEXt metadata chunk before IEND (spec-compliant)
     * - WAV: appends unique bytes to audio data (inaudible)
     * - Other binary (FBX, OBJ, etc): copies without modification
     *
     * @param sourceFilename - The name of the file in tests/e2e/assets/
     * @returns Absolute path to the unique file
     */
    static async generate(sourceFilename: string): Promise<string> {
        const sourcePath = path.join(this.ASSETS_DIR, sourceFilename);
        const uniqueId = crypto.randomUUID();
        const shortId = uniqueId.substring(0, 8);
        const tempDir = path.join(this.TEMP_DIR, shortId);

        // Ensure temp directory exists
        await fs.mkdir(tempDir, { recursive: true });

        // Keep original filename — the unique subdirectory prevents collisions,
        // and the modified content produces a unique SHA256 hash.
        // NOT renaming is critical: the server derives entity names (texture sets,
        // models) from the uploaded filename, so renaming breaks test assertions.
        const ext = path.extname(sourceFilename).toLowerCase();
        const uniqueFilename = sourceFilename;

        const targetPath = path.join(tempDir, uniqueFilename);
        const originalBuffer = await fs.readFile(sourcePath);

        let newBuffer: Buffer;

        if (ext === ".glb") {
            newBuffer = this.modifyGLBJson(originalBuffer, uniqueId);
        } else if (ext === ".png") {
            // Validate actual PNG signature before modifying — some .png files
            // may actually be JPEG or other formats with wrong extension.
            const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
            if (
                originalBuffer.length >= 8 &&
                originalBuffer.subarray(0, 8).compare(pngSig) === 0
            ) {
                newBuffer = this.modifyPNG(originalBuffer, uniqueId);
            } else {
                // Not a real PNG — append unique bytes to avoid dedup
                const marker = Buffer.from(`\n/* UniqueId: ${uniqueId} */`);
                newBuffer = Buffer.concat([originalBuffer, marker]);
                console.log(
                    `[UniqueFileGenerator] ${sourceFilename} has .png extension but is not PNG, appended unique marker`,
                );
            }
        } else if (ext === ".wav") {
            newBuffer = this.modifyWAV(originalBuffer, uniqueId);
        } else {
            // FBX, OBJ, etc — can't safely modify binary formats
            newBuffer = originalBuffer;
            console.log(
                `[UniqueFileGenerator] Binary file copied without modification`,
            );
        }

        await fs.writeFile(targetPath, newBuffer);
        console.log(
            `[UniqueFileGenerator] Generated: ${targetPath} (Base: ${sourceFilename})`,
        );

        return targetPath;
    }

    /**
     * Modifies the JSON chunk in a GLB file to add unique extras data.
     * This is spec-compliant and won't break any parsers.
     */
    private static modifyGLBJson(buffer: Buffer, uniqueData: string): Buffer {
        // GLB Header: Magic (4) + Version (4) + Length (4) = 12 bytes
        const magic = buffer.readUInt32LE(0);
        if (magic !== 0x46546c67) {
            // 'glTF'
            throw new Error("Invalid GLB magic number");
        }

        // Read JSON chunk header (starts at byte 12)
        const jsonChunkLength = buffer.readUInt32LE(12);
        const jsonChunkType = buffer.readUInt32LE(16);

        if (jsonChunkType !== 0x4e4f534a) {
            // 'JSON'
            throw new Error("First chunk is not JSON type");
        }

        // Extract JSON data (starts at byte 20)
        const jsonData = buffer
            .subarray(20, 20 + jsonChunkLength)
            .toString("utf8")
            .trim();

        // Parse and modify JSON
        const gltf = JSON.parse(jsonData);

        // Add unique ID to asset.extras
        if (!gltf.asset) {
            gltf.asset = { version: "2.0" };
        }
        if (!gltf.asset.extras) {
            gltf.asset.extras = {};
        }
        gltf.asset.extras._testUniqueId = uniqueData;

        // Serialize JSON back
        const newJsonString = JSON.stringify(gltf);

        // Pad JSON to 4-byte boundary
        const padding = (4 - (newJsonString.length % 4)) % 4;
        const paddedJson = newJsonString + " ".repeat(padding);
        const newJsonBuffer = Buffer.from(paddedJson, "utf8");
        const newJsonLength = newJsonBuffer.length;

        // Calculate where binary chunk starts in original
        const originalBinStart = 20 + jsonChunkLength;
        const binChunk = buffer.subarray(originalBinStart);

        // Build new GLB
        // Header (12) + JSON chunk header (8) + JSON data + BIN chunk
        const newTotalLength = 12 + 8 + newJsonLength + binChunk.length;

        const newBuffer = Buffer.alloc(newTotalLength);

        // Copy header
        buffer.copy(newBuffer, 0, 0, 12);

        // Update total length in header
        newBuffer.writeUInt32LE(newTotalLength, 8);

        // Write JSON chunk header
        newBuffer.writeUInt32LE(newJsonLength, 12);
        newBuffer.writeUInt32LE(0x4e4f534a, 16); // 'JSON'

        // Write JSON data
        newJsonBuffer.copy(newBuffer, 20);

        // Copy BIN chunk (if exists)
        if (binChunk.length > 0) {
            binChunk.copy(newBuffer, 20 + newJsonLength);
        }

        return newBuffer;
    }

    /**
     * Injects a tEXt chunk into a PNG file before the IEND marker.
     * PNG spec allows arbitrary tEXt chunks with keyword + text data.
     * This changes the file hash without affecting image rendering.
     */
    private static modifyPNG(buffer: Buffer, uniqueData: string): Buffer {
        // PNG signature: 8 bytes (137 80 78 71 13 10 26 10)
        const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
        if (buffer.subarray(0, 8).compare(pngSignature) !== 0) {
            throw new Error("Invalid PNG signature");
        }

        // Find IEND chunk (last 12 bytes: 4 length + 4 type "IEND" + 4 CRC)
        // IEND type bytes: 0x49 0x45 0x4E 0x44
        let iendOffset = -1;
        for (let i = buffer.length - 12; i >= 8; i--) {
            if (
                buffer[i + 4] === 0x49 &&
                buffer[i + 5] === 0x45 &&
                buffer[i + 6] === 0x4e &&
                buffer[i + 7] === 0x44
            ) {
                iendOffset = i;
                break;
            }
        }

        if (iendOffset === -1) {
            throw new Error("PNG IEND chunk not found");
        }

        // Build tEXt chunk: keyword "UniqueId" + null separator + value
        const keyword = "UniqueId";
        const textData = `${keyword}\0${uniqueData}`;
        const textBuffer = Buffer.from(textData, "latin1");

        // tEXt chunk: [4-byte length][4-byte type "tEXt"][data][4-byte CRC]
        const chunkType = Buffer.from("tEXt", "ascii");
        const chunkLength = Buffer.alloc(4);
        chunkLength.writeUInt32BE(textBuffer.length, 0);

        // CRC covers type + data
        const crcData = Buffer.concat([chunkType, textBuffer]);
        const crc = this.crc32(crcData);
        const crcBuffer = Buffer.alloc(4);
        crcBuffer.writeUInt32BE(crc >>> 0, 0);

        const textChunk = Buffer.concat([
            chunkLength,
            chunkType,
            textBuffer,
            crcBuffer,
        ]);

        // Assemble: [before IEND] + [tEXt chunk] + [IEND chunk]
        const beforeIEND = buffer.subarray(0, iendOffset);
        const iendChunk = buffer.subarray(iendOffset);

        return Buffer.concat([beforeIEND, textChunk, iendChunk]);
    }

    /**
     * Appends unique bytes to the data chunk of a WAV file.
     * WAV is RIFF-based; we update the data sub-chunk size and RIFF size.
     * The extra bytes are silence (zero samples) and inaudible.
     */
    private static modifyWAV(buffer: Buffer, uniqueData: string): Buffer {
        // Simple approach: append unique comment bytes after all existing data
        // and update the RIFF file size header
        const uniqueBytes = Buffer.from(uniqueData, "utf8");

        // RIFF header: "RIFF" (4) + fileSize (4) + "WAVE" (4)
        const magic = buffer.subarray(0, 4).toString("ascii");
        if (magic !== "RIFF") {
            throw new Error("Invalid WAV/RIFF magic");
        }

        // Create a custom "TXID" sub-chunk (non-standard but parsers skip unknown chunks)
        // Chunk: [4-byte ID][4-byte size][data][pad byte if odd]
        const chunkId = Buffer.from("txid", "ascii");
        const chunkSize = Buffer.alloc(4);
        const paddedLength = uniqueBytes.length + (uniqueBytes.length % 2); // RIFF chunks must be word-aligned
        chunkSize.writeUInt32LE(uniqueBytes.length, 0);
        const padByte =
            uniqueBytes.length % 2 === 1 ? Buffer.alloc(1, 0) : Buffer.alloc(0);

        const extraChunk = Buffer.concat([
            chunkId,
            chunkSize,
            uniqueBytes,
            padByte,
        ]);

        // Update RIFF file size (bytes 4-7, little-endian): total file size - 8
        const newBuffer = Buffer.concat([buffer, extraChunk]);
        newBuffer.writeUInt32LE(newBuffer.length - 8, 4);

        return newBuffer;
    }

    /**
     * CRC32 for PNG chunk verification (ISO 3309 / ITU-T V.42).
     */
    private static crc32(data: Buffer): number {
        // Build CRC table
        const table: number[] = new Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                if (c & 1) {
                    c = 0xedb88320 ^ (c >>> 1);
                } else {
                    c = c >>> 1;
                }
            }
            table[n] = c;
        }

        let crc = 0xffffffff;
        for (let i = 0; i < data.length; i++) {
            crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
        }
        return (crc ^ 0xffffffff) >>> 0;
    }
}
