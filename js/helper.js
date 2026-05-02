
globalThis.toId = function (id) {
    id = id.replace(/[^a-zA-Z0-9_]/g, '_')
    id = id.replace(/_{2,}/g, '_')
    id = id.replace(/^_/, '')
    id = id.replace(/_$/, '')
    return id;
}

globalThis.configToId = function (config) {
    let id = toId(`config_${config.name}`)
    return id
};

globalThis.sourceToId = function (config, item) {
    let id;
    if (item.file) {
        id = item.file;
    } else {
        // btoa only handles Latin-1; encode to UTF-8 bytes first for safety
        try {
            id = btoa(unescape(encodeURIComponent(item.code))).substring(0, 64);
        } catch (_) {
            id = item.code.substring(0, 64);
        }
    }
    id = `${configToId(config)}_item_${id}`;
    id = toId(id);
    return id;
};

globalThis.isFileHttp = function (file) {
    if (file.startsWith('http:') || file.startsWith('https:')) {
        return true
    }
    return false
}