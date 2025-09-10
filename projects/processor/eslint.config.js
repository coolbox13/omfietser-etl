import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        // Node.js globals
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        NodeJS: 'readonly',
        BufferEncoding: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // TypeScript specific rules (relaxed for initial cleanup)
      '@typescript-eslint/no-unused-vars': 'warn', // Changed to warn
      '@typescript-eslint/no-explicit-any': 'off',  // Turn off temporarily
      
      // General rules (relaxed)
      'no-console': 'off',  // Allow console.log for now
      'no-debugger': 'error',
      'no-undef': 'off',    // Turn off since we have TypeScript
      'no-useless-escape': 'warn', // Change to warn
      'no-case-declarations': 'off', // Turn off for now
      
      // Turn off base rules that conflict with TypeScript
      'no-unused-vars': 'off',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts', 'tests/**/*.ts', 'src/__tests__/**/*.ts'],
    rules: {
      // More relaxed rules for tests
      '@typescript-eslint/no-unused-vars': 'off',
      'no-console': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '*.js'],
  },
];
