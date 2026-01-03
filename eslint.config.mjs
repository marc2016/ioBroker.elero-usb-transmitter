
import typescriptParser from "@typescript-eslint/parser";
import typescriptPlugin from "@typescript-eslint/eslint-plugin";
import prettierPlugin from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";

export default [
    {
        ignores: ["build/**", "node_modules/**", "dist/**", "test/**", "**/*.js"],
    },
    {
        files: ["src/**/*.ts"],
        languageOptions: {
            parser: typescriptParser,
            parserOptions: {
                ecmaVersion: 2018,
                sourceType: "module",
                project: "./tsconfig.json",
            },
        },
        plugins: {
            "@typescript-eslint": typescriptPlugin,
            prettier: prettierPlugin,
        },
        rules: {
            ...typescriptPlugin.configs.recommended.rules,
            ...prettierConfig.rules,
            "prettier/prettier": "error",

            // Original rules
            "@typescript-eslint/no-parameter-properties": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-use-before-define": [
                "error",
                {
                    functions: false,
                    typedefs: false,
                    classes: false,
                },
            ],
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    ignoreRestSiblings: true,
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_"
                },
            ],
            "@typescript-eslint/explicit-function-return-type": [
                "warn",
                {
                    allowExpressions: true,
                    allowTypedFunctionExpressions: true,
                },
            ],
            // "@typescript-eslint/no-object-literal-type-assertion": "off", // Deprecated/Removed
            // "@typescript-eslint/interface-name-prefix": "off", // Deprecated/Removed
            "@typescript-eslint/no-non-null-assertion": "off",
            
            "no-var": "error",
            "prefer-const": "error",
            "no-trailing-spaces": "error"
        },
    },
    {
        files: ["src/**/*.test.ts"],
        rules: {
            "@typescript-eslint/explicit-function-return-type": "off",
        },
    },
];
