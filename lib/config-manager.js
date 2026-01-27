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
