# UserSite

A browser extension that injects custom JS and CSS files into websites, similar to userscript and userstyle, but supporting both.

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

### Adding a Configuration

1. Click the UserSite extension icon in your browser toolbar
2. Click "Add Configuration"
3. Select the folder containing your `config.json` and files
4. Review the preview and click "Save Configuration"

### Managing Configurations

- **Enable/Disable**: Use the toggle switch on each configuration card
- **Delete**: Click the "Delete" button (this action cannot be undone)
- **Reload**: Click "Reload Configs" to refresh the configuration list

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
