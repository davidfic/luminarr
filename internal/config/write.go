package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// WriteConfigKey writes a single dot-notation key (e.g. "tmdb.api_key") to the
// given YAML config file, creating the file and parent directories if needed.
// If configFile is empty, the default path (~/.config/luminarr/config.yaml, or
// /config/config.yaml in Docker) is used.
//
// Existing keys in the file are preserved; only the target key is updated.
// Returns the actual file path that was written.
func WriteConfigKey(configFile, key, value string) (writePath string, err error) {
	path := configFile
	if path == "" {
		home, _ := os.UserHomeDir()
		if home != "" {
			path = filepath.Join(home, ".config", "luminarr", "config.yaml")
		} else {
			path = "/config/config.yaml"
		}
	}

	// Read existing config into a generic map to preserve all other keys.
	data := map[string]interface{}{}
	if raw, readErr := os.ReadFile(path); readErr == nil {
		_ = yaml.Unmarshal(raw, &data)
	}

	// Set the key using dot-notation (supports one level of nesting only:
	// "parent.child"). Values nested deeper than one level are not needed today.
	parts := strings.SplitN(key, ".", 2)
	if len(parts) == 2 {
		sub, ok := data[parts[0]].(map[string]interface{})
		if !ok {
			sub = map[string]interface{}{}
		}
		sub[parts[1]] = value
		data[parts[0]] = sub
	} else {
		data[key] = value
	}

	// Ensure parent directory exists.
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return "", fmt.Errorf("creating config directory: %w", err)
	}

	raw, err := yaml.Marshal(data)
	if err != nil {
		return "", fmt.Errorf("marshaling config: %w", err)
	}

	if err := os.WriteFile(path, raw, 0o600); err != nil {
		return "", fmt.Errorf("writing config file: %w", err)
	}

	return path, nil
}
