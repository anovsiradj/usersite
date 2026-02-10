/**
 * @link https://docs.deno.com/api/deno/~/Deno.symlink
 */

const fexe = "C:\\Program Files\\Firefox Nightly\\firefox.exe"
const root = 'firefox-web-ext'

const files = {
	'dashboard.js': null,
	'dashboard.css': null,
	'dashboard.html': null,
	'background.js': null,
	'content.js': null,
	'firefox-manifest.json': 'manifest.json',
}
const folders = {
	'js': null,
	'css': null,
	'web': null,
	'lib': null,
	'icons': null,
}

async function main() {
	Deno.mkdir(root).catch(() => console.debug(`[SKIP] ${root}`))

	for (let [k, v] of Object.entries(files)) {
		v ??= k

		try {
			await Deno.remove(`${root}/${v}`);
		} catch (error) {
			console.debug(`[SKIP] delete: ${root}/${v}`)
		}

		try {
			await Deno.copyFile(k, `${root}/${v}`)
		} catch (error) {
			console.debug(`[SKIP] create: ${root}/${v}`)
		}

	}

	for (let [k, v] of Object.entries(folders)) {
		v ??= k
		Deno.symlink(k, `${root}/${v}`, {
			type: 'junction',
		}).catch(() => console.debug(`[SKIP] ${root}/${v}`))
	}
}

main().catch(console.error);
