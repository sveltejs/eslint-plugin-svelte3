'use strict';

process.chdir(__dirname);

const { CLIEngine } = require('eslint');
const assert = require('assert');
const fs = require('fs');

fs.copyFileSync('../index.js', '../node_modules/eslint-plugin-svelte3.js');

const cli = new CLIEngine({ reportUnusedDisableDirectives: true });

for (const name of fs.readdirSync('samples')) {
	if (name[0] !== '.') {
		console.log(name);
		if (process.platform === 'win32' && !fs.existsSync(`samples/${name}/preserve_line_endings`)) {
			fs.writeFileSync(`samples/${name}/Input.svelte`, fs.readFileSync(`samples/${name}/Input.svelte`).toString().replace(/\r/g, ''));
		}
		const actual_messages = cli.executeOnFiles([`samples/${name}/Input.svelte`]).results[0].messages;
		fs.writeFileSync(`samples/${name}/actual.json`, JSON.stringify(actual_messages, null, '\t'));
		const expected_messages = JSON.parse(fs.readFileSync(`samples/${name}/expected.json`).toString());
		assert.equal(actual_messages.length, expected_messages.length);
		assert.deepStrictEqual(actual_messages, actual_messages.map((message, i) => ({ ...message, ...expected_messages[i] })));
		console.log('passed!\n');
	}
}
