import * as vscode from 'vscode';

export interface FigmaNode {
    id: string;
    name: string;
    type: FigmaNodeType;
    visible: boolean;
    absoluteBoundingBox?: BoundingBox;
    fills?: Paint[];
    strokes?: Paint[];
    effects?: Effect[];
    children?: FigmaNode[];
    characters?: string;
    style?: TextStyle;
    cornerRadius?: number;
    constraints?: Constraints;
    layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
    primaryAxisSizingMode?: 'FIXED' | 'AUTO';
    counterAxisSizingMode?: 'FIXED' | 'AUTO';
    paddingLeft?: number;
    paddingRight?: number;
    paddingTop?: number;
    paddingBottom?: number;
    itemSpacing?: number;
}

export type FigmaNodeType =
    | 'DOCUMENT'
    | 'CANVAS'
    | 'FRAME'
    | 'GROUP'
    | 'VECTOR'
    | 'BOOLEAN_OPERATION'
    | 'STAR'
    | 'LINE'
    | 'ELLIPSE'
    | 'REGULAR_POLYGON'
    | 'RECTANGLE'
    | 'TEXT'
    | 'SLICE'
    | 'COMPONENT'
    | 'COMPONENT_SET'
    | 'INSTANCE';

export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface Paint {
    type: 'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR' | 'GRADIENT_DIAMOND' | 'IMAGE' | 'EMOJI';
    visible?: boolean;
    opacity?: number;
    color?: Color;
    gradientStops?: GradientStop[];
}

export interface Color {
    r: number;
    g: number;
    b: number;
    a: number;
}

export interface GradientStop {
    position: number;
    color: Color;
}

export interface Effect {
    type: 'INNER_SHADOW' | 'DROP_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR';
    visible: boolean;
    radius: number;
    color?: Color;
    offset?: { x: number; y: number };
    spread?: number;
}

export interface TextStyle {
    fontFamily: string;
    fontPostScriptName?: string;
    fontWeight: number;
    fontSize: number;
    textAlignHorizontal: 'LEFT' | 'RIGHT' | 'CENTER' | 'JUSTIFIED';
    textAlignVertical: 'TOP' | 'CENTER' | 'BOTTOM';
    letterSpacing: number;
    lineHeightPx: number;
    lineHeightPercent?: number;
    lineHeightUnit?: 'PIXELS' | 'FONT_SIZE_%' | 'INTRINSIC_%';
}

export interface Constraints {
    vertical: 'TOP' | 'BOTTOM' | 'CENTER' | 'TOP_BOTTOM' | 'SCALE';
    horizontal: 'LEFT' | 'RIGHT' | 'CENTER' | 'LEFT_RIGHT' | 'SCALE';
}

export interface FigmaFile {
    name: string;
    lastModified: string;
    thumbnailUrl?: string;
    version: string;
    document: FigmaNode;
    components: Record<string, FigmaNode>;
    styles: Record<string, unknown>;
}

export type CodeFramework = 'react' | 'vue' | 'svelte' | 'html' | 'tailwind';

export interface CodeGenerationOptions {
    framework: CodeFramework;
    useTailwind: boolean;
    useTypescript: boolean;
    componentName?: string;
    includeStyles: boolean;
    responsiveBreakpoints: boolean;
}

export class FigmaIntegration {
    private _accessToken: string | null = null;
    private _onDesignLoaded: vscode.EventEmitter<FigmaFile> = new vscode.EventEmitter();

    public readonly onDesignLoaded = this._onDesignLoaded.event;

    constructor(_context?: vscode.ExtensionContext) {}

    public parseUrl(url: string): { fileKey: string | null; nodeId: string | null } {
        // Parse Figma URLs like:
        // https://www.figma.com/file/abc123/Design-Name?node-id=1%3A2
        // https://www.figma.com/design/abc123/Design-Name?node-id=1-2
        const fileMatch = url.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
        const nodeMatch = url.match(/node-id=([0-9]+[-:][0-9]+|[0-9]+%3A[0-9]+)/);

        return {
            fileKey: fileMatch ? fileMatch[1] : null,
            nodeId: nodeMatch ? decodeURIComponent(nodeMatch[1]).replace('-', ':') : null
        };
    }

