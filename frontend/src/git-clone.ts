interface ValidateURLResponse {
    valid: boolean;
    error: string;
    authType: string;
}

export class GitCloneDialog {
    private dialog: HTMLDivElement | null = null;
    private onSuccess: ((path: string) => void) | null = null;

    show(onSuccess: (path: string) => void): void {
        this.onSuccess = onSuccess;
        this.createDialog();
    }

    private createDialog(): void {
        // Remove existing dialog if any
        this.close();

        this.dialog = document.createElement('div');
        this.dialog.className = 'modal';
        this.dialog.innerHTML = `
            <div class="modal-backdrop"></div>
            <div class="modal-content clone-dialog">
                <h3>Clone Repository</h3>
                <div class="clone-form">
                    <div class="form-group">
                        <label for="clone-url">Repository URL</label>
                        <input type="text" id="clone-url" placeholder="https://github.com/user/repo.git or git@github.com:user/repo.git" />
                        <span id="url-validation" class="validation-message"></span>
                    </div>

                    <div id="auth-section" class="auth-section hidden">
                        <div class="auth-type-indicator">
                            <span id="auth-type-label"></span>
                        </div>

                        <div id="ssh-auth" class="hidden">
                            <div class="form-group">
                                <label for="ssh-key-path">SSH Key Path (optional)</label>
                                <input type="text" id="ssh-key-path" placeholder="~/.ssh/id_ed25519" />
                                <span class="form-hint">Leave empty to use default keys</span>
                            </div>
                        </div>

                        <div id="https-auth" class="hidden">
                            <div class="form-group">
                                <label for="https-username">Username</label>
                                <input type="text" id="https-username" placeholder="Username or email" />
                            </div>
                            <div class="form-group">
                                <label for="https-password">Password / Token</label>
                                <input type="password" id="https-password" placeholder="Personal access token recommended" />
                                <span class="form-hint">Use a personal access token for better security</span>
                            </div>
                        </div>
                    </div>

                    <div id="clone-progress" class="clone-progress hidden">
                        <div class="progress-bar">
                            <div class="progress-fill"></div>
                        </div>
                        <span class="progress-text">Cloning...</span>
                    </div>

                    <div id="clone-error" class="error-message hidden"></div>
                </div>

                <div class="modal-actions">
                    <button id="cancel-clone" class="btn-secondary">Cancel</button>
                    <button id="confirm-clone" class="btn-primary" disabled>Clone</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.dialog);
        this.attachEventListeners();

        // Focus the URL input
        const urlInput = this.dialog.querySelector('#clone-url') as HTMLInputElement;
        urlInput?.focus();
    }

    private attachEventListeners(): void {
        if (!this.dialog) return;

        const backdrop = this.dialog.querySelector('.modal-backdrop');
        const cancelBtn = this.dialog.querySelector('#cancel-clone');
        const confirmBtn = this.dialog.querySelector('#confirm-clone') as HTMLButtonElement;
        const urlInput = this.dialog.querySelector('#clone-url') as HTMLInputElement;

        backdrop?.addEventListener('click', () => this.close());
        cancelBtn?.addEventListener('click', () => this.close());
        confirmBtn?.addEventListener('click', () => this.doClone());

        // URL validation on input
        let debounceTimer: number;
        urlInput?.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = window.setTimeout(() => this.validateURL(), 300);
        });

        // Handle Enter key
        urlInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !confirmBtn.disabled) {
                this.doClone();
            }
        });

        // Close on Escape
        document.addEventListener('keydown', this.handleEscape);
    }

    private handleEscape = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
            this.close();
        }
    };

    private async validateURL(): Promise<void> {
        if (!this.dialog) return;

        const urlInput = this.dialog.querySelector('#clone-url') as HTMLInputElement;
        const validation = this.dialog.querySelector('#url-validation') as HTMLSpanElement;
        const authSection = this.dialog.querySelector('#auth-section') as HTMLDivElement;
        const authTypeLabel = this.dialog.querySelector('#auth-type-label') as HTMLSpanElement;
        const sshAuth = this.dialog.querySelector('#ssh-auth') as HTMLDivElement;
        const httpsAuth = this.dialog.querySelector('#https-auth') as HTMLDivElement;
        const confirmBtn = this.dialog.querySelector('#confirm-clone') as HTMLButtonElement;

        const url = urlInput.value.trim();

        if (!url) {
            validation.textContent = '';
            validation.className = 'validation-message';
            authSection.classList.add('hidden');
            confirmBtn.disabled = true;
            return;
        }

        try {
            const response = await fetch(`/api/git/validate-url?url=${encodeURIComponent(url)}`);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error);
            }

            const result = data.data as ValidateURLResponse;

            if (result.valid) {
                validation.textContent = '✓ Valid repository URL';
                validation.className = 'validation-message valid';
                confirmBtn.disabled = false;

                // Show appropriate auth section
                authSection.classList.remove('hidden');

                if (result.authType === 'ssh') {
                    authTypeLabel.textContent = 'SSH Authentication';
                    sshAuth.classList.remove('hidden');
                    httpsAuth.classList.add('hidden');
                } else if (result.authType === 'https') {
                    authTypeLabel.textContent = 'HTTPS Authentication (optional)';
                    sshAuth.classList.add('hidden');
                    httpsAuth.classList.remove('hidden');
                } else {
                    authSection.classList.add('hidden');
                }
            } else {
                validation.textContent = result.error || 'Invalid URL';
                validation.className = 'validation-message invalid';
                authSection.classList.add('hidden');
                confirmBtn.disabled = true;
            }
        } catch (error) {
            validation.textContent = 'Failed to validate URL';
            validation.className = 'validation-message invalid';
            confirmBtn.disabled = true;
        }
    }

    private async doClone(): Promise<void> {
        if (!this.dialog) return;

        const urlInput = this.dialog.querySelector('#clone-url') as HTMLInputElement;
        const sshKeyInput = this.dialog.querySelector('#ssh-key-path') as HTMLInputElement;
        const usernameInput = this.dialog.querySelector('#https-username') as HTMLInputElement;
        const passwordInput = this.dialog.querySelector('#https-password') as HTMLInputElement;
        const progress = this.dialog.querySelector('#clone-progress') as HTMLDivElement;
        const errorDiv = this.dialog.querySelector('#clone-error') as HTMLDivElement;
        const confirmBtn = this.dialog.querySelector('#confirm-clone') as HTMLButtonElement;
        const cancelBtn = this.dialog.querySelector('#cancel-clone') as HTMLButtonElement;

        const url = urlInput.value.trim();

        // Disable buttons and show progress
        confirmBtn.disabled = true;
        cancelBtn.textContent = 'Cancel';
        progress.classList.remove('hidden');
        errorDiv.classList.add('hidden');

        try {
            const response = await fetch('/api/git/clone', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url,
                    sshKeyPath: sshKeyInput?.value.trim() || undefined,
                    username: usernameInput?.value.trim() || undefined,
                    password: passwordInput?.value || undefined,
                }),
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error);
            }

            // Success - call callback with path
            const result = data.data;
            this.close();

            if (this.onSuccess) {
                this.onSuccess(result.path);
            }
        } catch (error) {
            progress.classList.add('hidden');
            errorDiv.classList.remove('hidden');
            errorDiv.textContent = error instanceof Error ? error.message : 'Clone failed';
            confirmBtn.disabled = false;
        }
    }

    close(): void {
        document.removeEventListener('keydown', this.handleEscape);

        if (this.dialog) {
            this.dialog.remove();
            this.dialog = null;
        }
    }
}

// Singleton instance
export const gitCloneDialog = new GitCloneDialog();
