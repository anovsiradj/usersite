/**
 * Storage Helper for UserSite extension
 * Manages IndexedDB for directory handles and file reading helpers
 */

export async function openDb() {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open('usersite_fs', 1);
		req.onupgradeneeded = (e) => {
			const db = e.target.result;
			if (!db.objectStoreNames.contains('handles')) {
				db.createObjectStore('handles');
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export async function saveHandle(configId, handle) {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction('handles', 'readwrite');
		tx.objectStore('handles').put(handle, configId);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function getHandle(configId) {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction('handles', 'readonly');
		const req = tx.objectStore('handles').get(configId);
		req.onsuccess = () => resolve(req.result || null);
		req.onerror = () => reject(req.error);
	});
}

export async function listHandles() {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction('handles', 'readonly');
		const store = tx.objectStore('handles');
		const req = store.openCursor();
		const entries = [];
		req.onsuccess = (e) => {
			const cursor = e.target.result;
			if (cursor) {
				entries.push({ configId: cursor.key, handle: cursor.value });
				cursor.continue();
			} else {
				resolve(entries);
			}
		};
		req.onerror = () => reject(req.error);
	});
}

export async function deleteHandle(configId) {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction('handles', 'readwrite');
		tx.objectStore('handles').delete(configId);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function readFileHandleAsDataURL(fileHandle) {
	const file = await fileHandle.getFile();
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = (e) => resolve(e.target.result);
		reader.onerror = (e) => reject(e);
		reader.readAsDataURL(file);
	});
}

export async function readFileHandleAsText(fileHandle) {
	const file = await fileHandle.getFile();
	return file.text();
}
