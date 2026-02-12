# Quick Start Guide

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

## Installation Steps

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
   - Click the UserSite extension icon
   - Click "Add Configuration"
   - Select your folder

## Example Config.json

```json
{
  "name": "My Custom Script",
  "matches": ["*://example.com/*"],
  "css": [
    {
      "file": "style.css",
      "injectAt": "head"
    }
  ],
  "js": [
    {
      "file": "script.js",
      "runAt": "document_idle"
    },
    {
      "code": "console.log('Inline script running!');",
      "runAt": "document_end"
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
