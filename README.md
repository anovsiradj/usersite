# UserWeb

A minimalist browser extension that injects custom JavaScript and CSS files into websites, similar to user script and user style extensions, but supporting both in one unified tool.

## Features

- **Dual Support**: Inject both JavaScript and CSS files into websites
- **Flexible Configuration**: Control where and when files are injected via `config.json`
- **Dashboard Management**: Easy-to-use dashboard to add, remove, enable, and disable configurations
- **Firefox Compatible**: Built using WebExtensions API for cross-browser compatibility
- **Minimalist Design**: Simple and clean interface focused on functionality

## Installation

### For Firefox

1. Download or clone this repository
2. Open Firefox and navigate to `about:debugging`
3. Click "This Firefox"
4. Click "Load Temporary Add-on..."
5. Select the `manifest.json` file from this directory

### For Chrome/Edge

1. Download or clone this repository
2. Open Chrome/Edge and navigate to `chrome://extensions` or `edge://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the project directory

## Usage

### Creating a Configuration

1. Create a folder for your configuration
2. Inside the folder, create a `config.json` file
3. Add your JavaScript (`.js`) and/or CSS (`.css`) files to the same folder

### Config.json Format

```json
{
  "name": "My Customization",
  "description": "Optional description",
  "matches": [
    "*://example.com/*",
    "*://*.example.com/*"
  ],
  "css": [
    {
      "path": "style.css",
      "inject": "head"
    }
  ],
  "js": [
    {
      "path": "script.js",
      "runAt": "document_end"
    }
  ],
  "enabled": true
}
```

#### Configuration Fields

- **name** (required): Name of your configuration
- **description** (optional): Description of what this configuration does
- **matches** (required): Array of URL match patterns. Supports wildcards:
  - `*` matches any characters
  - `?` matches a single character
  - Examples: `*://example.com/*`, `https://*.example.com/*`
- **css** (optional): Array of CSS files to inject
  - Can be a string (file name) or an object with:
    - `path`: File name
    - `inject`: Where to inject (`head`, `body-start`, `body-end`)
- **js** (optional): Array of JavaScript files to inject
  - Can be a string (file name) or an object with:
    - `path`: File name
    - `runAt`: When to run (`document_start`, `document_end`, `document_idle`)
- **enabled** (optional): Whether this configuration is enabled (default: `true`)

#### Injection Points

- **head**: Injects into the `<head>` tag
- **body-start**: Injects at the start of `<body>` tag
- **body-end**: Injects at the end of `<body>` tag (before closing tag)

#### Run At Options

- **document_start**: Run as soon as possible
- **document_end**: Run after DOM is ready
- **document_idle**: Run after page is fully loaded (default)

### Adding a Configuration

1. Click the UserWeb extension icon in your browser toolbar
2. Click "Add Configuration"
3. Select the folder containing your `config.json` and files
4. Review the preview and click "Save Configuration"

### Managing Configurations

- **Enable/Disable**: Use the toggle switch on each configuration card
- **Delete**: Click the "Delete" button (this action cannot be undone)
- **Reload**: Click "Reload Configs" to refresh the configuration list

## Example

See the `examples/example-config` folder for a complete example configuration.

## Development

### Project Structure

```
userweb/
├── manifest.json           # Extension manifest
├── background-simple.js    # Background script (service worker)
├── content.js              # Content script for injection
├── dashboard.html          # Dashboard UI
├── dashboard.css           # Dashboard styles
├── dashboard.js            # Dashboard logic
├── lib/                    # Library files (optional)
│   ├── config-manager.js
│   └── file-watcher.js
├── icons/                  # Extension icons (create these)
└── examples/               # Example configurations
```

### Creating Icons

You need to create icon files in the `icons/` directory:
- `icon-16.png` (16x16 pixels)
- `icon-48.png` (48x48 pixels)
- `icon-128.png` (128x128 pixels)

## Browser Compatibility

- **Firefox**: 109.0 or later (Manifest V3)
- **Chrome**: 88 or later (Manifest V3)
- **Edge**: 88 or later (Manifest V3)

## License

MIT License - feel free to use and modify as needed.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Notes

- Files are stored in the browser's local storage
- Configurations are independent and can be enabled/disabled individually
- Match patterns use a simplified wildcard matching system compatible with Chrome's match patterns
- The extension automatically reloads configurations when tabs are updated
