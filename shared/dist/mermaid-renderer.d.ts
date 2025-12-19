export declare class MermaidRenderer {
    private observer;
    private themeObserver;
    private container;
    private blocks;
    private idCounter;
    private currentTheme;
    private scanDebounceTimer;
    private isScanning;
    constructor(container: HTMLElement);
    private detectTheme;
    private updateMermaidTheme;
    start(): void;
    private debouncedScan;
    stop(): void;
    private hashCode;
    private scanForMermaidBlocks;
    private getCodeBlockLanguage;
    private looksLikeMermaid;
    private extractCode;
    private createDiagramWrapper;
    private updateDiagram;
    private reRenderAllDiagrams;
    private escapeHtml;
}
//# sourceMappingURL=mermaid-renderer.d.ts.map