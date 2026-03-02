import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';

export default tseslint.config(
  // Base TypeScript recommended rules
  ...tseslint.configs.recommended,

  // Prettier integration: disables conflicting rules, adds prettier/prettier rule
  prettierConfig,
  {
    plugins: { prettier: prettierPlugin },
    rules: {
      'prettier/prettier': 'error',
    },
  },

  // Project-specific overrides
  {
    rules: {
      // Ramda's type definitions require occasional unsafe casts — allow them
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // Ignore compiled output and config files
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
);
