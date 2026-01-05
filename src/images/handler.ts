import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface ImageInfo {
    id: string;
    path: string;
    filename: string;
    mimeType: string;
    base64: string;
    dimensions?: { width: number; height: number };
    size: number;
    timestamp: Date;
}

const SUPPORTED_FORMATS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

export class ImageHandler {
    private imagesPath: string;

    constructor(private context: vscode.ExtensionContext) {
        // Store images in workspace .draagon/images/ directory
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            this.imagesPath = path.join(workspaceFolder.uri.fsPath, '.draagon', 'images');
        } else {
            // Fallback to extension storage
            this.imagesPath = path.join(context.globalStorageUri.fsPath, 'images');
        }
        this.ensureDirectory();
    }

    private ensureDirectory(): void {
        try {
            if (!fs.existsSync(this.imagesPath)) {
                fs.mkdirSync(this.imagesPath, { recursive: true });
            }
        } catch (error) {
            console.error('Failed to create images directory:', error);
        }
    }

    /**
     * Check if a file extension is a supported image format
     */
    public isSupportedFormat(filename: string): boolean {
        const ext = path.extname(filename).toLowerCase();
        return SUPPORTED_FORMATS.includes(ext);
    }

    /**
     * Save an image from base64 data
     */
    public async saveImage(base64Data: string, mimeType: string): Promise<ImageInfo | null> {
        try {
            // Remove data URL prefix if present
            let cleanBase64 = base64Data;
            if (base64Data.includes(',')) {
                cleanBase64 = base64Data.split(',')[1];
            }

            const buffer = Buffer.from(cleanBase64, 'base64');

            // Check size
            if (buffer.length > MAX_IMAGE_SIZE) {
                vscode.window.showErrorMessage(`Image too large. Maximum size is ${MAX_IMAGE_SIZE / 1024 / 1024}MB`);
                return null;
            }

            // Generate filename
            const ext = this.getExtensionFromMimeType(mimeType);
            const timestamp = new Date();
            const filename = `image_${this.formatTimestamp(timestamp)}_${this.randomId()}${ext}`;
            const filePath = path.join(this.imagesPath, filename);

            // Write file
            fs.writeFileSync(filePath, buffer);

            // Get dimensions (basic check for common formats)
            const dimensions = await this.getImageDimensions(buffer, mimeType);

            return {
                id: this.randomId(),
                path: filePath,
                filename,
                mimeType,
                base64: cleanBase64,
                dimensions,
                size: buffer.length,
                timestamp
            };
        } catch (error) {
            console.error('Failed to save image:', error);
            return null;
        }
    }

    /**
     * Save an image from a file path
     */
    public async saveImageFromPath(sourcePath: string): Promise<ImageInfo | null> {
        try {
            if (!fs.existsSync(sourcePath)) {
                return null;
            }

            const buffer = fs.readFileSync(sourcePath);

            if (buffer.length > MAX_IMAGE_SIZE) {
                vscode.window.showErrorMessage(`Image too large. Maximum size is ${MAX_IMAGE_SIZE / 1024 / 1024}MB`);
                return null;
            }

            const ext = path.extname(sourcePath).toLowerCase();
            const mimeType = this.getMimeTypeFromExtension(ext);
            const base64 = buffer.toString('base64');

            const timestamp = new Date();
            const filename = `image_${this.formatTimestamp(timestamp)}_${this.randomId()}${ext}`;
            const filePath = path.join(this.imagesPath, filename);

            // Copy file
            fs.copyFileSync(sourcePath, filePath);

            const dimensions = await this.getImageDimensions(buffer, mimeType);

            return {
                id: this.randomId(),
                path: filePath,
                filename,
                mimeType,
                base64,
                dimensions,
                size: buffer.length,
                timestamp
            };
        } catch (error) {
            console.error('Failed to save image from path:', error);
            return null;
        }
    }

    /**
     * Get image as base64 for Claude API
     */
    public getImageAsBase64(imagePath: string): string | null {
        try {
            const buffer = fs.readFileSync(imagePath);
            return buffer.toString('base64');
        } catch {
            return null;
        }
    }

    /**
     * Delete an image
     */
    public deleteImage(imagePath: string): boolean {
        try {
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
                return true;
            }
            return false;
        } catch {
            return false;
        }
    }

    /**
     * Clean up old images (older than retention days)
     */
    public cleanupOldImages(retentionDays: number = 30): number {
        let deleted = 0;
        try {
            const files = fs.readdirSync(this.imagesPath);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

            for (const file of files) {
                const filePath = path.join(this.imagesPath, file);
                const stats = fs.statSync(filePath);
                if (stats.mtime < cutoffDate) {
                    fs.unlinkSync(filePath);
                    deleted++;
                }
            }
        } catch (error) {
            console.error('Failed to cleanup old images:', error);
        }
        return deleted;
    }

    /**
     * Get all stored images
     */
    public getStoredImages(): ImageInfo[] {
        const images: ImageInfo[] = [];
        try {
            const files = fs.readdirSync(this.imagesPath);
            for (const file of files) {
                if (this.isSupportedFormat(file)) {
                    const filePath = path.join(this.imagesPath, file);
                    const stats = fs.statSync(filePath);
                    const ext = path.extname(file).toLowerCase();
                    images.push({
                        id: file,
                        path: filePath,
                        filename: file,
                        mimeType: this.getMimeTypeFromExtension(ext),
                        base64: '', // Don't load base64 for listing
                        size: stats.size,
                        timestamp: stats.mtime
                    });
                }
            }
        } catch (error) {
            console.error('Failed to get stored images:', error);
        }
        return images.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }

    /**
     * Format image for Claude API message content
     */
    public formatForClaudeApi(imageInfo: ImageInfo): object {
        return {
            type: 'image',
            source: {
                type: 'base64',
                media_type: imageInfo.mimeType,
                data: imageInfo.base64
            }
        };
    }

    private getExtensionFromMimeType(mimeType: string): string {
        const mapping: Record<string, string> = {
            'image/png': '.png',
            'image/jpeg': '.jpg',
            'image/jpg': '.jpg',
            'image/gif': '.gif',
            'image/webp': '.webp',
            'image/bmp': '.bmp',
            'image/svg+xml': '.svg'
        };
        return mapping[mimeType] || '.png';
    }

    private getMimeTypeFromExtension(ext: string): string {
        const mapping: Record<string, string> = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.bmp': 'image/bmp',
            '.svg': 'image/svg+xml'
        };
        return mapping[ext] || 'image/png';
    }

    private formatTimestamp(date: Date): string {
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    }

    private randomId(): string {
        return Math.random().toString(36).substring(2, 8);
    }

    private async getImageDimensions(buffer: Buffer, mimeType: string): Promise<{ width: number; height: number } | undefined> {
        try {
            // PNG dimensions are at bytes 16-24
            if (mimeType === 'image/png' && buffer.length >= 24) {
                const width = buffer.readUInt32BE(16);
                const height = buffer.readUInt32BE(20);
                return { width, height };
            }

            // JPEG dimensions require parsing segments
            if ((mimeType === 'image/jpeg' || mimeType === 'image/jpg') && buffer.length >= 2) {
                return this.getJpegDimensions(buffer);
            }

            // GIF dimensions are at bytes 6-10
            if (mimeType === 'image/gif' && buffer.length >= 10) {
                const width = buffer.readUInt16LE(6);
                const height = buffer.readUInt16LE(8);
                return { width, height };
            }

            return undefined;
        } catch {
            return undefined;
        }
    }

    private getJpegDimensions(buffer: Buffer): { width: number; height: number } | undefined {
        try {
            let offset = 2; // Skip SOI marker

            while (offset < buffer.length) {
                if (buffer[offset] !== 0xFF) break;

                const marker = buffer[offset + 1];

                // SOF markers (Start of Frame)
                if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
                    const height = buffer.readUInt16BE(offset + 5);
                    const width = buffer.readUInt16BE(offset + 7);
                    return { width, height };
                }

                // Skip to next marker
                const length = buffer.readUInt16BE(offset + 2);
                offset += 2 + length;
            }

            return undefined;
        } catch {
            return undefined;
        }
    }
}
