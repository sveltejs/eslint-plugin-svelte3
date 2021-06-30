// get the total length, number of lines, and length of the last line of a string
export const get_offsets = (str) => {
  const { length } = str;
  let lines = 1;
  let last = 0;
  for (let i = 0; i < length; i++) {
    if (str[i] === "\n") {
      lines++;
      last = 0;
    } else {
      last++;
    }
  }
  return { length, lines, last };
};

// dedent a script block, and get offsets necessary to later adjust linting messages about the block
export const dedent_code = (str) => {
  let indentation = "";
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === "\n" || char === "\r") {
      indentation = "";
    } else if (char === " " || char === "\t") {
      indentation += str[i];
    } else {
      break;
    }
  }
  const { length } = indentation;
  let dedented = "";
  const offsets = [];
  const total_offsets = [0];
  for (let i = 0; i < str.length; i++) {
    if (i === 0 || str[i - 1] === "\n") {
      if (str.slice(i, i + length) === indentation) {
        i += length;
        offsets.push(length);
      } else {
        offsets.push(0);
      }
      total_offsets.push(
        total_offsets[total_offsets.length - 1] + offsets[offsets.length - 1]
      );
      if (i >= str.length) {
        break;
      }
    }
    dedented += str[i];
  }
  return { dedented, offsets: { offsets, total_offsets } };
};

// get character offsets of each line in a string
export const get_line_offsets = (str) => {
  const offsets = [-1];
  for (let i = 0; i < str.length; i++) {
    if (str[i] === "\n") {
      offsets.push(i);
    }
  }
  return offsets;
};

export const pad = (times) => {
  return Array.from({ length: times }, () => "\n").join("");
};

export const closingTagLength = new Proxy(
  {
    Head: 14,
    Options: 17
  },
  {
    get(source, name) {
      return source[name] || name.length - 2;
    },
  }
);

export function getInjectOrder(asts) {
  return asts.sort((a, b) => a.start - b.start);
}

export function findGaps(nodes, text) {
  return nodes.reduce((mem, c, i, a) => {
    if (a[i - 1]) {
      if (a[i - 1].end !== c.start) {
        c.inject = "before";
      }
    } else {
      if (c.start) {
        c.inject = "before";
      }
    }
    if (a[i + 1]) {
      if (a[i + 1].start !== c.end) {
        c.inject = "after";
      }
    } else {
      if (c.end !== text.length - 1) {
        c.inject = "before";
      }
    }
    if (c.inject && !mem.includes(a[i - 1]) && !mem.includes(a[i + 1])) {
      mem.push(c);
    }
    return mem;
  }, []);
}

export function padCodeWithMissingNodesLines(ast, text) {
  if (!ast.html || !ast.html.children || !ast.html.children.length) {
    return;
  }
  if (!ast.instance && !ast.module && !ast.css) {
    return;
  }
  const injectOrder = getInjectOrder([ast.instance, ast.module, ast.css].filter(_ => _));
  // pad html block so we map 1<->1

  const textNodes = findGaps(ast.html.children, text);
  injectOrder.forEach((node, i) => {
    let textNode = textNodes[i] || textNodes[textNodes.length - 1];

    if (textNode.inject === "after") {
      textNode.raw += pad(
          get_offsets(text.slice(node.start, node.end)).lines - 1
      );
    }

    if (textNode.inject === "before") {
      textNode.raw =
          pad(get_offsets(text.slice(node.start, node.end)).lines - 1) +
          textNode.raw;
    }
  });
}

export function replaceWithWhitespaces(text, node) {
  if (!text || !node) {
    return '';
  }
  const sliced = text.slice(
      node.start,
      node.end
  );
  let result = '';
  for (let i = 0; i < sliced.length; i++) {
    const matches = sliced[i].match(/\s/);
    if (matches) {
      result += matches[0]
    } else {
      result += ' '
    }
  }
  return result;
}