    public async setAccessToken(token: string): Promise<boolean> {
        try {
            // Validate token by making a test request
            const response = await fetch('https://api.figma.com/v1/me', {
                headers: { 'X-Figma-Token': token }
            });

            if (response.ok) {
                this._accessToken = token;
                return true;
            }

            return false;
        } catch {
            return false;
        }
    }

    public hasValidToken(): boolean {
        return this._accessToken !== null;
    }

    public async getFile(fileKey: string): Promise<FigmaFile | null> {
        if (!this._accessToken) {
            vscode.window.showErrorMessage('Figma access token not configured.');
            return null;
        }

        try {
            const response = await fetch(`https://api.figma.com/v1/files/${fileKey}`, {
                headers: { 'X-Figma-Token': this._accessToken }
            });

            if (!response.ok) {
                throw new Error(`Figma API error: ${response.status}`);
            }

            const data = await response.json() as FigmaFile;
            this._onDesignLoaded.fire(data);
            return data;

        } catch (error) {
            console.error('Failed to fetch Figma file:', error);
            vscode.window.showErrorMessage(`Failed to fetch Figma file: ${error}`);
            return null;
        }
    }

    public async getNode(fileKey: string, nodeId: string): Promise<FigmaNode | null> {
        if (!this._accessToken) {
            return null;
        }

        try {
            const response = await fetch(
                `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${nodeId}`,
                { headers: { 'X-Figma-Token': this._accessToken } }
            );

            if (!response.ok) {
                throw new Error(`Figma API error: ${response.status}`);
            }

            const data = await response.json() as { nodes: Record<string, { document?: FigmaNode }> };
            return data.nodes[nodeId]?.document || null;

        } catch (error) {
            console.error('Failed to fetch Figma node:', error);
            return null;
        }
    }

    public async exportNodeAsImage(
        fileKey: string,
        nodeId: string,
        format: 'png' | 'jpg' | 'svg' | 'pdf' = 'png',
        scale: number = 2
    ): Promise<string | null> {
        if (!this._accessToken) {
            return null;
        }

        try {
            const response = await fetch(
                `https://api.figma.com/v1/images/${fileKey}?ids=${nodeId}&format=${format}&scale=${scale}`,
                { headers: { 'X-Figma-Token': this._accessToken } }
            );

            if (!response.ok) {
                throw new Error(`Figma API error: ${response.status}`);
            }

            const data = await response.json() as { images: Record<string, string> };
            return data.images[nodeId] || null;

        } catch (error) {
            console.error('Failed to export Figma node:', error);
            return null;
        }
    }

    // Convert Figma design to code
    public generateCode(node: FigmaNode, options: CodeGenerationOptions): string {
        switch (options.framework) {
            case 'react':
                return this._generateReactCode(node, options);
            case 'vue':
                return this._generateVueCode(node, options);
            case 'svelte':
                return this._generateSvelteCode(node, options);
            case 'html':
                return this._generateHtmlCode(node, options);
            case 'tailwind':
                return this._generateTailwindCode(node, options);
            default:
                return this._generateHtmlCode(node, options);
        }
    }

    private _generateReactCode(node: FigmaNode, options: CodeGenerationOptions): string {
        const componentName = options.componentName || this._sanitizeName(node.name);
        const ts = options.useTypescript;

        let code = '';

        if (ts) {
            code += `import React from 'react';\n\n`;
            code += `interface ${componentName}Props {\n`;
            code += `  className?: string;\n`;
            code += `}\n\n`;
            code += `export const ${componentName}: React.FC<${componentName}Props> = ({ className }) => {\n`;
        } else {
            code += `import React from 'react';\n\n`;
            code += `export const ${componentName} = ({ className }) => {\n`;
        }

        code += `  return (\n`;
        code += this._generateJsx(node, options, 2);
        code += `  );\n`;
        code += `};\n`;

        if (options.includeStyles && !options.useTailwind) {
            code += `\n// Styles\n`;
            code += this._generateCssModule(node);
        }

        return code;
    }

