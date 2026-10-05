const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,
  {
    files: ['**/*.test.{js,jsx,ts,tsx}', '__mocks__/**/*.{js,jsx,ts,tsx}', 'jest.setup.js'],
    languageOptions: { globals: globals.jest },
  },
  {
    files: ['scripts/**/*.js', '*.config.js', 'eslint.config.js'],
    languageOptions: { globals: globals.node, sourceType: 'commonjs' },
  },
]);
