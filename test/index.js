'use strict';

process.chdir(__dirname);

const { ESLint } = require('eslint');
const assert = require('assert');
const fs = require('fs/promises');

const linter = new ESLint({ reportUnusedDisableDirectives: "error" });

async function run() {
	const tests = (await fs.readdir('samples')).filter(name => name[0] !== '.');

	for (const name of tests) {
		console.log(name);

		const path_input = `samples/${name}/Input.svelte`;
		const path_ple = `samples/${name}/preserve_line_endings`;
		const path_expected = `samples/${name}/expected.json`;
		const path_actual = `samples/${name}/actual.json`;

		if (process.platform === 'win32' && !(await exists(path_ple))) {
			const file = await fs.readFile(path_input, "utf-8");
			await fs.writeFile(path_input, file.replace(/\r/g, ''));
		}

		const result = await linter.lintFiles(path_input);

		const actual = result[0] ? result[0].messages : [];
		const expected = JSON.parse(await fs.readFile(path_expected, "utf-8"));

		await fs.writeFile(path_actual, JSON.stringify(actual, null, '\t'));

		assert.equal(actual.length, expected.length);
		assert.deepStrictEqual(actual, actual.map((msg, i) => ({ ...msg, ...expected[i] })));
		console.log('passed!\n');
	}
}

async function exists(path) {
	try {
		await fs.access(path);
		return true;
	} catch (err) {
		return false;
	}
}

run();
