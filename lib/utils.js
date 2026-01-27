/**
 * Utilities for UserSite extension
 */

export function escapeHtml(text) {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

export function generateConfigId(name) {
	return name.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

export function normalizeRunAt(runAt) {
	const allowed = ['document_start', 'document_end', 'document_idle'];
	if (!runAt || typeof runAt !== 'string') {
		return 'document_idle';
	}
	if (allowed.indexOf(runAt) !== -1) {
		return runAt;
	}
	return 'document_idle';
}
