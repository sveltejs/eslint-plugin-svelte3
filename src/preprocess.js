import {
  new_block,
  get_translation,
  get_template_translation,
} from "./block.js";
import { processor_options } from "./processor_options.js";
import { state } from "./state.js";
import { DocumentMapper } from "./mapping.js";
import {
  closingTagLength,
  padCodeWithMissingNodesLines,
  replaceWithWhitespaces,
} from "./utils";

let default_compiler;

// find the contextual name or names described by a particular node in the AST
const contextual_names = [];
const find_contextual_names = (compiler, node) => {
  if (node) {
    if (typeof node === "string") {
      contextual_names.push(node);
    } else if (typeof node === "object") {
      compiler.walk(node, {
        enter(node, parent, prop) {
          if (node.name && prop !== "key") {
            contextual_names.push(node.name);
          }
        },
      });
    }
  }
};

// extract scripts to lint from component definition
export const preprocess = (text) => {
  const compiler =
    processor_options.custom_compiler ||
    default_compiler ||
    (default_compiler = require("svelte/compiler"));
  if (processor_options.ignore_styles) {
    // wipe the appropriate <style> tags in the file
    text = text.replace(
      /<style(\s[^]*?)?>([^]*?)<\/style>/gi,
      (match, attributes = "", content) => {
        const attrs = {};
        attributes
          .split(/\s+/)
          .filter(Boolean)
          .forEach((attr) => {
            const p = attr.indexOf("=");
            if (p === -1) {
              attrs[attr] = true;
            } else {
              attrs[attr.slice(0, p)] = "'\"".includes(attr[p + 1])
                ? attr.slice(p + 2, -1)
                : attr.slice(p + 1);
            }
          });
        return processor_options.ignore_styles(attrs)
          ? `<style${attributes}>${content.replace(/\S/g, " ")}</style>`
          : match;
      }
    );
  }

  // get information about the component
  let result;
  try {
    result = compile_code(text, compiler, processor_options);
  } catch ({ name, message, start, end }) {
    // convert the error to a linting message, store it, and return
    state.messages = [
      {
        ruleId: name,
        severity: 2,
        message,
        line: start && start.line,
        column: start && start.column + 1,
        endLine: end && end.line,
        endColumn: end && end.column + 1,
      },
    ];
    return [];
  }
  const { ast, warnings, vars, mapper } = result;

  padCodeWithMissingNodesLines(ast, text);

  const references_and_reassignments = `{${vars
    .filter((v) => v.referenced || v.name[0] === "$")
    .map((v) => v.name)};${vars
    .filter((v) => v.reassigned || v.export_name)
    .map((v) => v.name + "=0")}}`;
  state.var_names = new Set(vars.map((v) => v.name));

  // convert warnings to linting messages
  const filtered_warnings = processor_options.ignore_warnings
    ? warnings.filter((warning) => !processor_options.ignore_warnings(warning))
    : warnings;
  state.messages = filtered_warnings.map(({ code, message, start, end }) => {
    const start_pos =
      processor_options.typescript && start
        ? mapper.get_original_position(start)
        : start && { line: start.line, column: start.column + 1 };
    const end_pos =
      processor_options.typescript && end
        ? mapper.get_original_position(end)
        : end && { line: end.line, column: end.column + 1 };
    return {
      ruleId: code,
      severity: 1,
      message,
      line: start_pos && start_pos.line,
      column: start_pos && start_pos.column,
      endLine: end_pos && end_pos.line,
      endColumn: end_pos && end_pos.column,
    };
  });

  // build strings that we can send along to ESLint to get the remaining messages

  // Things to think about:
  // - not all Svelte files may be typescript -> do we need a distinction on a file basis by analyzing the attribute + a config option to tell "treat all as TS"?
  const with_file_ending = (filename) =>
    `${filename}${processor_options.typescript ? ".ts" : ".js"}`;

  if (ast.module) {
    // block for <script context='module'>
    const block = new_block();
    state.blocks.set(with_file_ending("module"), block);

    get_translation(text, block, ast.module.content);

    if (ast.instance) {
      block.transformed_code += text.slice(
        ast.instance.content.start,
        ast.instance.content.end
      );
    }

    block.transformed_code += references_and_reassignments;
  }

  if (ast.instance) {
    // block for <script context='instance'>
    const block = new_block();
    state.blocks.set(with_file_ending("instance"), block);

    if (ast.module && processor_options.typescript) {
      block.transformed_code = vars
        .filter((v) => v.injected)
        .map((v) => `let ${v.name};`)
        .join("");
      block.transformed_code += text.slice(
        ast.module.content.start,
        ast.module.content.end
      );
    } else {
      block.transformed_code = vars
        .filter((v) => v.injected || v.module)
        .map((v) => `let ${v.name};`)
        .join("");
    }

    get_translation(text, block, ast.instance.content);

    block.transformed_code += references_and_reassignments;
  }

  if (ast.html) {
    // block for template
    const block = new_block();
    state.blocks.set(with_file_ending("template"), block);

    const htmlBlock = new_block();

    htmlBlock.transformed_code += "(";

    if (processor_options.typescript) {
      block.transformed_code = "";
      if (ast.module) {
        block.transformed_code += text.slice(
          ast.module.content.start,
          ast.module.content.end
        );
      }
      if (ast.instance) {
        block.transformed_code += "\n";
        block.transformed_code += vars
          .filter((v) => v.injected)
          .map((v) => `let ${v.name};`)
          .join("");
        block.transformed_code += text.slice(
          ast.instance.content.start,
          ast.instance.content.end
        );
      }
    } else {
      block.transformed_code = vars.map((v) => `let ${v.name};`).join("");
    }

    const nodes_with_contextual_scope = new WeakSet();
    let in_quoted_attribute = false;
    compiler.walk(ast.html, {
      enter(node, parent, prop) {
        if (prop === "expression") {
          return this.skip();
        } else if (
          prop === "attributes" &&
          "'\"".includes(text[node.end - 1])
        ) {
          in_quoted_attribute = true;
        }
        contextual_names.length = 0;
        find_contextual_names(compiler, node.context);
        if (node.type === "EachBlock") {
          find_contextual_names(compiler, node.index);
        } else if (node.type === "ThenBlock") {
          find_contextual_names(compiler, parent.value);
        } else if (node.type === "CatchBlock") {
          find_contextual_names(compiler, parent.error);
        } else if (node.type === "Element" || node.type === "InlineComponent") {
          node.attributes.forEach(
            (node) =>
              node.type === "Let" &&
              find_contextual_names(compiler, node.expression || node.name)
          );
        }
        if (contextual_names.length) {
          nodes_with_contextual_scope.add(node);
          block.transformed_code += `{let ${contextual_names
            .map((name) => `${name}=0`)
            .join(",")};`;
        }
        if (node.expression && typeof node.expression === "object") {
          // add the expression in question to the constructed string
          block.transformed_code += "(";
          get_translation(text, block, node.expression, {
            template: true,
            in_quoted_attribute,
          });
          block.transformed_code += ");";
        }

        switch (node.type) {
          case "InlineComponent":
          case "Title":
          case "Element": {
            htmlBlock.transformed_code += `<${
              node.name && node.name.replace(":", "-")
            }`;
            if (node.attributes && node.attributes.length) {
              htmlBlock.transformed_code += text.slice(
                node.start + 1 + node.name.length,
                node.attributes[0].start
              );
              htmlBlock.transformed_code += node.attributes
                .map((attr, i) => {
                  function getString() {
                    switch (attr.type) {
                      case "EventHandler": {
                        return `on${attr.name}${
                          attr.modifiers.join("") || ""
                        }="${replaceWithWhitespaces(text, attr.expression)}"`;
                      }
                      case "Class":
                      case "Binding":
                      case "Action":
                      case "Spread":
                      case "Animation":
                      case "Let":
                      case "Transition": {
                        return `data-${attr.type.toLowerCase()}-${
                          attr.name || ""
                        }="${replaceWithWhitespaces(text, attr.expression)}"`;
                      }
                      case "Attribute": {
                        if (
                          attr.value &&
                          attr.value.length &&
                          attr.value[0].type !== "Text"
                        ) {
                          return attr.name;
                        }
                        return `${text.slice(attr.start, attr.end)}`;
                      }
                      default: {
                        console.log(attr.type);
                      }
                    }
                  }
                  let str = getString();
                  if (i + 1 < node.attributes.length) {
                    str += text.slice(attr.end, node.attributes[i + 1].start);
                  }
                  return str;
                })
                .join("");
            }
            htmlBlock.transformed_code += ">";
            break;
          }
          case "Comment":
          case "Text": {
            if (parent.type === "Attribute") {
              break;
            }
            htmlBlock.transformed_code +=
              node.raw || replaceWithWhitespaces(text, node);
            break;
          }
          case "Slot":
          case "MustacheTag": {
            htmlBlock.transformed_code += replaceWithWhitespaces(text, node);
            break;
          }
          case "EachBlock": {
            // {#each} -> <each>
            htmlBlock.transformed_code += `<${
              node.name || node.type.toLowerCase().replace("block", "")
            }>`;
            if (node.children && node.children.length) {
              let eachEndsAt = node.children[0].start - 1;

              while (text[eachEndsAt] && text[eachEndsAt] !== "}") {
                eachEndsAt--;
              }

              if (text[eachEndsAt] === "}") {
                htmlBlock.transformed_code += text.slice(
                  eachEndsAt + 1,
                  node.children[0].start
                );
              }
            }
            break;
          }

          case "ElseBlock":
          case "ThenBlock":
          case "CatchBlock": {
            if (node.children && node.children.length) {
              let child = node.children[0];
              if (
                child.type === "IfBlock" &&
                child.children &&
                child.children.length
              ) {
                child = child.children[0];
              }
              htmlBlock.transformed_code += text.slice(node.start, child.start);
            }
            htmlBlock.transformed_code += `<${
              (node.name && node.name.replace(":", "-")) ||
              node.type.toLowerCase().replace("block", "")
            }/>`;
            if (node.children && node.children.length) {
              if (node.expression) {
                htmlBlock.transformed_code += text.slice(
                  node.expression.end + 1,
                  node.children[0].start
                );
              } else {
                htmlBlock.transformed_code += text.slice(
                  node.children[node.children.length - 1].end,
                  node.end
                );
              }
            }
            break;
          }
          case "Head":
          case "Options":
          case "IfBlock":
          case "AwaitBlock": {
            // {#if} -> <if>
            htmlBlock.transformed_code += `<${
              (node.name && node.name.replace(":", "-")) ||
              node.type.toLowerCase().replace("block", "")
            }>`;
            if (node.expression && node.children && node.children.length) {
              htmlBlock.transformed_code += text.slice(
                node.expression.end + 1,
                node.children[0].start
              );
            }
            break;
          }
          case "Fragment": {
            htmlBlock.transformed_code += "<>";
            break;
          }
          case "PendingBlock":
          case "ArrayPattern":
          case "EventHandler":
          case "Binding":
          case "Class":
          case "Attribute":
          case "Identifier": {
            break;
          }
          default: {
            // console.log(node.type)
          }
        }
      },
      leave(node, parent, prop) {
        if (prop === "attributes") {
          in_quoted_attribute = false;
        }
        // close contextual scope
        if (nodes_with_contextual_scope.has(node)) {
          block.transformed_code += "}";
        }

        switch (node.type) {
          case "Head":
          case "Options":
          case "EachBlock":
          case "IfBlock":
          case "AwaitBlock": {
            if (node.children && node.children.length) {
              let sliceFrom = node.children[node.children.length - 1].end;

              if (node.else) {
                sliceFrom = node.else.end;
              }
              htmlBlock.transformed_code += text.slice(
                sliceFrom,
                node.end - closingTagLength[node.type]
              );
            }
            htmlBlock.transformed_code += `</${
              (node.name && node.name.replace(":", "-")) ||
              node.type.toLowerCase().replace("block", "")
            }>`;
            break;
          }
          case "InlineComponent":
          case "Title":
          case "Element": {
            htmlBlock.transformed_code += `</${
              (node.name && node.name.replace(":", "-")) ||
              node.type.toLowerCase().replace("block", "")
            }>`;
            break;
          }
          case "Fragment": {
            htmlBlock.transformed_code += "</>";
            break;
          }
          case "ElseBlock":
          case "ThenBlock":
          case "CatchBlock": {
            if (node.children && node.children.length) {
              htmlBlock.transformed_code += text.slice(
                node.children[node.children.length - 1].end,
                node.end
              );
            }
            break;
          }
        }
      },
    });

    htmlBlock.transformed_code += ");";

    if (htmlBlock.transformed_code.match(/\(<>(\s+)?<\/>\);/gm)) {
      htmlBlock.transformed_code = "";
    }
    if (htmlBlock.transformed_code) {
      state.blocks.set(
        `svelte${processor_options.typescript ? ".t" : ".j"}sx`,
        htmlBlock
      );
    }
    get_template_translation(text, htmlBlock, ast);

    block.transformed_code += `{${vars
      .filter((v) => v.referenced_from_script || v.name[0] === "$")
      .map((v) => v.name)}}`;
  }

  // return processed string
  return [...state.blocks].map(([filename, { transformed_code: text }]) =>
    processor_options.named_blocks ? { text, filename } : text
  );
};

