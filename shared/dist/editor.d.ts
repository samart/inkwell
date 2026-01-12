export declare const CREPE_STYLES: readonly ["@milkdown/crepe/theme/common/style.css", "@milkdown/crepe/theme/common/prosemirror.css", "@milkdown/crepe/theme/common/reset.css", "@milkdown/crepe/theme/common/toolbar.css", "@milkdown/crepe/theme/common/block-edit.css", "@milkdown/crepe/theme/common/placeholder.css", "@milkdown/crepe/theme/common/code-mirror.css", "@milkdown/crepe/theme/common/list-item.css", "@milkdown/crepe/theme/common/table.css", "@milkdown/crepe/theme/common/link-tooltip.css", "@milkdown/crepe/theme/common/image-block.css", "@milkdown/crepe/theme/common/cursor.css", "@milkdown/crepe/theme/frame.css"];
export interface Heading {
    level: number;
    text: string;
    line: number;
}
/**
 * Image upload handler type.
 * Receives a File and should return the URL/path to use in markdown.
 */
export type ImageUploadHandler = (file: File) => Promise<string>;
export interface EditorOptions {
    /** Called when a file is loaded */
    onLoad?: (path: string) => void;
    /** Called when file is saved */
    onSave?: (path: string) => void;
    /** Called when content changes */
    onChange?: (path: string, content: string, dirty: boolean) => void;
    /** Called on error */
    onError?: (message: string) => void;
    /** Called for status updates */
    onStatus?: (message: string) => void;
    /**
     * Handler for image uploads. If not provided, image upload is disabled.
     * Should return the URL/path to use in the markdown.
     */
    onImageUpload?: ImageUploadHandler;
    /** Placeholder text shown in empty editor */
    placeholder?: string;
    /**
     * Periodic auto-save interval in milliseconds.
     * Saves every N ms if there are unsaved changes.
     * Set to 0 to disable. Default: 300000 (5 minutes)
     */
    periodicSaveInterval?: number;
    /**
     * Save when window/tab loses focus.
     * Default: true
     */
    saveOnBlur?: boolean;
    /**
     * Minimum time between saves in milliseconds.
     * Prevents rapid saves from overlapping events.
     * Default: 1000 (1 second)
     */
    minSaveInterval?: number;
}
export declare class MarkdownEditor {
    private container;
    private options;
    private crepe;
    private currentPath;
    private isDirty;
    private lastContent;
    private initialized;
    private periodicSaveTimer;
    private lastSaveTime;
    constructor(container: HTMLElement, options?: EditorOptions);
    init(): Promise<this>;
    private handleVisibilityChange;
    private handleBlur;
    private createEditor;
    /**
     * Load content from a path. The actual file reading should be done by the consumer.
     * This is a convenience method for tracking the current path.
     */
    loadContent(path: string, content: string): Promise<void>;
    setContent(markdown: string): Promise<void>;
    getContent(): string;
    private handleChange;
    /**
     * Notify that content should be saved.
     * The actual save implementation is handled by the consumer via onSave.
     * Includes throttling to prevent rapid saves from overlapping events.
     */
    notifySave(): void;
    /**
     * Mark the editor as saved (reset dirty state).
     */
    markSaved(): void;
    private handlePaste;
    private handleDrop;
    private uploadAndInsertImage;
    focus(): void;
    destroy(): void;
    getWordCount(): number;
    getCurrentPath(): string | null;
    setCurrentPath(path: string | null): void;
    getHeadings(): Heading[];
    scrollToLine(lineNumber: number): void;
    /**
     * Check if the editor has unsaved changes.
     */
    isDirtyState(): boolean;
}
//# sourceMappingURL=editor.d.ts.map