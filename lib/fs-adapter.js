/**
 * File System Access API Adapter
 * Provides a virtual implementation of FileSystemHandle for browsers that don't support it natively (e.g., Firefox).
 * Allows treating standard File objects from <input type="file"> as FileSystemHandles.
 */

export class VirtualFileHandle {
	constructor(file) {
		this.kind = 'file';
		this.name = file.name;
		this._file = file;
	}

	async getFile() {
		return this._file;
	}

	isSameEntry(other) {
		return this === other;
	}
}

export class VirtualDirectoryHandle {
	constructor(name, entries = []) {
		this.kind = 'directory';
		this.name = name;
		this._entries = new Map();

		// entries should be an array of VirtualFileHandle or VirtualDirectoryHandle
		for (const entry of entries) {
			if (entry) {
				this._entries.set(entry.name, entry);
			}
		}
	}

	async getFileHandle(name, options = {}) {
		if (this._entries.has(name)) {
			const entry = this._entries.get(name);
			if (entry.kind === 'file') {
				return entry;
			}
		}

		if (options.create) {
			throw new Error("Creation not supported in virtual adapter");
		}

		throw new Error(`Entry ${name} not found`);
	}

	async getDirectoryHandle(name, options = {}) {
		if (this._entries.has(name)) {
			const entry = this._entries.get(name);
			if (entry.kind === 'directory') {
				return entry;
			}
		}

		if (options.create) {
			throw new Error("Creation not supported in virtual adapter");
		}

		throw new Error(`Entry ${name} not found`);
	}

	// Async iterator for entries
	async *entries() {
		for (const [name, handle] of this._entries) {
			yield [name, handle];
		}
	}

	// Also support values() for compatibility
	async *values() {
		for (const handle of this._entries.values()) {
			yield handle;
		}
	}

	isSameEntry(other) {
		return this === other;
	}
}

/**
 * Creates a VirtualDirectoryHandle structure from a Flat list of Files (e.g. from input[type="file" webkitdirectory])
 * @param {FileList|Array<File>} fileList 
 * @returns {VirtualDirectoryHandle}
 */
export function createHandleFromFiles(fileList) {
	const root = new VirtualDirectoryHandle('root');

	// Note: input type="file" webkitdirectory returns files with webkitRelativePath
	// e.g., "ParentFolder/sub/file.txt"

	for (let i = 0; i < fileList.length; i++) {
		const file = fileList[i];

		// If we have "Folder/file.txt", we want to just put it in the root if we assume the user picked "Folder"
		// But usually the root handle represents "Folder".
		// Let's parse strictly.

		// For simplicity in this extension's use case:
		// We mainly care about the files being accessible flatly or mimicking the structure.
		// The current dashboard.js loadFromDirectoryHandle iterates recursively.

		// Let's build the tree.
		let currentDir = root;

		// pathParts[0] is usually the root folder name if webkitRelativePath is present
		// e.g. "ConfigFolder/config.json"
		// Since we return a DirectoryHandle that represents "ConfigFolder", we should start inserting children from index 1.
		// However, if we just have "config.json" (no folders selected, just files?), webkitRelativePath might be empty.

		const parts = file.webkitRelativePath ? file.webkitRelativePath.split('/') : [file.name];

		// If it has a root folder part, skip it because 'root' handle represents it
		const startIndex = parts.length > 1 ? 1 : 0;

		for (let j = startIndex; j < parts.length - 1; j++) {
			const part = parts[j];
			if (!currentDir._entries.has(part)) {
				currentDir._entries.set(part, new VirtualDirectoryHandle(part));
			}
			const nextDir = currentDir._entries.get(part);
			if (nextDir.kind === 'directory') {
				currentDir = nextDir;
			}
		}

		const fileName = parts[parts.length - 1];
		currentDir._entries.set(fileName, new VirtualFileHandle(file));
	}

	// If the root has only one directory entry and it matches the top level folder, maybe we should return that?
	// But usually createHandleFromFiles is expected to return the handle FOR the selected folder.
	// The logic above strips the first path segment (folder name) and puts file contents INTO 'root'.
	// So 'root' IS the handle for the selected folder.

	// Update root name if possible from first file
	if (fileList.length > 0 && fileList[0].webkitRelativePath) {
		const parts = fileList[0].webkitRelativePath.split('/');
		if (parts.length > 1) {
			root.name = parts[0];
		}
	}

	return root;
}
