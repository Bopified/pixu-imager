import { wrap } from 'bytebuffer';
import { Image, loadImage } from 'canvas';
import { decompress } from 'fzstd';
import { Data, inflate } from 'pako';
import sharp from 'sharp';
import { NitroLogger } from '../NitroLogger';
import { IAssetData } from './interfaces';

export class NitroBundle
{
    private static TEXT_DECODER: TextDecoder = new TextDecoder('utf-8');

    private _jsonFile: IAssetData = null;
    private _baseTexture: Image = null;

    public static async from(buffer: ArrayBuffer): Promise<NitroBundle>
    {
        const bundle = new NitroBundle();

        await bundle.parse(buffer);

        return bundle;
    }

    private static arrayBufferToBase64(buffer: ArrayBuffer): string
    {
        let binary = '';

        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;

        for(let i = 0; i < len; i++) (binary += String.fromCharCode(bytes[i]));

        const newBuffer = Buffer.from(binary.toString(), 'binary');

        return newBuffer.toString('base64');
    }

    private async parse(arrayBuffer: ArrayBuffer): Promise<void>
    {
        const binaryReader = wrap(arrayBuffer);
        let fileCount = binaryReader.readShort();

        while (fileCount > 0)
        {
            const fileNameLength = binaryReader.readShort();
            const fileName = binaryReader.readString(fileNameLength);
            const fileLength = binaryReader.readInt();
            const buffer = binaryReader.readBytes(fileLength);

            const uint8Buffer = new Uint8Array(buffer.toArrayBuffer());
            let decompressed: Uint8Array = null;

            if (uint8Buffer.length > 4 && uint8Buffer[0] === 0x28 && uint8Buffer[1] === 0xB5 && uint8Buffer[2] === 0x2F && uint8Buffer[3] === 0xFD)
            {
                decompressed = decompress(uint8Buffer);
            }
            else
            {
                decompressed = inflate(uint8Buffer);
            }

            if (fileName.endsWith('.json'))
            {
                this._jsonFile = JSON.parse(NitroBundle.TEXT_DECODER.decode(decompressed));
            }
            else
            {
                let finalBuffer = decompressed;

                if (decompressed.length > 12 && decompressed[0] === 0x52 && decompressed[1] === 0x49 && decompressed[2] === 0x46 && decompressed[3] === 0x46 && decompressed[8] === 0x57 && decompressed[9] === 0x45 && decompressed[10] === 0x42 && decompressed[11] === 0x50)
                {
                    try 
                    {
                        finalBuffer = await sharp(decompressed).png().toBuffer();
                    }
                    catch (err)
                    {
                        NitroLogger.error(`Failed to convert WebP to PNG for ${fileName}: ${err.message}`);
                    }
                }

                const base64 = NitroBundle.arrayBufferToBase64(finalBuffer.slice().buffer);

                try 
                {
                    const baseTexture = await loadImage(`data:image/png;base64,${ base64 }`);
                    this._baseTexture = baseTexture;
                }
                catch (err)
                {
                    NitroLogger.error(`Failed to load image ${fileName}: ${err.message}`);
                    throw err;
                }
            }
            fileCount--;
        }
    }

    public get jsonFile(): IAssetData
    {
        return this._jsonFile;
    }

    public get baseTexture(): Image
    {
        return this._baseTexture;
    }
}
