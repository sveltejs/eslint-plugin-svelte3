const headings = ["h1", "h2", "h3", "h4", "h5", "h6"];
const errorMessage =
  "Headings must have content and the content must be accessible by a screen reader.";

module.exports = {
  rules: {
    "html-example": (context, _) => ({
      "*": (node) => {
        if (!node.openingElement) {
          return;
        }
        if (!node.openingElement.name) {
          return;
        }
        // Check 'h*' elements
        if (!headings.includes(node.openingElement.name.name)) {
          return;
        }
        // Check 'h*' elements
        if (!node.children.length) {
          context.report({
            node,
            message: errorMessage,
          });
        }

        if (
          node.openingElement.attributes.find(
            (a) => a.name.name === "data-error-out"
          )
        ) {
          context.report({
            node,
            message: "I am asked to error out...",
          });
        }
      },
    }),
  },
};
