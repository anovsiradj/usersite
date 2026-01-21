# Quick Start Guide

## Installation Steps

1. **Create icon files**: 
   - Go to the `icons/` directory
   - Create three PNG files: `icon-16.png`, `icon-48.png`, and `icon-128.png`
   - You can use any simple icons for testing (16x16, 48x48, and 128x128 pixels)

2. **Load the extension**:
   
   **For Firefox:**
   - Open Firefox
   - Navigate to `about:debugging`
   - Click "This Firefox"
   - Click "Load Temporary Add-on..."
   - Select the `manifest.json` file from this project

   **For Chrome/Edge:**
   - Open Chrome or Edge
   - Navigate to `chrome://extensions` or `edge://extensions`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the project directory

3. **Create your first configuration**:
   - Create a folder (e.g., `my-custom-script/`)
   - Add a `config.json` file (see example below)
   - Add your `.js` and/or `.css` files
   - Click the UserWeb extension icon
   - Click "Add Configuration"
   - Select your folder

## Example Config.json

```json
{
  "name": "My Custom Script",
  "matches": ["*://example.com/*"],
  "css": [
    {
      "path": "style.css",
      "inject": "head"
    }
  ],
  "js": [
    {
      "path": "script.js",
      "runAt": "document_idle"
    }
  ]
}
```

## Folder Structure Example

```
my-custom-script/
├── config.json
├── script.js
└── style.css
```

That's it! Your scripts and styles will now be injected on matching websites.
