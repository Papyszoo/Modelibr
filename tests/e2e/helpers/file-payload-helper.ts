import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import zlib from "zlib";

import { UniqueFileGenerator } from "../fixtures/unique-file-generator";

export interface UploadFilePayload {
    name: string;
    mimeType: string;
    buffer: Buffer;
}

interface SerializedUploadFilePayload {
    name: string;
    mimeType: string;
    base64: string;
}

const PNG_SIGNATURE = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export async function createUniqueUploadFilePayload(
    sourceFilename: string,
): Promise<UploadFilePayload> {
    const filePath = await UniqueFileGenerator.generate(sourceFilename, {
        uniqueFilename: true,
    });

    return createUploadFilePayloadFromPath(filePath);
}

export async function createUploadFilePayloadFromPath(
    filePath: string,
): Promise<UploadFilePayload> {
    return {
        name: path.basename(filePath),
        mimeType: getMimeType(path.basename(filePath)),
        buffer: await fs.readFile(filePath),
    };
}

export function serializeUploadFilePayloads(
    payloads: UploadFilePayload[],
): SerializedUploadFilePayload[] {
    return payloads.map((payload) => ({
        name: payload.name,
        mimeType: payload.mimeType,
        base64: payload.buffer.toString("base64"),
    }));
}

export function createUniqueSolidPngPayload(options: {
    filenamePrefix: string;
    width: number;
    height: number;
    rgb?: [number, number, number];
}): UploadFilePayload {
    const id = crypto.randomUUID().slice(0, 8);
    const filename = `${options.filenamePrefix}-${id}.png`;
    const buffer = createSolidColorPngBuffer(
        options.width,
        options.height,
        options.rgb ?? [64, 128, 255],
        id,
    );

    return {
        name: filename,
        mimeType: "image/png",
        buffer,
    };
}

export function createUniqueSolidHdrPayload(options: {
    filenamePrefix: string;
    width: number;
    height: number;
    rgbe?: [number, number, number, number];
}): UploadFilePayload {
    const id = crypto.randomUUID().slice(0, 8);
    const filename = `${options.filenamePrefix}-${id}.hdr`;
    const buffer = createSolidColorHdrBuffer(
        options.width,
        options.height,
        options.rgbe ?? [160, 192, 255, 129],
        id,
    );

    return {
        name: filename,
        mimeType: "image/vnd.radiance",
        buffer,
    };
}

function getMimeType(filename: string): string {
    switch (path.extname(filename).toLowerCase()) {
        case ".png":
            return "image/png";
        case ".jpg":
        case ".jpeg":
            return "image/jpeg";
        case ".webp":
            return "image/webp";
        case ".hdr":
            return "image/vnd.radiance";
        case ".exr":
            return "image/x-exr";
        default:
            return "application/octet-stream";
    }
}

function createSolidColorPngBuffer(
    width: number,
    height: number,
    [r, g, b]: [number, number, number],
    uniqueText: string,
): Buffer {
    const rowLength = 1 + width * 3;
    const row = Buffer.alloc(rowLength);
    row[0] = 0;

    for (let offset = 1; offset < row.length; offset += 3) {
        row[offset] = r;
        row[offset + 1] = g;
        row[offset + 2] = b;
    }

    const imageData = Buffer.alloc(rowLength * height);
    for (let y = 0; y < height; y += 1) {
        row.copy(imageData, y * rowLength);
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const textData = Buffer.from(`UniqueId\0${uniqueText}`, "latin1");
    const compressed = zlib.deflateSync(imageData, { level: 9 });

    return Buffer.concat([
        PNG_SIGNATURE,
        createPngChunk("IHDR", ihdr),
        createPngChunk("tEXt", textData),
        createPngChunk("IDAT", compressed),
        createPngChunk("IEND", Buffer.alloc(0)),
    ]);
}

function createPngChunk(type: string, data: Buffer): Buffer {
    const typeBuffer = Buffer.from(type, "ascii");
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);

    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])) >>> 0, 0);

    return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(data: Buffer): number {
    let crc = 0xffffffff;

    for (let index = 0; index < data.length; index += 1) {
        crc ^= data[index];

        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
        }
    }

    return (crc ^ 0xffffffff) >>> 0;
}

function createSolidColorHdrBuffer(
    width: number,
    height: number,
    [r, g, b, e]: [number, number, number, number],
    uniqueText: string,
): Buffer {
    if (width < 8 || width > 0x7fff) {
        throw new Error(
            `HDR generator requires width between 8 and 32767, received ${width}`,
        );
    }

    const parts: Buffer[] = [
        Buffer.from(
            [
                "#?RADIANCE",
                `# UniqueId: ${uniqueText}`,
                "FORMAT=32-bit_rle_rgbe",
                "EXPOSURE=1.0000000000000",
                "",
                `-Y ${height} +X ${width}`,
                "",
            ].join("\n"),
            "ascii",
        ),
    ];

    for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
        parts.push(
            Buffer.from([0x02, 0x02, (width >> 8) & 0xff, width & 0xff]),
            encodeHdrRun(width, r),
            encodeHdrRun(width, g),
            encodeHdrRun(width, b),
            encodeHdrRun(width, e),
        );
    }

    return Buffer.concat(parts);
}

function encodeHdrRun(length: number, value: number): Buffer {
    const segments: Buffer[] = [];
    let remaining = length;

    while (remaining > 0) {
        const runLength = Math.min(remaining, 127);
        segments.push(Buffer.from([128 + runLength, value]));
        remaining -= runLength;
    }

    return Buffer.concat(segments);
}