// https://github.com/sveltejs/svelte-preprocess/blob/main/src/transformers/typescript.ts
// TypeScript transformer for preserving imports correctly when preprocessing TypeScript files
const ts_import_transformer = (context) => {
  const ts = processor_options.typescript;
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      if (node.importClause && node.importClause.isTypeOnly) {
        return ts.createEmptyStatement();
      }

      return ts.createImportDeclaration(
        node.decorators,
        node.modifiers,
        node.importClause,
        node.moduleSpecifier
      );
    }

    return ts.visitEachChild(node, (child) => visit(child), context);
  };

  return (node) => ts.visitNode(node, visit);
};

// How it works for JS:
// 1. compile code
// 2. return ast/vars/warnings
// How it works for TS:
// 1. transpile script contents from TS to JS
// 2. compile result to get Svelte compiler warnings and variables
// 3. provide a mapper to map those warnings back to its original positions
// 4. blank script contents
// 5. parse the source to get the AST
// 6. return AST of step 5, warnings and vars of step 2
function compile_code(text, compiler, processor_options) {
  const ts = processor_options.typescript;
  if (!ts) {
    return compiler.compile(text, {
      generate: false,
      ...processor_options.compiler_options,
    });
  } else {
    const diffs = [];
    let accumulated_diff = 0;
    const transpiled = text.replace(
      /<script(\s[^]*?)?>([^]*?)<\/script>/gi,
      (match, attributes = "", content) => {
        const output = ts.transpileModule(content, {
          reportDiagnostics: false,
          compilerOptions: {
            target: ts.ScriptTarget.ESNext,
            importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Preserve,
            sourceMap: true,
          },
          transformers: {
            before: [ts_import_transformer],
          },
        });
        const original_start = text.indexOf(content);
        const generated_start = accumulated_diff + original_start;
        accumulated_diff += output.outputText.length - content.length;
        diffs.push({
          original_start: original_start,
          generated_start: generated_start,
          generated_end: generated_start + output.outputText.length,
          diff: output.outputText.length - content.length,
          original_content: content,
          generated_content: output.outputText,
          map: output.sourceMapText,
        });
        return `<script${attributes}>${output.outputText}</script>`;
      }
    );
    const mapper = new DocumentMapper(text, transpiled, diffs);

    let ts_result;
    try {
      ts_result = compiler.compile(transpiled, {
        generate: false,
        ...processor_options.compiler_options,
      });
    } catch (err) {
      // remap the error to be in the correct spot and rethrow it
      err.start = mapper.get_original_position(err.start);
      err.end = mapper.get_original_position(err.end);
      throw err;
    }

    text = text.replace(
      /<script(\s[^]*?)?>([^]*?)<\/script>/gi,
      (match, attributes = "", content) => {
        return `<script${attributes}>${content
          // blank out the content
          .replace(/[^\n]/g, " ")
          // excess blank space can make the svelte parser very slow (sec->min). break it up with comments (works in style/script)
          .replace(/[^\n][^\n][^\n][^\n]\n/g, "/**/\n")}</script>`;
      }
    );
    // if we do a full recompile Svelte can fail due to the blank script tag not declaring anything
    // so instead we just parse for the AST (which is likely faster, anyways)
    const ast = compiler.parse(text, { ...processor_options.compiler_options });
    const { warnings, vars } = ts_result;
    return { ast, warnings, vars, mapper };
  }
}
