"use strict";

require("eslint/lib/linter");
const svelte3 = require("eslint-plugin-svelte3").processors.svelte3;

process.chdir(__dirname);

const { CLIEngine } = require("eslint");
const assert = require("assert");
const fs = require("fs");

const cli = new CLIEngine({ reportUnusedDisableDirectives: true });

function checkPreprocessOutput(name, text) {
  const preprocessed = svelte3.preprocess(text);
  let expectedPreprocessorOutput;

  preprocessed.forEach((codeText, i) => {
    const filename = preprocessed[i].filename || `svelte${i}.tsx`;
    const filepath = `samples/${name}/${filename}`;

    if (!fs.existsSync(filepath) || process.env.OVERWRITE_SNAPSHOTS) {
      console.log(`Overwriting ${filepath} snapshot`);
      fs.writeFileSync(filepath, preprocessed[i].text || preprocessed[i]);
    }

    expectedPreprocessorOutput = fs.readFileSync(filepath).toString();

    console.log(`Checking ${filepath}...`);

    assert.strictEqual(
      preprocessed[i].text || preprocessed[i],
      expectedPreprocessorOutput,
      `${name}: ${filename}`
    );
  });

  svelte3.postprocess([]);
}

function jsonify(val) {
  return JSON.parse(JSON.stringify(val));
}

for (const name of fs.readdirSync("samples")) {
  if (name[0] !== ".") {
    console.log(name);
    if (
      process.platform === "win32" &&
      !fs.existsSync(`samples/${name}/preserve_line_endings`)
    ) {
      fs.writeFileSync(
        `samples/${name}/Input.svelte`,
        fs
          .readFileSync(`samples/${name}/Input.svelte`)
          .toString()
          .replace(/\r/g, "")
      );
    }
    const result = cli.executeOnFiles([`samples/${name}/Input.svelte`]);
    const actual_messages = Object.values(
      result.results[0].messages.reduce(
        (mem, m) => Object.assign(mem, { [JSON.stringify(m)]: m }),
        {}
      )
    );
    fs.writeFileSync(
      `samples/${name}/actual.json`,
      JSON.stringify(actual_messages, null, "\t")
    );
    if (result.results[0].source) {
      checkPreprocessOutput(name, result.results[0].source);
    }
    const filepath = `samples/${name}/expected.json`;
    if (!fs.existsSync(filepath) || process.env.OVERWRITE_SNAPSHOTS) {
      console.log(`Overwriting ${filepath} snapshot`);
      fs.writeFileSync(filepath, JSON.stringify(actual_messages, null, "\t"));
    }
    const expected_messages = JSON.parse(fs.readFileSync(filepath).toString());
    assert.deepStrictEqual(
      jsonify(actual_messages),
      jsonify(expected_messages),
      name
    );
    console.log("passed!\n");
  }
}
