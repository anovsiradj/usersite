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

	for (let i = 0; i < fileList.length; i++) {
		const file = fileList[i];
		let currentDir = root;

		// webkitRelativePath is "FolderName/sub/file.txt" — skip the root folder segment
		// since 'root' represents it. Fall back to flat name if no relative path.
		const parts = file.webkitRelativePath ? file.webkitRelativePath.split('/') : [file.name];
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

	// Set root name to the selected folder name if available
	if (fileList.length > 0 && fileList[0].webkitRelativePath) {
		const parts = fileList[0].webkitRelativePath.split('/');
		if (parts.length > 1) {
			root.name = parts[0];
		}
	}

	return root;
}
