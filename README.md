# UserSite

A browser extension that injects custom JS and CSS files into websites, with optional jQuery injection, similar to user script and user style extensions, but supporting all in one unified tool.

## Features

- **Dual Support**: Inject both JS and CSS files into websites
- **Flexible Configuration**: Control where and when files are injected via `config.json`
- **Dashboard Management**: Easy-to-use dashboard to add, remove, enable, and disable configurations
- **Cross-browser**: Built using WebExtensions API

## Installation

### For Firefox

1. clone this repository
2. Open Firefox and navigate to `about:debugging`
3. Click "This Firefox"
4. Click "Load Temporary Add-on..."
5. Select the `manifest.json` file from this directory

### For Chrome (including its variants)

1. clone this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the project directory

## Usage

### Creating a Configuration

1. Create a folder for your configuration
2. Inside the folder, create a `config.json` file
3. Add your JS (`.js`) and/or CSS (`.css`) files to the same folder

### config.json format

see `./examples/example/config.json` for complete example.

#### Configuration Fields

- **name** (required): Name of your configuration
- **description** (optional): Description of what this configuration does
- **matches** (required): Array of URL match patterns. Supports wildcards:
  - `*` matches any characters
  - `?` matches a single character
  - Examples: `*://example.com/*`, `https://*.example.com/*`
- **css** (optional): Array of CSS files to inject
  - Can be a string (file name) or an object with:
    - `file`: File name
    - `injectAt`: Where to inject (`head`, `body_start`, `body_end`)
- **js** (optional): Array of JS files to inject
  - Can be a string (file name) or an object with:
    - `file`: File name
    - `code`: Inline JavaScript code to execute
    - `runAt`: When to run (`document_start`, `document_end`, `document_idle`)
    - `world`: Execution world (`MAIN` or `ISOLATED`, default: `MAIN`)
- **cssDefault** (optional): Object with default values for all CSS items (e.g., `{"injectAt": "body_end"}`)
- **jsDefault** (optional): Object with default values for all JS items (e.g., `{"runAt": "document_start", "world": "MAIN"}`)
- **enabled** (optional): Whether this configuration is enabled (default: `true`)

#### CSS Injection Points

- **head**: Injects into the `<head>` tag
- **body_start**: Injects at the start of `<body>` tag
- **body_end**: Injects at the end of `<body>` tag (before closing tag)

#### JS Run At Options

- **document_start**: Run as soon as possible
- **document_end**: Run after DOM is ready
- **document_idle**: Run after page is fully loaded (default)

### Adding a Configuration

1. Click the UserSite extension icon in your browser toolbar
2. Click "Add Configuration"
3. Select the folder containing your `config.json` and files
4. Review the preview and click "Save Configuration"

### Managing Configurations

- **Enable/Disable**: Use the toggle switch on each configuration card
- **Delete**: Click the "Delete" button (this action cannot be undone)
- **Reload**: Click "Reload Configs" to refresh the configuration list

## Browser Compatibility

- **Firefox**: 109.0 or later (Manifest V3)
- **Chrome (including its variants)**: 88 or later (Manifest V3)

## development

see `./deno.json` for more information.

## License

see `./LICENSE.txt` for more information.

## Contributing

contributions are welcome! Please feel free to submit issues or pull requests.

## Notes

- Files are stored in the browser's local storage
- Configurations are independent and can be enabled/disabled individually
- Match patterns use a simplified wildcard matching system compatible with Chrome's match patterns
- The extension automatically reloads configurations when tabs are updated
