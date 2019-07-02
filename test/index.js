'use strict';

process.chdir(__dirname);

const { CLIEngine } = require('eslint');
const assert = require('assert');
const fs = require('fs');

fs.copyFileSync('../index.js', 'node_modules/eslint-plugin-svelte3.js');

const cli = new CLIEngine();

for (const dirent of fs.readdirSync('samples', { withFileTypes: true })) {
	if (dirent.isDirectory()) {
		const { name } = dirent;
		console.log(name);
		const actual_messages = cli.executeOnFiles([`samples/${name}/Input.svelte`]).results[0].messages;
		fs.writeFileSync(`samples/${name}/actual.json`, JSON.stringify(actual_messages, null, '\t'));
		const expected_messages = JSON.parse(fs.readFileSync(`samples/${name}/expected.json`).toString());
		assert.equal(actual_messages.length, expected_messages.length);
		assert.deepStrictEqual(actual_messages, actual_messages.map((message, i) => ({ ...message, ...expected_messages[i] })));
		console.log('passed!\n');
	}
}
