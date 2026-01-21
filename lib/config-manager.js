// Config Manager for UserWeb extension
// Handles loading, parsing, and managing config.json files

export class ConfigManager {
  constructor() {
    this.configs = new Map();
  }

  /**
   * Load all configs from storage
   */
  async loadAllConfigs() {
    try {
      const result = await chrome.storage.local.get(['userweb_configs']);
      if (result.userweb_configs) {
        this.configs = new Map(result.userweb_configs);
      }
    } catch (error) {
      console.error('Error loading configs:', error);
    }
  }

  /**
   * Save all configs to storage
   */
  async saveAllConfigs() {
    try {
      const configsArray = Array.from(this.configs.entries());
      await chrome.storage.local.set({ userweb_configs: configsArray });
    } catch (error) {
      console.error('Error saving configs:', error);
    }
  }

  /**
   * Add or update a config
   */
  async addConfig(configId, config) {
    // Validate config
    if (!this.validateConfig(config)) {
      throw new Error('Invalid config format');
    }

    // Ensure config has required fields
    config.id = configId;
    config.enabled = config.enabled !== undefined ? config.enabled : true;

    this.configs.set(configId, config);
    await this.saveAllConfigs();
    return config;
  }

  /**
   * Get config by ID
   */
  getConfig(configId) {
    return this.configs.get(configId);
  }

  /**
   * Get all configs
   */
  getAllConfigs() {
    const configsArray = Array.from(this.configs.values());
    return Promise.resolve(configsArray);
  }

  /**
   * Get config for a specific URL
   */
  async getConfigForUrl(url) {
    try {
      const urlObj = new URL(url);
      
      for (const config of this.configs.values()) {
        if (!config.enabled) continue;
        
        if (this.matchesUrl(config, urlObj)) {
          return config;
        }
      }
      return null;
    } catch (error) {
      console.error('Error getting config for URL:', error);
      return null;
    }
  }

  /**
   * Check if URL matches config's match pattern
   */
  matchesUrl(config, urlObj) {
    if (!config.matches || !Array.isArray(config.matches)) {
      return false;
    }

    return config.matches.some(pattern => {
      return this.matchPattern(pattern, urlObj);
    });
  }

  /**
   * Match pattern matcher (simplified version of Chrome match pattern)
   */
  matchPattern(pattern, urlObj) {
    // Convert match pattern to regex
    // Supports: * for any characters, ? for single character
    // Examples: "*://example.com/*", "https://*.example.com/*"
    
    try {
      const [scheme, rest] = pattern.split('://');
      if (!rest) return false;

      const schemePattern = scheme === '*' ? '[^:]+' : scheme.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const [host, path] = rest.split('/', 2);

      let hostPattern = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                            .replace(/\\\*/g, '.*')
                            .replace(/\\\?/g, '.');
      
      const pathPattern = path ? path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                                       .replace(/\\\*/g, '.*')
                                       .replace(/\\\?/g, '.') : '.*';

      const regex = new RegExp(`^${schemePattern}://${hostPattern}/${pathPattern}$`);
      return regex.test(urlObj.href);
    } catch (error) {
      console.error('Error matching pattern:', pattern, error);
      return false;
    }
  }

  /**
   * Toggle config enabled/disabled
   */
  async toggleConfig(configId, enabled) {
    const config = this.configs.get(configId);
    if (config) {
      config.enabled = enabled;
      await this.saveAllConfigs();
    }
  }

  /**
   * Delete config
   */
  async deleteConfig(configId) {
    this.configs.delete(configId);
    await this.saveAllConfigs();
  }

  /**
   * Validate config structure
   */
  validateConfig(config) {
    if (!config || typeof config !== 'object') {
      return false;
    }

    if (!config.name || typeof config.name !== 'string') {
      return false;
    }

    if (!config.matches || !Array.isArray(config.matches) || config.matches.length === 0) {
      return false;
    }

    // At least one of js or css should be present
    if ((!config.js || !Array.isArray(config.js) || config.js.length === 0) &&
        (!config.css || !Array.isArray(config.css) || config.css.length === 0)) {
      return false;
    }

    return true;
  }

  /**
   * Parse config.json content
   */
  parseConfigJson(jsonContent, configId) {
    try {
      const config = JSON.parse(jsonContent);
      config.id = configId;
      return config;
    } catch (error) {
      throw new Error(`Invalid JSON: ${error.message}`);
    }
  }
}
