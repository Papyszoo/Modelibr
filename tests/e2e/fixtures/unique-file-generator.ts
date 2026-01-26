import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class UniqueFileGenerator {
    private static ASSETS_DIR = path.join(__dirname, '..', 'assets');
    private static TEMP_DIR = path.join(__dirname, '..', 'data');

    /**
     * Generates a unique copy of the source file with modified content.
     * For GLB files, modifies the JSON chunk to add unique extras data.
     * For other binary files (FBX, etc), just copies without modification
     * since we can't safely inject into arbitrary binary formats.
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
        
        // Generate unique filename by adding the short ID before the extension
        const ext = path.extname(sourceFilename);
        const baseName = path.basename(sourceFilename, ext);
        const uniqueFilename = `${baseName}-${shortId}${ext}`;
        
        const targetPath = path.join(tempDir, uniqueFilename);
        const originalBuffer = await fs.readFile(sourcePath);
        
        let newBuffer: Buffer;

        if (sourceFilename.toLowerCase().endsWith('.glb')) {
            // GLB files: safely modify JSON chunk
            newBuffer = this.modifyGLBJson(originalBuffer, uniqueId);
        } else {
            // For binary files (FBX, OBJ, etc), just copy without modification
            // We can't safely append to binary formats
            newBuffer = originalBuffer;
            console.log(`[UniqueFileGenerator] Binary file copied without modification`);
        }

        await fs.writeFile(targetPath, newBuffer);
        console.log(`[UniqueFileGenerator] Generated: ${targetPath} (Base: ${sourceFilename})`);
        
        return targetPath;
    }

    /**
     * Modifies the JSON chunk in a GLB file to add unique extras data.
     * This is spec-compliant and won't break any parsers.
     */
    private static modifyGLBJson(buffer: Buffer, uniqueData: string): Buffer {
        // GLB Header: Magic (4) + Version (4) + Length (4) = 12 bytes
        const magic = buffer.readUInt32LE(0);
        if (magic !== 0x46546C67) { // 'glTF'
            throw new Error('Invalid GLB magic number');
        }

        // Read JSON chunk header (starts at byte 12)
        const jsonChunkLength = buffer.readUInt32LE(12);
        const jsonChunkType = buffer.readUInt32LE(16);
        
        if (jsonChunkType !== 0x4E4F534A) { // 'JSON'
            throw new Error('First chunk is not JSON type');
        }

        // Extract JSON data (starts at byte 20)
        const jsonData = buffer.subarray(20, 20 + jsonChunkLength).toString('utf8').trim();
        
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
        const paddedJson = newJsonString + ' '.repeat(padding);
        const newJsonBuffer = Buffer.from(paddedJson, 'utf8');
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
        newBuffer.writeUInt32LE(0x4E4F534A, 16); // 'JSON'
        
        // Write JSON data
        newJsonBuffer.copy(newBuffer, 20);
        
        // Copy BIN chunk (if exists)
        if (binChunk.length > 0) {
            binChunk.copy(newBuffer, 20 + newJsonLength);
        }
        
        return newBuffer;
    }
}
