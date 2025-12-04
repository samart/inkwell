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
  code: string;
  showingSource: boolean;
  diagramId: string;
  wrapper: HTMLElement;
}

export class MermaidRenderer {
  private observer: MutationObserver | null = null;
  private themeObserver: MutationObserver | null = null;
  private container: HTMLElement;
  private blocks: Map<string, MermaidBlock> = new Map(); // Key by code hash
  private idCounter = 0;
  private currentTheme: 'light' | 'dark' = 'light';
  private scanDebounceTimer: number | null = null;
  private isScanning = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.detectTheme();
  }

  private detectTheme(): void {
    const theme = document.body.getAttribute('data-theme') ||
                  document.documentElement.getAttribute('data-theme') ||
                  'light';
    this.currentTheme = theme.startsWith('dark') ? 'dark' : 'light';
    this.updateMermaidTheme();
  }

  private updateMermaidTheme(): void {
    const isDark = this.currentTheme === 'dark';
    
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
      theme: 'base',
      themeVariables: isDark ? {
        // Dark theme - sleek and modern
        primaryColor: '#3b82f6',
        primaryTextColor: '#f8fafc',
        primaryBorderColor: '#475569',
        secondaryColor: '#1e293b',
        secondaryTextColor: '#e2e8f0',
        secondaryBorderColor: '#334155',
        tertiaryColor: '#0f172a',
        tertiaryTextColor: '#cbd5e1',
        tertiaryBorderColor: '#1e293b',
        lineColor: '#64748b',
        textColor: '#e2e8f0',
        mainBkg: '#1e293b',
        nodeBorder: '#475569',
        clusterBkg: '#0f172a',
        clusterBorder: '#334155',
        titleColor: '#f1f5f9',
        edgeLabelBackground: '#1e293b',
        nodeTextColor: '#f1f5f9',
        // Flowchart specific
        nodeBkg: '#1e293b',
        // Sequence diagram
        actorBkg: '#1e293b',
        actorBorder: '#475569',
        actorTextColor: '#f1f5f9',
        actorLineColor: '#64748b',
        signalColor: '#64748b',
        signalTextColor: '#e2e8f0',
        labelBoxBkgColor: '#1e293b',
        labelBoxBorderColor: '#475569',
        labelTextColor: '#e2e8f0',
        loopTextColor: '#94a3b8',
        noteBkgColor: '#334155',
        noteBorderColor: '#475569',
        noteTextColor: '#e2e8f0',
        activationBkgColor: '#334155',
        activationBorderColor: '#475569',
        // Class diagram
        classText: '#f1f5f9',
        // State diagram
        labelColor: '#e2e8f0',
        altBackground: '#0f172a',
        // Gantt
        sectionBkgColor: '#1e293b',
        altSectionBkgColor: '#0f172a',
        gridColor: '#334155',
        todayLineColor: '#3b82f6',
      } : {
        // Light theme - clean and minimal
        primaryColor: '#3b82f6',
        primaryTextColor: '#1e293b',
        primaryBorderColor: '#cbd5e1',
        secondaryColor: '#f1f5f9',
        secondaryTextColor: '#334155',
        secondaryBorderColor: '#e2e8f0',
        tertiaryColor: '#ffffff',
        tertiaryTextColor: '#475569',
        tertiaryBorderColor: '#f1f5f9',
        lineColor: '#94a3b8',
        textColor: '#334155',
        mainBkg: '#ffffff',
        nodeBorder: '#cbd5e1',
        clusterBkg: '#f8fafc',
        clusterBorder: '#e2e8f0',
        titleColor: '#1e293b',
        edgeLabelBackground: '#ffffff',
        nodeTextColor: '#1e293b',
        // Flowchart specific
        nodeBkg: '#ffffff',
        // Sequence diagram
        actorBkg: '#ffffff',
        actorBorder: '#cbd5e1',
        actorTextColor: '#1e293b',
        actorLineColor: '#94a3b8',
        signalColor: '#94a3b8',
        signalTextColor: '#334155',
        labelBoxBkgColor: '#ffffff',
        labelBoxBorderColor: '#e2e8f0',
        labelTextColor: '#334155',
        loopTextColor: '#64748b',
        noteBkgColor: '#fef3c7',
        noteBorderColor: '#fcd34d',
        noteTextColor: '#92400e',
        activationBkgColor: '#f1f5f9',
        activationBorderColor: '#cbd5e1',
        // Class diagram
        classText: '#1e293b',
        // State diagram
        labelColor: '#334155',
        altBackground: '#f8fafc',
        // Gantt
        sectionBkgColor: '#ffffff',
        altSectionBkgColor: '#f8fafc',
        gridColor: '#e2e8f0',
        todayLineColor: '#3b82f6',
      },
    });
  }

  start(): void {
    // Initial scan after a delay to let the editor settle
    setTimeout(() => this.scanForMermaidBlocks(), 500);

    // Watch for DOM changes with debouncing
    this.observer = new MutationObserver(() => {
      this.debouncedScan();
    });

    this.observer.observe(this.container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Watch for theme changes
    this.themeObserver = new MutationObserver(() => {
      const newTheme = document.body.getAttribute('data-theme') || 'light';
      const isDark = newTheme.startsWith('dark');
      if ((isDark && this.currentTheme !== 'dark') || (!isDark && this.currentTheme !== 'light')) {
        this.currentTheme = isDark ? 'dark' : 'light';
        this.updateMermaidTheme();
        this.reRenderAllDiagrams();
      }
    });

    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }

  private debouncedScan(): void {
    if (this.scanDebounceTimer !== null) {
      clearTimeout(this.scanDebounceTimer);
    }
    this.scanDebounceTimer = window.setTimeout(() => {
      this.scanDebounceTimer = null;
      this.scanForMermaidBlocks();
    }, 300);
  }

  stop(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }
    if (this.scanDebounceTimer !== null) {
      clearTimeout(this.scanDebounceTimer);
    }
    // Clean up diagram wrappers
    for (const [, block] of this.blocks) {
      block.wrapper.remove();
    }
    this.blocks.clear();
  }

  private hashCode(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return 'mermaid-' + Math.abs(hash).toString(36);
  }

  private async scanForMermaidBlocks(): Promise<void> {
    if (this.isScanning) return;
    this.isScanning = true;

    try {
      // Find all code blocks - try multiple selectors for different editor setups
      // Crepe/Milkdown uses data-type="code_block" or has pre elements with CodeMirror
      let codeBlocks = this.container.querySelectorAll('[data-type="code_block"]');

      // If no code blocks found with data-type, try looking for pre elements with cm-editor
      if (codeBlocks.length === 0) {
        codeBlocks = this.container.querySelectorAll('pre:has(.cm-editor), .code-block, [data-node-type="code_block"]');
      }

      // Also try looking for divs containing cm-editor that might be code blocks
      if (codeBlocks.length === 0) {
        codeBlocks = this.container.querySelectorAll('div.cm-editor');
      }

      console.log('[Mermaid] Found code blocks:', codeBlocks.length);
      const foundCodes = new Set<string>();

      for (const block of codeBlocks) {
        const wrapper = block as HTMLElement;

        // Skip if already has our diagram wrapper as sibling
        const nextSibling = wrapper.nextElementSibling;
        if (nextSibling?.classList.contains('mermaid-diagram-wrapper')) {
          // Check if code changed
          const code = this.extractCode(wrapper);
          const codeHash = this.hashCode(code);
          foundCodes.add(codeHash);

          const existingBlock = this.blocks.get(codeHash);
          if (existingBlock && existingBlock.code !== code) {
            // Code changed, re-render
            existingBlock.code = code;
            if (!existingBlock.showingSource) {
              await this.updateDiagram(existingBlock);
            }
          }
          continue;
        }

        const language = this.getCodeBlockLanguage(wrapper);
        console.log('[Mermaid] Code block language:', language, 'attrs:', wrapper.getAttribute('data-language'));
        if (language !== 'mermaid') continue;

        const code = this.extractCode(wrapper);
        if (!code.trim()) continue;

        const codeHash = this.hashCode(code);
        foundCodes.add(codeHash);

        // Check if we already have this exact code rendered
        if (this.blocks.has(codeHash)) {
          continue;
        }

        // Create and render new diagram
        const diagramWrapper = await this.createDiagramWrapper(code, codeHash);
        if (diagramWrapper) {
          // Insert after the code block
          wrapper.insertAdjacentElement('afterend', diagramWrapper);
          // Hide the original code block
          wrapper.style.display = 'none';

          this.blocks.set(codeHash, {
            code,
            showingSource: false,
            diagramId: codeHash,
            wrapper: diagramWrapper,
          });
        }
      }

      // Clean up orphaned diagrams
      for (const [hash, block] of this.blocks) {
        if (!foundCodes.has(hash)) {
          block.wrapper.remove();
          this.blocks.delete(hash);
        }
      }
    } finally {
      this.isScanning = false;
    }
  }

  private getCodeBlockLanguage(wrapper: HTMLElement): string {
    // Try data-language attribute
    const langAttr = wrapper.getAttribute('data-language');
    if (langAttr) return langAttr.toLowerCase();

    // Look for language class
    const classes = wrapper.className.split(' ');
    for (const cls of classes) {
      if (cls.startsWith('language-')) {
        return cls.replace('language-', '').toLowerCase();
      }
    }

    // Check content for mermaid patterns
    const code = this.extractCode(wrapper);
    if (this.looksLikeMermaid(code)) {
      return 'mermaid';
    }

    return '';
  }

  private looksLikeMermaid(code: string): boolean {
    const trimmed = code.trim().toLowerCase();
    const mermaidKeywords = [
      'graph ', 'graph\n', 'graph\t',
      'flowchart ', 'flowchart\n',
      'sequencediagram',
      'classdiagram',
      'statediagram',
      'erdiagram',
      'gantt',
      'pie',
      'journey',
      'gitgraph',
      'mindmap',
      'timeline',
      'quadrantchart',
      'sankey',
      'xychart',
      'block-beta',
    ];
    const result = mermaidKeywords.some(kw => trimmed.startsWith(kw));
    console.log('[Mermaid] looksLikeMermaid check:', trimmed.substring(0, 50), '=> result:', result);
    return result;
  }

  private extractCode(wrapper: HTMLElement): string {
    // Try CodeMirror lines first
    const cmLines = wrapper.querySelectorAll('.cm-line');
    if (cmLines.length > 0) {
      const lines: string[] = [];
      cmLines.forEach(line => {
        lines.push(line.textContent || '');
      });
      return lines.join('\n');
    }

    // Try cm-content
    const cmContent = wrapper.querySelector('.cm-content');
    if (cmContent) {
      return (cmContent as HTMLElement).innerText || cmContent.textContent || '';
    }

    // Try code/pre elements
    const codeEl = wrapper.querySelector('code');
    if (codeEl) {
      return codeEl.innerText || codeEl.textContent || '';
    }

    const preEl = wrapper.querySelector('pre');
    if (preEl) {
      return preEl.innerText || preEl.textContent || '';
    }

    return (wrapper as HTMLElement).innerText || wrapper.textContent || '';
  }

  private async createDiagramWrapper(code: string, diagramId: string): Promise<HTMLElement | null> {
    const diagramWrapper = document.createElement('div');
    diagramWrapper.className = 'mermaid-diagram-wrapper';
    diagramWrapper.setAttribute('data-mermaid-id', diagramId);

    try {
      // Generate unique ID for this render
      const renderId = `${diagramId}-${++this.idCounter}`;
      const { svg } = await mermaid.render(renderId, code);

      diagramWrapper.innerHTML = `
        <div class="mermaid-toolbar">
          <button class="mermaid-toggle-source" title="Show source code">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="16 18 22 12 16 6"></polyline>
              <polyline points="8 6 2 12 8 18"></polyline>
            </svg>
          </button>
        </div>
        <div class="mermaid-diagram">${svg}</div>
        <div class="mermaid-source hidden">
          <pre><code>${this.escapeHtml(code)}</code></pre>
        </div>
      `;

      // Add toggle functionality
      const toggleBtn = diagramWrapper.querySelector('.mermaid-toggle-source') as HTMLButtonElement;
      const diagramDiv = diagramWrapper.querySelector('.mermaid-diagram') as HTMLElement;
      const sourceDiv = diagramWrapper.querySelector('.mermaid-source') as HTMLElement;

      toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const block = this.blocks.get(diagramId);
        if (!block) return;

        block.showingSource = !block.showingSource;

        if (block.showingSource) {
          diagramDiv.classList.add('hidden');
          sourceDiv.classList.remove('hidden');
          toggleBtn.classList.add('active');
          toggleBtn.title = 'Show diagram';
        } else {
          diagramDiv.classList.remove('hidden');
          sourceDiv.classList.add('hidden');
          toggleBtn.classList.remove('active');
          toggleBtn.title = 'Show source code';
        }
      });

      return diagramWrapper;

    } catch (error) {
      console.error('Failed to render mermaid diagram:', error);

      diagramWrapper.innerHTML = `
        <div class="mermaid-error">
          <div class="mermaid-error-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>Mermaid syntax error</span>
          </div>
          <pre><code>${this.escapeHtml(code)}</code></pre>
        </div>
      `;

      return diagramWrapper;
    }
  }

  private async updateDiagram(block: MermaidBlock): Promise<void> {
    try {
      const renderId = `${block.diagramId}-${++this.idCounter}`;
      const { svg } = await mermaid.render(renderId, block.code);

      const diagramDiv = block.wrapper.querySelector('.mermaid-diagram');
      if (diagramDiv) {
        diagramDiv.innerHTML = svg;
      }

      // Update source view too
      const sourceCode = block.wrapper.querySelector('.mermaid-source code');
      if (sourceCode) {
        sourceCode.innerHTML = this.escapeHtml(block.code);
      }
    } catch (error) {
      console.error('Failed to update mermaid diagram:', error);
    }
  }

  private async reRenderAllDiagrams(): Promise<void> {
    for (const [, block] of this.blocks) {
      await this.updateDiagram(block);
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