    private _generateVueCode(node: FigmaNode, options: CodeGenerationOptions): string {
        const componentName = options.componentName || this._sanitizeName(node.name);

        let code = `<template>\n`;
        code += this._generateVueTemplate(node, options, 1);
        code += `</template>\n\n`;

        code += `<script${options.useTypescript ? ' lang="ts"' : ''} setup>\n`;
        code += `defineProps<{\n`;
        code += `  class?: string;\n`;
        code += `}>();\n`;
        code += `</script>\n\n`;

        if (options.includeStyles && !options.useTailwind) {
            code += `<style scoped>\n`;
            code += this._generateScopedCss(node);
            code += `</style>\n`;
        }

        return code;
    }

    private _generateSvelteCode(node: FigmaNode, options: CodeGenerationOptions): string {
        let code = `<script${options.useTypescript ? ' lang="ts"' : ''}>\n`;
        code += `  export let className = '';\n`;
        code += `</script>\n\n`;

        code += this._generateSvelteTemplate(node, options, 0);

        if (options.includeStyles && !options.useTailwind) {
            code += `\n<style>\n`;
            code += this._generateScopedCss(node);
            code += `</style>\n`;
        }

        return code;
    }

    private _generateHtmlCode(node: FigmaNode, options: CodeGenerationOptions): string {
        let code = `<!DOCTYPE html>\n`;
        code += `<html lang="en">\n`;
        code += `<head>\n`;
        code += `  <meta charset="UTF-8">\n`;
        code += `  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n`;
        code += `  <title>${node.name}</title>\n`;

        if (options.includeStyles) {
            code += `  <style>\n`;
            code += this._generateCss(node);
            code += `  </style>\n`;
        }

        code += `</head>\n`;
        code += `<body>\n`;
        code += this._generateHtmlElement(node, options, 1);
        code += `</body>\n`;
        code += `</html>\n`;

        return code;
    }

    private _generateTailwindCode(node: FigmaNode, options: CodeGenerationOptions): string {
        // Generate with Tailwind classes
        return this._generateReactCode(node, { ...options, useTailwind: true });
    }

    private _generateJsx(node: FigmaNode, options: CodeGenerationOptions, indent: number): string {
        const spaces = '  '.repeat(indent);
        const className = options.useTailwind
            ? this._generateTailwindClasses(node)
            : `styles.${this._sanitizeName(node.name)}`;

        let jsx = '';

        if (node.type === 'TEXT') {
            jsx += `${spaces}<span className="${className}">${node.characters || ''}</span>\n`;
        } else if (node.type === 'FRAME' || node.type === 'GROUP' || node.type === 'COMPONENT') {
            jsx += `${spaces}<div className="${className}">\n`;

            if (node.children) {
                for (const child of node.children) {
                    if (child.visible !== false) {
                        jsx += this._generateJsx(child, options, indent + 1);
                    }
                }
            }

            jsx += `${spaces}</div>\n`;
        } else if (node.type === 'RECTANGLE') {
            jsx += `${spaces}<div className="${className}" />\n`;
        } else if (node.type === 'ELLIPSE') {
            jsx += `${spaces}<div className="${className} rounded-full" />\n`;
        }

        return jsx;
    }

    private _generateVueTemplate(node: FigmaNode, options: CodeGenerationOptions, indent: number): string {
        const spaces = '  '.repeat(indent);
        const className = options.useTailwind
            ? this._generateTailwindClasses(node)
            : this._sanitizeName(node.name);

        let template = '';

        if (node.type === 'TEXT') {
            template += `${spaces}<span :class="['${className}', class]">${node.characters || ''}</span>\n`;
        } else if (node.type === 'FRAME' || node.type === 'GROUP') {
            template += `${spaces}<div :class="['${className}', class]">\n`;

            if (node.children) {
                for (const child of node.children) {
                    if (child.visible !== false) {
                        template += this._generateVueTemplate(child, options, indent + 1);
                    }
                }
            }

            template += `${spaces}</div>\n`;
        }

        return template;
    }

