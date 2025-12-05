package git

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-git/go-git/v5/plumbing/transport"
	"github.com/go-git/go-git/v5/plumbing/transport/http"
	"github.com/go-git/go-git/v5/plumbing/transport/ssh"
)

// AuthType represents the type of authentication
type AuthType string

const (
	AuthTypeSSH   AuthType = "ssh"
	AuthTypeHTTPS AuthType = "https"
	AuthTypeNone  AuthType = "none"
)

// AuthConfig holds authentication configuration
type AuthConfig struct {
	Type          AuthType `json:"type"`
	SSHKeyPath    string   `json:"sshKeyPath,omitempty"`
	SSHPassphrase string   `json:"sshPassphrase,omitempty"`
	Username      string   `json:"username,omitempty"`
	Password      string   `json:"password,omitempty"` // or token
}

// DetectAuthType determines the authentication type from a URL
func DetectAuthType(url string) AuthType {
	url = strings.ToLower(url)

	// SSH patterns
	if strings.HasPrefix(url, "git@") ||
		strings.HasPrefix(url, "ssh://") ||
		strings.Contains(url, "@") && !strings.HasPrefix(url, "http") {
		return AuthTypeSSH
	}

	// HTTPS patterns
	if strings.HasPrefix(url, "https://") || strings.HasPrefix(url, "http://") {
		return AuthTypeHTTPS
	}

	// Local file path or other
	return AuthTypeNone
}

// GetAuth returns the appropriate authentication method for the given config
func GetAuth(config AuthConfig) (transport.AuthMethod, error) {
	switch config.Type {
	case AuthTypeSSH:
		if config.SSHPassphrase != "" {
			return getSSHAuthWithPassphrase(config.SSHKeyPath, config.SSHPassphrase)
		}
		return getSSHAuth(config.SSHKeyPath)
	case AuthTypeHTTPS:
		return getHTTPSAuth(config.Username, config.Password), nil
	case AuthTypeNone:
		return nil, nil
	default:
		return nil, fmt.Errorf("unknown auth type: %s", config.Type)
	}
}

// getSSHAuth returns SSH authentication using the specified key or default keys
func getSSHAuth(keyPath string) (transport.AuthMethod, error) {
	// If no key path specified, try default locations
	if keyPath == "" {
		keyPath = findDefaultSSHKey()
		if keyPath == "" {
			return nil, fmt.Errorf("no SSH key found. Tried ~/.ssh/id_ed25519 and ~/.ssh/id_rsa")
		}
	}

	// Check if key exists
	if _, err := os.Stat(keyPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("SSH key not found: %s", keyPath)
	}

	// Try to load the key without passphrase first
	auth, err := ssh.NewPublicKeysFromFile("git", keyPath, "")
	if err != nil {
		// Key might be encrypted - return error indicating passphrase needed
		if strings.Contains(err.Error(), "encrypted") || strings.Contains(err.Error(), "passphrase") {
			return nil, fmt.Errorf("SSH key requires passphrase: %s", keyPath)
		}
		return nil, fmt.Errorf("failed to load SSH key %s: %w", keyPath, err)
	}

	return auth, nil
}

// getSSHAuthWithPassphrase returns SSH authentication with a passphrase
func getSSHAuthWithPassphrase(keyPath, passphrase string) (transport.AuthMethod, error) {
	if keyPath == "" {
		keyPath = findDefaultSSHKey()
		if keyPath == "" {
			return nil, fmt.Errorf("no SSH key found")
		}
	}

	auth, err := ssh.NewPublicKeysFromFile("git", keyPath, passphrase)
	if err != nil {
		return nil, fmt.Errorf("failed to load SSH key with passphrase: %w", err)
	}

	return auth, nil
}

// getHTTPSAuth returns HTTPS basic authentication
func getHTTPSAuth(username, password string) transport.AuthMethod {
	if username == "" && password == "" {
		return nil
	}

	return &http.BasicAuth{
		Username: username,
		Password: password,
	}
}

// findDefaultSSHKey looks for SSH keys in default locations
func findDefaultSSHKey() string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return ""
	}

	sshDir := filepath.Join(homeDir, ".ssh")

	// Try ed25519 first (preferred)
	ed25519Key := filepath.Join(sshDir, "id_ed25519")
	if _, err := os.Stat(ed25519Key); err == nil {
		return ed25519Key
	}

	// Fall back to RSA
	rsaKey := filepath.Join(sshDir, "id_rsa")
	if _, err := os.Stat(rsaKey); err == nil {
		return rsaKey
	}

	return ""
}

// GetDefaultSSHKeyPath returns the path to the default SSH key if it exists
func GetDefaultSSHKeyPath() string {
	return findDefaultSSHKey()
}

// ValidateSSHKey checks if an SSH key exists and can be loaded
func ValidateSSHKey(keyPath string) error {
	if keyPath == "" {
		keyPath = findDefaultSSHKey()
		if keyPath == "" {
			return fmt.Errorf("no SSH key found")
		}
	}

	if _, err := os.Stat(keyPath); os.IsNotExist(err) {
		return fmt.Errorf("SSH key not found: %s", keyPath)
	}

	// Try to load without passphrase to check if it's encrypted
	_, err := ssh.NewPublicKeysFromFile("git", keyPath, "")
	if err != nil {
		if strings.Contains(err.Error(), "encrypted") || strings.Contains(err.Error(), "passphrase") {
			return fmt.Errorf("SSH key requires passphrase")
		}
		return fmt.Errorf("invalid SSH key: %w", err)
	}

	return nil
}
