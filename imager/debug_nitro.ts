import { readFileSync } from 'fs';
import { decompress } from 'fzstd';
import { loadImage } from 'canvas';
import { wrap } from 'bytebuffer';
import { inflate } from 'pako';

async function analyze() {
    try {
        const buffer = readFileSync('hh_human_50_body.nitro');
        console.log(`File size: ${buffer.length}`);
        console.log(`Header: ${buffer.subarray(0, 4).toString('hex')}`);

        let containerBuffer = new Uint8Array(buffer);
        const isZstd = containerBuffer[0] === 0x28 && containerBuffer[1] === 0xB5 && containerBuffer[2] === 0x2F && containerBuffer[3] === 0xFD;
        console.log(`Is Outer Zstd: ${isZstd}`);

        if (isZstd) {
            console.log("Decompressing outer container...");
            containerBuffer = decompress(containerBuffer);
            console.log(`Outer decompressed size: ${containerBuffer.length}`);
        }

        // Parse NitroBundle structure
        const binaryReader = wrap(containerBuffer.buffer);
        let fileCount = binaryReader.readShort();
        console.log(`File count: ${fileCount}`);

        while (fileCount > 0) {
            const fileNameLength = binaryReader.readShort();
            const fileName = binaryReader.readString(fileNameLength);
            const fileLength = binaryReader.readInt();
            const fileBuffer = binaryReader.readBytes(fileLength);
            const uint8Buffer = new Uint8Array(fileBuffer.toArrayBuffer());

            console.log(`\n--- File: ${fileName} (Compressed/Raw Size: ${fileLength} bytes) ---`);
            console.log(`Inner Header: ${uint8Buffer.slice(0, 4).toString()}`); // Byte values

            let innerDecompressed: Uint8Array = null;

            // Check for Zstd
            if (uint8Buffer.length > 4 && uint8Buffer[0] === 0x28 && uint8Buffer[1] === 0xB5 && uint8Buffer[2] === 0x2F && uint8Buffer[3] === 0xFD) {
                console.log("Inner file is Zstd.");
                innerDecompressed = decompress(uint8Buffer);
            } else {
                console.log("Inner file is NOT Zstd. Trying Pako/Inflate (Zlib)...");
                try {
                    innerDecompressed = inflate(uint8Buffer);
                    console.log("Inflate successful.");
                } catch (e) {
                    console.log(`Inflate failed: ${e.message}`);
                    // Maybe it's raw?
                    innerDecompressed = uint8Buffer;
                }
            }
            
            console.log(`Decompressed Inner Size: ${innerDecompressed.length}`);
            const headerHex = Array.from(innerDecompressed.slice(0, 12)).map(b => b.toString(16).padStart(2, '0')).join(' ');
            console.log(`Inner Data Header: ${headerHex}`);

            if (!fileName.endsWith('.json')) {
                // Check for WebP
                // RIFF .... WEBP
                // 52 49 46 46 ?? ?? ?? ?? 57 45 42 50
                const isWebP = innerDecompressed[0] === 0x52 && innerDecompressed[1] === 0x49 && innerDecompressed[2] === 0x46 && innerDecompressed[3] === 0x46 &&
                               innerDecompressed[8] === 0x57 && innerDecompressed[9] === 0x45 && innerDecompressed[10] === 0x42 && innerDecompressed[11] === 0x50;
                
                console.log(`Is WebP: ${isWebP}`);
                
                const isPNG = innerDecompressed[0] === 0x89 && innerDecompressed[1] === 0x50 && innerDecompressed[2] === 0x4E && innerDecompressed[3] === 0x47;
                console.log(`Is PNG: ${isPNG}`);

                const mimeType = isWebP ? 'image/webp' : 'image/png';
                const base64 = Buffer.from(innerDecompressed).toString('base64');
                
                console.log(`Attempting to load as ${mimeType}...`);
                try {
                    await loadImage(`data:${mimeType};base64,${base64}`);
                    console.log("CANVAS LOAD SUCCESS");
                } catch (e) {
                    console.error("CANVAS LOAD FAILED:", e.message);
                }
            }

            fileCount--;
        }

    } catch (e) {
        console.error(e);
    }
}

analyze();
