import { preprocess } from "./preprocess.js";
import { postprocess } from "./postprocess.js";

export default {
  processors: { svelte3: { preprocess, postprocess, supportsAutofix: true } },
  configs: {
    defaultWithJsx: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      overrides: [
        {
          files: ["**/*.{tsx,jsx}"],
        },
      ],
    },
  },
};
