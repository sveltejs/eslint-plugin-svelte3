import { get_offsets, dedent_code } from "./utils.js";

// return a new block
export const new_block = () => ({
  transformed_code: "",
  line_offsets: null,
  translations: new Map(),
});

// get translation info and include the processed scripts in this block's transformed_code
export const get_translation = (text, block, node, options = {}) => {
  block.transformed_code += "\n";
  const translation = {
    options,
    unoffsets: get_offsets(block.transformed_code),
  };
  translation.range = [node.start, node.end];
  const { dedented, offsets } = dedent_code(text.slice(node.start, node.end));
  block.transformed_code += dedented;
  translation.offsets = get_offsets(text.slice(0, node.start));
  translation.dedent = offsets;
  translation.end = get_offsets(block.transformed_code).lines;
  for (let i = translation.unoffsets.lines; i <= translation.end; i++) {
    block.translations.set(i, translation);
  }
  block.transformed_code += "\n";
};

const nullProxy = new Proxy(
    {},
    {
      get(target, p, receiver) {
        return 0;
      },
    }
)

export const get_template_translation = (text, block, ast) => {
  const codeOffsets = get_offsets(text);

  const translation = {
    options: {},
    start: 0,
    end: codeOffsets.lines,
    unoffsets: { length: 0, lines: 1, last: 0 },
    dedent: {
      offsets: nullProxy,
      total_offsets: nullProxy,
    },
    offsets: { length: 0, lines: 1, last: 0 },
    range: [0, text.length - 1]
  };

  for (let i = translation.start; i <= translation.end; i++) {
    translation.options.template = i > 0;
    block.translations.set(i, translation);
  }
};