    private _generateSvelteTemplate(node: FigmaNode, options: CodeGenerationOptions, indent: number): string {
        const spaces = '  '.repeat(indent);
        const className = options.useTailwind
            ? this._generateTailwindClasses(node)
            : this._sanitizeName(node.name);

        let template = '';

        if (node.type === 'TEXT') {
            template += `${spaces}<span class="${className} {className}">${node.characters || ''}</span>\n`;
        } else if (node.type === 'FRAME' || node.type === 'GROUP') {
            template += `${spaces}<div class="${className} {className}">\n`;

            if (node.children) {
                for (const child of node.children) {
                    if (child.visible !== false) {
                        template += this._generateSvelteTemplate(child, options, indent + 1);
                    }
                }
            }

            template += `${spaces}</div>\n`;
        }

        return template;
    }

    private _generateHtmlElement(node: FigmaNode, options: CodeGenerationOptions, indent: number): string {
        const spaces = '  '.repeat(indent);
        const className = options.useTailwind
            ? this._generateTailwindClasses(node)
            : this._sanitizeName(node.name);

        let html = '';

        if (node.type === 'TEXT') {
            html += `${spaces}<span class="${className}">${node.characters || ''}</span>\n`;
        } else if (node.type === 'FRAME' || node.type === 'GROUP') {
            html += `${spaces}<div class="${className}">\n`;

            if (node.children) {
                for (const child of node.children) {
                    if (child.visible !== false) {
                        html += this._generateHtmlElement(child, options, indent + 1);
                    }
                }
            }

            html += `${spaces}</div>\n`;
        }

        return html;
    }

    private _generateTailwindClasses(node: FigmaNode): string {
        const classes: string[] = [];

        // Size
        if (node.absoluteBoundingBox) {
            const { width, height } = node.absoluteBoundingBox;
            classes.push(`w-[${Math.round(width)}px]`);
            classes.push(`h-[${Math.round(height)}px]`);
        }

        // Layout
        if (node.layoutMode === 'HORIZONTAL') {
            classes.push('flex', 'flex-row');
        } else if (node.layoutMode === 'VERTICAL') {
            classes.push('flex', 'flex-col');
        }

        // Spacing
        if (node.itemSpacing) {
            classes.push(`gap-[${node.itemSpacing}px]`);
        }

        // Padding
        if (node.paddingTop || node.paddingRight || node.paddingBottom || node.paddingLeft) {
            if (node.paddingTop === node.paddingBottom &&
                node.paddingLeft === node.paddingRight &&
                node.paddingTop === node.paddingLeft) {
                classes.push(`p-[${node.paddingTop}px]`);
            } else {
                if (node.paddingTop) classes.push(`pt-[${node.paddingTop}px]`);
                if (node.paddingRight) classes.push(`pr-[${node.paddingRight}px]`);
                if (node.paddingBottom) classes.push(`pb-[${node.paddingBottom}px]`);
                if (node.paddingLeft) classes.push(`pl-[${node.paddingLeft}px]`);
            }
        }

        // Border radius
        if (node.cornerRadius) {
            classes.push(`rounded-[${node.cornerRadius}px]`);
        }

        // Background color
        if (node.fills && node.fills.length > 0) {
            const fill = node.fills[0];
            if (fill.type === 'SOLID' && fill.color) {
                const hex = this._colorToHex(fill.color);
                classes.push(`bg-[${hex}]`);
            }
        }

        // Text styles
        if (node.type === 'TEXT' && node.style) {
            classes.push(`text-[${node.style.fontSize}px]`);
            classes.push(`font-[${node.style.fontWeight}]`);

            if (node.style.textAlignHorizontal === 'CENTER') {
                classes.push('text-center');
            } else if (node.style.textAlignHorizontal === 'RIGHT') {
                classes.push('text-right');
            }
        }

        return classes.join(' ');
    }

    private _generateCss(node: FigmaNode): string {
        let css = '';
        css += this._generateCssRule(node);

        if (node.children) {
            for (const child of node.children) {
                if (child.visible !== false) {
                    css += this._generateCss(child);
                }
            }
        }

        return css;
    }

    private _generateCssModule(node: FigmaNode): string {
        return `const styles = {\n${this._generateCssModuleRules(node, 1)}};\n`;
    }

