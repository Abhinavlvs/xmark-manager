import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/',
      'dist/',
      'web-ext-artifacts/',
      '.local/',
      '.superpowers/',
      '.claude/',
      'safari/',
    ],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    ignores: ['src/content/**'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.webextensions },
    },
    rules: { 'no-eval': 'error', 'no-implied-eval': 'error', 'no-new-func': 'error' },
  },
  {
    // Classic scripts (no import/export): content scripts cannot be ES modules in Firefox.
    files: ['src/content/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.webextensions },
    },
    rules: { 'no-eval': 'error', 'no-implied-eval': 'error', 'no-new-func': 'error' },
  },
  {
    files: ['dev/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.webextensions },
    },
  },
  {
    files: [
      'tests/**/*.js',
      'test-support/**/*.js',
      'scripts/**/*.js',
      'scripts/**/*.mjs',
      'eslint.config.js',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
];
