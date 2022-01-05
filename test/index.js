'use strict';

process.chdir(__dirname);

const { ESLint } = require('eslint');
const { SourceCodeFixer } = require('eslint/lib/linter');
const assert = require('assert');
const fs = require('fs');

const linter = new ESLint({ reportUnusedDisableDirectives: 'error' });

async function run() {
	const tests = fs.readdirSync('samples').filter(name => name[0] !== '.');

	for (const name of tests) {
		console.log(name);

		const path_input = `samples/${name}/Input.svelte`;
		const path_fixed = `samples/${name}/Fixed.svelte`;
		const path_ple = `samples/${name}/preserve_line_endings`;
		const path_expected = `samples/${name}/expected.json`;
		const path_actual = `samples/${name}/actual.json`;

		if (process.platform === 'win32' && !exists(path_ple)) {
			const file = fs.readFileSync(path_input, 'utf-8');
			fs.writeFileSync(path_input, file.replace(/\r/g, ''));
		}

		const result = await linter.lintFiles(path_input);

		const actual = result[0] ? result[0].messages : [];
		const expected = JSON.parse(fs.readFileSync(path_expected, 'utf-8'));

		fs.writeFileSync(path_actual, JSON.stringify(actual, null, '\t'));

		assert.equal(actual.length, expected.length);
		assert.deepStrictEqual(actual, actual.map((msg, i) => ({ ...msg, ...expected[i] })));

		if (fs.existsSync(path_fixed)) {
			const fixed = SourceCodeFixer.applyFixes(fs.readFileSync(path_input, 'utf-8'), actual).output;
			assert.deepStrictEqual(fixed, fs.readFileSync(path_fixed, 'utf-8'))
		}

		console.log('passed!\n');
	}
}

function exists(path) {
	try {
		fs.accessSync(path);
		return true;
	} catch (err) {
		return false;
	}
}

run();