    private _generateCssModuleRules(node: FigmaNode, indent: number): string {
        const spaces = '  '.repeat(indent);
        let css = `${spaces}${this._sanitizeName(node.name)}: {\n`;
        css += this._generateCssProperties(node, indent + 1);
        css += `${spaces}},\n`;

        if (node.children) {
            for (const child of node.children) {
                if (child.visible !== false) {
                    css += this._generateCssModuleRules(child, indent);
                }
            }
        }

        return css;
    }

    private _generateScopedCss(node: FigmaNode): string {
        return this._generateCss(node);
    }

    private _generateCssRule(node: FigmaNode): string {
        const className = this._sanitizeName(node.name);
        let css = `.${className} {\n`;
        css += this._generateCssPropertiesPlain(node);
        css += `}\n\n`;
        return css;
    }

    private _generateCssProperties(node: FigmaNode, indent: number): string {
        const spaces = '  '.repeat(indent);
        let css = '';

        if (node.absoluteBoundingBox) {
            css += `${spaces}width: '${Math.round(node.absoluteBoundingBox.width)}px',\n`;
            css += `${spaces}height: '${Math.round(node.absoluteBoundingBox.height)}px',\n`;
        }

        if (node.layoutMode === 'HORIZONTAL') {
            css += `${spaces}display: 'flex',\n`;
            css += `${spaces}flexDirection: 'row',\n`;
        } else if (node.layoutMode === 'VERTICAL') {
            css += `${spaces}display: 'flex',\n`;
            css += `${spaces}flexDirection: 'column',\n`;
        }

        if (node.itemSpacing) {
            css += `${spaces}gap: '${node.itemSpacing}px',\n`;
        }

        if (node.cornerRadius) {
            css += `${spaces}borderRadius: '${node.cornerRadius}px',\n`;
        }

        if (node.fills && node.fills.length > 0) {
            const fill = node.fills[0];
            if (fill.type === 'SOLID' && fill.color) {
                css += `${spaces}backgroundColor: '${this._colorToRgba(fill.color)}',\n`;
            }
        }

        return css;
    }

    private _generateCssPropertiesPlain(node: FigmaNode): string {
        let css = '';

        if (node.absoluteBoundingBox) {
            css += `  width: ${Math.round(node.absoluteBoundingBox.width)}px;\n`;
            css += `  height: ${Math.round(node.absoluteBoundingBox.height)}px;\n`;
        }

        if (node.layoutMode === 'HORIZONTAL') {
            css += `  display: flex;\n`;
            css += `  flex-direction: row;\n`;
        } else if (node.layoutMode === 'VERTICAL') {
            css += `  display: flex;\n`;
            css += `  flex-direction: column;\n`;
        }

        if (node.itemSpacing) {
            css += `  gap: ${node.itemSpacing}px;\n`;
        }

        if (node.cornerRadius) {
            css += `  border-radius: ${node.cornerRadius}px;\n`;
        }

        if (node.fills && node.fills.length > 0) {
            const fill = node.fills[0];
            if (fill.type === 'SOLID' && fill.color) {
                css += `  background-color: ${this._colorToRgba(fill.color)};\n`;
            }
        }

        if (node.type === 'TEXT' && node.style) {
            css += `  font-family: '${node.style.fontFamily}';\n`;
            css += `  font-size: ${node.style.fontSize}px;\n`;
            css += `  font-weight: ${node.style.fontWeight};\n`;
            css += `  line-height: ${node.style.lineHeightPx}px;\n`;
        }

        return css;
    }

    private _sanitizeName(name: string): string {
        return name
            .replace(/[^a-zA-Z0-9]/g, '_')
            .replace(/^[0-9]/, '_$&')
            .replace(/_+/g, '_');
    }

    private _colorToHex(color: Color): string {
        const r = Math.round(color.r * 255).toString(16).padStart(2, '0');
        const g = Math.round(color.g * 255).toString(16).padStart(2, '0');
        const b = Math.round(color.b * 255).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    }

    private _colorToRgba(color: Color): string {
        const r = Math.round(color.r * 255);
        const g = Math.round(color.g * 255);
        const b = Math.round(color.b * 255);
        const a = color.a ?? 1;
        return `rgba(${r}, ${g}, ${b}, ${a})`;
    }

    public dispose(): void {
        this._onDesignLoaded.dispose();
    }
}
