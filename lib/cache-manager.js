/**
 * Cache Manager for UserSite extension
 * Uses Origin Private File System (OPFS) to cache CDN assets
 */

export class CacheManager {
	constructor() {
		this.root = null;
	}

	async init() {
		if (this.root) return this.root;
		if (navigator.storage && navigator.storage.getDirectory) {
			this.root = await navigator.storage.getDirectory();
			return this.root;
		}
		throw new Error('OPFS (Origin Private File System) not supported in this environment');
	}

	/**
	 * Get a directory handle for a specific config
	 */
	async getConfigDir(configId) {
		const root = await this.init();
		// Sanitize configId to be safe for directory names
		const sanitizedId = configId.replace(/[^a-zA-Z0-9_-]/g, '_');
		return await root.getDirectoryHandle(sanitizedId, { create: true });
	}

	/**
	 * Sanitize URL for use as a filename
	 */
	getCacheFileName(url) {
		// Generate a simple hash-like filename from URL
		// Or just sanitize it. Using hash is safer for long/complex URLs.
		let hash = 0;
		for (let i = 0; i < url.length; i++) {
			const char = url.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		return `cdn_${Math.abs(hash).toString(36)}`;
	}

	/**
	 * Fetch and cache a CDN asset
	 */
	async cacheUrl(configId, url, onProgress) {
		const fileName = this.getCacheFileName(url);
		const dir = await this.getConfigDir(configId);

		// Check if already cached (optional, but good for efficiency)
		try {
			// await dir.getFileHandle(fileName);
			// return; // Skip if exists? User might want to force refresh on rescan.
		} catch (e) {}

		const response = await fetch(url);
		if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`);

		const contentLength = response.headers.get('content-length');
		let total = 0;
		if (contentLength) total = parseInt(contentLength, 10);

		const reader = response.body.getReader();
		const chunks = [];
		let received = 0;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
			received += value.length;
			if (onProgress && total > 0) {
				onProgress(Math.round((received / total) * 100));
			}
		}

		const blob = new Blob(chunks);
		const fileHandle = await dir.getFileHandle(fileName, { create: true });
		const writable = await fileHandle.createWritable();
		await writable.write(blob);
		await writable.close();

		return fileName;
	}

	/**
	 * Get cached content from OPFS
	 */
	async getCachedContent(configId, url) {
		const fileName = this.getCacheFileName(url);
		const dir = await this.getConfigDir(configId);
		try {
			const fileHandle = await dir.getFileHandle(fileName);
			const file = await fileHandle.getFile();
			return await file.text();
		} catch (e) {
			return null;
		}
	}

	/**
	 * Clear cache for a config
	 */
	async clearConfigCache(configId) {
		const root = await this.init();
		const sanitizedId = configId.replace(/[^a-zA-Z0-9_-]/g, '_');
		try {
			await root.removeEntry(sanitizedId, { recursive: true });
		} catch (e) {
			// Ignore if doesn't exist
		}
	}

	/**
	 * Check if a string is a URL
	 */
	isUrl(str) {
		try {
			const url = new URL(str);
			return url.protocol === 'http:' || url.protocol === 'https:';
		} catch (e) {
			return false;
		}
	}
}
