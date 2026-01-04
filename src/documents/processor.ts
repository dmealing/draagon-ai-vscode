import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export type DocumentType = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'csv' | 'json' | 'xml' | 'html' | 'markdown';

export interface DocumentContent {
    type: DocumentType;
    fileName: string;
    text: string;
    metadata: DocumentMetadata;
    pages?: PageContent[];
    sheets?: SheetContent[];
    slides?: SlideContent[];
}

export interface DocumentMetadata {
    title?: string;
    author?: string;
    createdAt?: string;
    modifiedAt?: string;
    pageCount?: number;
    wordCount?: number;
    fileSize: number;
}

export interface PageContent {
    pageNumber: number;
    text: string;
    images?: ImageReference[];
}

export interface SheetContent {
    name: string;
    headers: string[];
    rows: string[][];
    rowCount: number;
    columnCount: number;
}

export interface SlideContent {
    slideNumber: number;
    title?: string;
    content: string;
    notes?: string;
}

export interface ImageReference {
    id: string;
    description?: string;
    base64?: string;
}

export class DocumentProcessor {
    private _tempDir: string;

    constructor(context: vscode.ExtensionContext) {
        this._tempDir = path.join(context.globalStorageUri.fsPath, 'temp-docs');
        this._ensureDir(this._tempDir);
    }

