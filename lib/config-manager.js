// Config Manager for UserSite extension
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
      const result = await browser.storage.local.get(['usersite_configs']);
      if (result.usersite_configs) {
        this.configs = new Map(result.usersite_configs);
      }
    } catch (error) {
      console.error('Error loading configs:', error);
      throw error;
    }
  }

  /**
   * Save all configs to storage
   */
  async saveAllConfigs() {
    try {
      const configsArray = Array.from(this.configs.entries());
      await browser.storage.local.set({ usersite_configs: configsArray });
    } catch (error) {
      console.error('Error saving configs:', error);
      throw error;
    }
  }

  /**
   * Add or update a config
   */
  async addConfig(configId, config) {
    config.id = configId;
    config.enabled = config.enabled ?? true;

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
}
