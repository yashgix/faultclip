'use strict';

const nodeGlobals = { require: 'readonly', module: 'writable', process: 'readonly', console: 'readonly', __dirname: 'readonly' };

module.exports = [
  { ignores: ['docs/**', 'benchmark/data/**'] },
  {
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: nodeGlobals },
    rules: { eqeqeq: 'error', 'no-undef': 'error', 'no-unused-vars': 'error', 'prefer-const': 'error' },
  },
];