    private _ensureDir(dir: string): void {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    public async processDocument(filePath: string): Promise<DocumentContent | null> {
        const ext = path.extname(filePath).toLowerCase().slice(1);
        const fileName = path.basename(filePath);
        const stats = fs.statSync(filePath);

        const baseMetadata: DocumentMetadata = {
            fileSize: stats.size,
            modifiedAt: stats.mtime.toISOString()
        };

        try {
            switch (ext) {
                case 'pdf':
                    return await this._processPdf(filePath, fileName, baseMetadata);
                case 'docx':
                    return await this._processDocx(filePath, fileName, baseMetadata);
                case 'xlsx':
                    return await this._processXlsx(filePath, fileName, baseMetadata);
                case 'pptx':
                    return await this._processPptx(filePath, fileName, baseMetadata);
                case 'csv':
                    return this._processCsv(filePath, fileName, baseMetadata);
                case 'json':
                    return this._processJson(filePath, fileName, baseMetadata);
                case 'xml':
                    return this._processXml(filePath, fileName, baseMetadata);
                case 'html':
                case 'htm':
                    return this._processHtml(filePath, fileName, baseMetadata);
                case 'md':
                case 'markdown':
                    return this._processMarkdown(filePath, fileName, baseMetadata);
                default:
                    vscode.window.showWarningMessage(`Unsupported document type: ${ext}`);
                    return null;
            }
        } catch (error) {
            console.error(`Failed to process document ${fileName}:`, error);
            vscode.window.showErrorMessage(`Failed to process document: ${error}`);
            return null;
        }
    }

    private async _processPdf(filePath: string, fileName: string, metadata: DocumentMetadata): Promise<DocumentContent> {
        // Try using pdftotext if available
        let text = '';
        let pages: PageContent[] = [];

        try {
            // Check if pdftotext is available
            await execAsync('which pdftotext');

            // Extract text page by page
            const { stdout: pageCount } = await execAsync(`pdfinfo "${filePath}" | grep Pages | awk '{print $2}'`);
            const numPages = parseInt(pageCount.trim()) || 1;
            metadata.pageCount = numPages;

            for (let i = 1; i <= numPages; i++) {
                const { stdout } = await execAsync(`pdftotext -f ${i} -l ${i} "${filePath}" -`);
                pages.push({
                    pageNumber: i,
                    text: stdout.trim()
                });
                text += stdout + '\n\n';
            }
        } catch {
            // Fallback: try using pdf-parse via Node (if installed)
            try {
                // Simple fallback - just read what we can
                text = `[PDF content from ${fileName} - install poppler-utils for full extraction]`;
                pages = [{ pageNumber: 1, text }];
            } catch {
                text = `Unable to extract PDF content. Install poppler-utils for PDF support.`;
            }
        }

        metadata.wordCount = text.split(/\s+/).length;

        return {
            type: 'pdf',
            fileName,
            text: text.trim(),
            metadata,
            pages
        };
    }

    private async _processDocx(filePath: string, fileName: string, metadata: DocumentMetadata): Promise<DocumentContent> {
        let text = '';

        try {
            // Try using pandoc if available
            await execAsync('which pandoc');
            const { stdout } = await execAsync(`pandoc "${filePath}" -t plain`);
            text = stdout;
        } catch {
            // Fallback: basic extraction using unzip and xml parsing
            try {
                const { stdout } = await execAsync(
                    `unzip -p "${filePath}" word/document.xml | sed 's/<[^>]*>//g' | tr -s '\\n' ' '`
                );
                text = stdout.trim();
            } catch {
                text = `Unable to extract DOCX content. Install pandoc for full support.`;
            }
        }

        metadata.wordCount = text.split(/\s+/).length;

        return {
            type: 'docx',
            fileName,
            text: text.trim(),
            metadata
        };
    }

    private async _processXlsx(filePath: string, fileName: string, metadata: DocumentMetadata): Promise<DocumentContent> {
        const sheets: SheetContent[] = [];
        let text = '';

        try {
            // Try using ssconvert (from gnumeric) or xlsx2csv
            try {
                await execAsync('which ssconvert');

                // Get sheet names
                const { stdout: sheetList } = await execAsync(
                    `unzip -p "${filePath}" xl/workbook.xml | grep -oP 'name="[^"]*"' | sed 's/name="//g;s/"//g'`
                );
                const sheetNames = sheetList.trim().split('\n').filter(s => s);

                for (let i = 0; i < sheetNames.length; i++) {
                    const csvPath = path.join(this._tempDir, `sheet_${i}.csv`);
                    await execAsync(`ssconvert --export-type=Gnumeric_stf:stf_csv -S "${filePath}" "${csvPath}"`);

                    if (fs.existsSync(`${csvPath}.${i}`)) {
                        const content = fs.readFileSync(`${csvPath}.${i}`, 'utf-8');
                        const lines = content.split('\n').filter(l => l.trim());
                        const headers = lines[0]?.split(',').map(h => h.trim()) || [];
                        const rows = lines.slice(1).map(l => l.split(',').map(c => c.trim()));

                        sheets.push({
                            name: sheetNames[i] || `Sheet ${i + 1}`,
                            headers,
                            rows,
                            rowCount: rows.length,
                            columnCount: headers.length
                        });

                        text += `\n## ${sheetNames[i] || `Sheet ${i + 1}`}\n`;
                        text += headers.join(' | ') + '\n';
                        text += rows.slice(0, 10).map(r => r.join(' | ')).join('\n');
                        if (rows.length > 10) {
                            text += `\n... (${rows.length - 10} more rows)`;
                        }

                        fs.unlinkSync(`${csvPath}.${i}`);
                    }
                }
            } catch {
                // Simple fallback
                text = `[Excel file with multiple sheets - install gnumeric for full extraction]`;
            }
        } catch {
            text = `Unable to extract XLSX content.`;
        }

        return {
            type: 'xlsx',
            fileName,
            text: text.trim(),
            metadata,
            sheets
        };
    }

    private async _processPptx(filePath: string, fileName: string, metadata: DocumentMetadata): Promise<DocumentContent> {
        const slides: SlideContent[] = [];
        let text = '';

        try {
            // Extract slide content from PPTX
            const { stdout: slideFiles } = await execAsync(
                `unzip -l "${filePath}" | grep "ppt/slides/slide" | awk '{print $4}' | sort -V`
            );
            const slideList = slideFiles.trim().split('\n').filter(s => s);

            for (let i = 0; i < slideList.length; i++) {
                const { stdout: slideContent } = await execAsync(
                    `unzip -p "${filePath}" "${slideList[i]}" | sed 's/<[^>]*>//g' | tr -s '\\n' ' '`
                );

                slides.push({
                    slideNumber: i + 1,
                    content: slideContent.trim()
                });

                text += `\n## Slide ${i + 1}\n${slideContent.trim()}\n`;
            }

            metadata.pageCount = slides.length;
        } catch {
            text = `Unable to extract PPTX content.`;
        }

        return {
            type: 'pptx',
            fileName,
            text: text.trim(),
            metadata,
            slides
        };
    }

    private _processCsv(filePath: string, fileName: string, metadata: DocumentMetadata): DocumentContent {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        const headers = lines[0]?.split(',').map(h => h.trim()) || [];
        const rows = lines.slice(1).map(l => l.split(',').map(c => c.trim()));

        const sheet: SheetContent = {
            name: 'Sheet 1',
            headers,
            rows,
            rowCount: rows.length,
            columnCount: headers.length
        };

        let text = `Headers: ${headers.join(', ')}\n\n`;
        text += `Sample data (first 10 rows):\n`;
        text += rows.slice(0, 10).map((r, i) =>
            `Row ${i + 1}: ${r.join(', ')}`
        ).join('\n');

        if (rows.length > 10) {
            text += `\n\n... and ${rows.length - 10} more rows`;
        }

        metadata.wordCount = content.split(/\s+/).length;

        return {
            type: 'csv',
            fileName,
            text,
            metadata,
            sheets: [sheet]
        };
    }

    private _processJson(filePath: string, fileName: string, metadata: DocumentMetadata): DocumentContent {
        const content = fs.readFileSync(filePath, 'utf-8');

        let text: string;
        try {
            const parsed = JSON.parse(content);
            text = JSON.stringify(parsed, null, 2);

            // Add summary
            if (Array.isArray(parsed)) {
                text = `JSON Array with ${parsed.length} items:\n\n${text}`;
            } else if (typeof parsed === 'object') {
                const keys = Object.keys(parsed);
                text = `JSON Object with keys: ${keys.join(', ')}\n\n${text}`;
            }
        } catch {
            text = content;
        }

        return {
            type: 'json',
            fileName,
            text,
            metadata
        };
    }

    private _processXml(filePath: string, fileName: string, metadata: DocumentMetadata): DocumentContent {
        const content = fs.readFileSync(filePath, 'utf-8');
        // Simple text extraction from XML
        const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

        return {
            type: 'xml',
            fileName,
            text: `XML content:\n${text}`,
            metadata
        };
    }

    private _processHtml(filePath: string, fileName: string, metadata: DocumentMetadata): DocumentContent {
        const content = fs.readFileSync(filePath, 'utf-8');

        // Extract text content
        const text = content
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Extract title
        const titleMatch = content.match(/<title>([^<]*)<\/title>/i);
        if (titleMatch) {
            metadata.title = titleMatch[1];
        }

        return {
            type: 'html',
            fileName,
            text,
            metadata
        };
    }

    private _processMarkdown(filePath: string, fileName: string, metadata: DocumentMetadata): DocumentContent {
        const text = fs.readFileSync(filePath, 'utf-8');

        // Extract title from first heading
        const titleMatch = text.match(/^#\s+(.+)$/m);
        if (titleMatch) {
            metadata.title = titleMatch[1];
        }

        metadata.wordCount = text.split(/\s+/).length;

        return {
            type: 'markdown',
            fileName,
            text,
            metadata
        };
    }

    public getSupportedTypes(): string[] {
        return ['pdf', 'docx', 'xlsx', 'pptx', 'csv', 'json', 'xml', 'html', 'htm', 'md', 'markdown'];
    }

    public isSupported(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase().slice(1);
        return this.getSupportedTypes().includes(ext);
    }

    public formatForPrompt(doc: DocumentContent): string {
        let prompt = `## Document: ${doc.fileName}\n`;
        prompt += `Type: ${doc.type.toUpperCase()}\n`;

        if (doc.metadata.title) {
            prompt += `Title: ${doc.metadata.title}\n`;
        }
        if (doc.metadata.pageCount) {
            prompt += `Pages: ${doc.metadata.pageCount}\n`;
        }
        if (doc.metadata.wordCount) {
            prompt += `Words: ${doc.metadata.wordCount}\n`;
        }

        prompt += `\n### Content\n\n${doc.text}`;

        return prompt;
    }

    public cleanup(): void {
        // Clean temp directory
        try {
            const files = fs.readdirSync(this._tempDir);
            for (const file of files) {
                fs.unlinkSync(path.join(this._tempDir, file));
            }
        } catch {
            // Ignore cleanup errors
        }
    }

    public dispose(): void {
        this.cleanup();
    }
}
