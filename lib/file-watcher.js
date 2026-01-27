// File Watcher for UserSite extension
// Handles file system operations (simplified - using File API)

export class FileWatcher {
  constructor() {
    // Note: Browser extensions have limited file system access
    // Users will need to use the dashboard to load files
  }

  /**
   * Read files from a directory using File API
   * This is called from the dashboard when user selects a folder
   */
  async readDirectory(files) {
    const configs = {};
    const fileMap = {};

    // Group files by directory structure
    for (const file of files) {
      const path = file.webkitRelativePath || file.name;
      const pathParts = path.split('/');

      if (pathParts.length > 1) {
        const dirName = pathParts[0];
        const fileName = pathParts[pathParts.length - 1];

        if (!fileMap[dirName]) {
          fileMap[dirName] = { files: [], config: null };
        }

        fileMap[dirName].files.push({ file, fileName, path });
      } else {
        // Root level file
        if (!fileMap['']) {
          fileMap[''] = { files: [], config: null };
        }
        fileMap[''].files.push({ file, fileName: file.name, path });
      }
    }

    // Read config files and process
    for (const [dirName, dirData] of Object.entries(fileMap)) {
      const configFile = dirData.files.find(f => f.fileName === 'config.json');

      if (configFile) {
        try {
          const configText = await this.readFileAsText(configFile.file);
          const config = JSON.parse(configText);
          dirData.config = config;

          // Store files for this config
          config._files = dirData.files.map(f => ({
            name: f.fileName,
            path: f.path,
            file: f.file
          }));

          configs[dirName || 'root'] = dirData.config;
        } catch (error) {
          console.error(`Error reading config.json in ${dirName}:`, error);
        }
      }
    }

    return configs;
  }

  /**
   * Read file as text
   */
  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  }

  /**
   * Read file as data URL (for storing in extension)
   */
  readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  }
}
