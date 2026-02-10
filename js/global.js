
String.prototype.isUrl = function () {
	try {
		const url = new URL(this);
		return (url.protocol === 'http:' || url.protocol === 'https:');
	} catch {
		return false;
	}
};
