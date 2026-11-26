import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["src/protocol/generated/**", "node_modules/**"] },
  ...tseslint.configs.strict,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }]
    }
  },
  {
    // A test asserting that something exists may say so with "!"; if it does not exist, the test fails, which is
    // the point. Source code has to handle the absence instead.
    files: ["test/**"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" }
  }
);
