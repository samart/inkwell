// Mermaid diagram renderer for code blocks
import mermaid from 'mermaid';

// Initialize mermaid with configuration
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: 'var(--font-mono)',
});

interface MermaidBlock {
  container: HTMLElement;
  code: string;
  showingSource: boolean;
  diagramId: string;
}

export class MermaidRenderer {
  private observer: MutationObserver | null = null;
  private container: HTMLElement;
  private blocks: Map<HTMLElement, MermaidBlock> = new Map();
  private idCounter = 0;
  private currentTheme: 'light' | 'dark' = 'light';

  constructor(container: HTMLElement) {
    this.container = container;
    this.detectTheme();
  }

  private detectTheme(): void {
    // Check both document.documentElement and body for theme attribute
    const theme = document.body.getAttribute('data-theme') ||
                  document.documentElement.getAttribute('data-theme') ||
                  'light';
    this.currentTheme = theme.startsWith('dark') ? 'dark' : 'light';
    this.updateMermaidTheme();
  }

  private updateMermaidTheme(): void {
    mermaid.initialize({
      startOnLoad: false,
      theme: this.currentTheme === 'dark' ? 'dark' : 'default',
      securityLevel: 'loose',
      fontFamily: 'var(--font-mono)',
    });
  }

  start(): void {
    // Initial scan
    this.scanForMermaidBlocks();

    // Watch for DOM changes
    this.observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
          shouldScan = true;
          break;
        }
      }
      if (shouldScan) {
        // Debounce the scan
        requestAnimationFrame(() => this.scanForMermaidBlocks());
      }
    });

    this.observer.observe(this.container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Watch for theme changes on body (where Inkwell sets it)
    const themeObserver = new MutationObserver(() => {
      const newTheme = document.body.getAttribute('data-theme') || 'light';
      const isDark = newTheme.startsWith('dark');
      if ((isDark && this.currentTheme !== 'dark') || (!isDark && this.currentTheme !== 'light')) {
        this.currentTheme = isDark ? 'dark' : 'light';
        this.updateMermaidTheme();
        // Re-render all diagrams
        this.reRenderAllDiagrams();
      }
    });

    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }

  stop(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.blocks.clear();
  }

  private async scanForMermaidBlocks(): Promise<void> {
    // Find all code blocks with mermaid language
    // Crepe/Milkdown uses [data-type="code_block"] with [data-language] attributes
    // Also check for .cm-editor parents and standard code blocks
    const codeBlockSelectors = [
      '[data-type="code_block"]',      // Crepe/Milkdown code block wrapper
      '.code-block',                    // Generic code block class
      '.milkdown-code-block',           // Milkdown specific
      'pre[data-language]',             // Pre with language attribute
    ];

    const codeBlocks = this.container.querySelectorAll(codeBlockSelectors.join(', '));

    for (const block of codeBlocks) {
      const wrapper = block as HTMLElement;

      const language = this.getCodeBlockLanguage(wrapper);
      if (language !== 'mermaid') continue;

      // Skip if already processed
      if (this.blocks.has(wrapper)) {
        // Check if content changed
        const existingBlock = this.blocks.get(wrapper)!;
        const currentCode = this.extractCode(wrapper);
        if (existingBlock.code !== currentCode) {
          existingBlock.code = currentCode;
          if (!existingBlock.showingSource) {
            await this.renderDiagram(existingBlock);
          }
        }
        continue;
      }

      // Create new mermaid block
      const code = this.extractCode(wrapper);
      if (!code.trim()) continue;

      const mermaidBlock: MermaidBlock = {
        container: wrapper,
        code,
        showingSource: false,
        diagramId: `mermaid-${++this.idCounter}`,
      };

      this.blocks.set(wrapper, mermaidBlock);
      await this.renderDiagram(mermaidBlock);
    }
  }

  private getCodeBlockLanguage(wrapper: HTMLElement): string {
    // Try various ways to get the language
    const langAttr = wrapper.getAttribute('data-language');
    if (langAttr) return langAttr.toLowerCase();

    // Look for language class
    const classes = wrapper.className.split(' ');
    for (const cls of classes) {
      if (cls.startsWith('language-')) {
        return cls.replace('language-', '').toLowerCase();
      }
    }

    // Look for CodeMirror language indicator
    const cmLang = wrapper.querySelector('.cm-lang-mermaid, [data-language="mermaid"]');
    if (cmLang) return 'mermaid';

    // Check the content for mermaid patterns if we can't find a language tag
    const code = this.extractCode(wrapper);
    if (this.looksLikeMermaid(code)) {
      return 'mermaid';
    }

    return '';
  }

  private looksLikeMermaid(code: string): boolean {
    const trimmed = code.trim().toLowerCase();
    const mermaidKeywords = [
      'graph ', 'graph\n',
      'flowchart ', 'flowchart\n',
      'sequencediagram', 'sequence',
      'classDiagram', 'class',
      'stateDiagram', 'state',
      'erDiagram', 'er',
      'gantt',
      'pie',
      'journey',
      'gitGraph', 'git',
      'mindmap',
      'timeline',
      'quadrantchart',
    ];
    return mermaidKeywords.some(kw => trimmed.startsWith(kw.toLowerCase()));
  }

  private extractCode(wrapper: HTMLElement): string {
    // Debug: log the wrapper structure
    console.log('[Mermaid] Extracting code from wrapper:', wrapper.className, wrapper.outerHTML.substring(0, 500));

    // Try to get code from CodeMirror - each line is in a .cm-line element
    const cmLines = wrapper.querySelectorAll('.cm-line');
    console.log('[Mermaid] Found .cm-line elements:', cmLines.length);
    if (cmLines.length > 0) {
      const lines: string[] = [];
      cmLines.forEach(line => {
        lines.push(line.textContent || '');
      });
      const result = lines.join('\n');
      console.log('[Mermaid] Extracted from .cm-line:', result);
      return result;
    }

    // Try .cm-content - look for it both as child and in the wrapper itself
    const cmContent = wrapper.querySelector('.cm-content') ||
                      (wrapper.classList.contains('cm-content') ? wrapper : null);
    if (cmContent) {
      // Get all child nodes and reconstruct text with newlines
      const result = (cmContent as HTMLElement).innerText || cmContent.textContent || '';
      console.log('[Mermaid] Extracted from .cm-content:', result);
      return result;
    }

    // Try code element
    const codeEl = wrapper.querySelector('code');
    if (codeEl) {
      const result = codeEl.innerText || codeEl.textContent || '';
      console.log('[Mermaid] Extracted from code element:', result);
      return result;
    }

    // Try pre element
    const preEl = wrapper.querySelector('pre');
    if (preEl) {
      const result = preEl.innerText || preEl.textContent || '';
      console.log('[Mermaid] Extracted from pre element:', result);
      return result;
    }

    const result = (wrapper as HTMLElement).innerText || wrapper.textContent || '';
    console.log('[Mermaid] Extracted from wrapper directly:', result);
    return result;
  }

  private async renderDiagram(block: MermaidBlock): Promise<void> {
    try {
      // Create wrapper for the diagram
      const diagramWrapper = document.createElement('div');
      diagramWrapper.className = 'mermaid-diagram-wrapper';
      diagramWrapper.innerHTML = `
        <div class="mermaid-toolbar">
          <button class="mermaid-toggle-source" title="Toggle source code">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="16 18 22 12 16 6"></polyline>
              <polyline points="8 6 2 12 8 18"></polyline>
            </svg>
          </button>
        </div>
        <div class="mermaid-diagram" id="${block.diagramId}"></div>
        <div class="mermaid-source hidden">
          <pre><code>${this.escapeHtml(block.code)}</code></pre>
        </div>
      `;

      // Render the mermaid diagram
      const diagramContainer = diagramWrapper.querySelector('.mermaid-diagram') as HTMLElement;

      const { svg } = await mermaid.render(block.diagramId, block.code);
      diagramContainer.innerHTML = svg;

      // Add toggle functionality
      const toggleBtn = diagramWrapper.querySelector('.mermaid-toggle-source') as HTMLButtonElement;
      const sourceDiv = diagramWrapper.querySelector('.mermaid-source') as HTMLElement;

      toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        block.showingSource = !block.showingSource;

        if (block.showingSource) {
          diagramContainer.classList.add('hidden');
          sourceDiv.classList.remove('hidden');
          toggleBtn.classList.add('active');
          toggleBtn.title = 'Show diagram';
        } else {
          diagramContainer.classList.remove('hidden');
          sourceDiv.classList.add('hidden');
          toggleBtn.classList.remove('active');
          toggleBtn.title = 'Show source code';
        }
      });

      // Hide original code block and insert diagram
      block.container.style.display = 'none';
      block.container.insertAdjacentElement('afterend', diagramWrapper);

      // Store reference to cleanup later
      (block.container as any).__mermaidWrapper = diagramWrapper;

    } catch (error) {
      console.error('Failed to render mermaid diagram:', error);
      // Show error in the code block
      const errorDiv = document.createElement('div');
      errorDiv.className = 'mermaid-error';
      errorDiv.innerHTML = `
        <div class="mermaid-error-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>Mermaid syntax error</span>
        </div>
        <pre><code>${this.escapeHtml(block.code)}</code></pre>
      `;
      block.container.insertAdjacentElement('afterend', errorDiv);
      block.container.style.display = 'none';
      (block.container as any).__mermaidWrapper = errorDiv;
    }
  }

  private async reRenderAllDiagrams(): Promise<void> {
    for (const [wrapper, block] of this.blocks) {
      // Remove existing diagram wrapper
      const existingWrapper = (wrapper as any).__mermaidWrapper;
      if (existingWrapper) {
        existingWrapper.remove();
      }
      wrapper.style.display = '';

      // Re-render
      block.diagramId = `mermaid-${++this.idCounter}`;
      await this.renderDiagram(block);
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}