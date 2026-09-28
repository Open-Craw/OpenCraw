/* eslint-disable */
const { readFileSync } = require('fs')

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8')
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

module.exports = {
  displayName: '@opencraw/studio',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  // Without this, the default preset's testMatch also picks up e2e/**/*.e2e.test.ts (it ends in
  // ".test.ts" too), which the plain `test` target never wants: those files start a real HTTP
  // server on a fixed port and (since phase 2 / #91) may need a real browser, both of which
  // belong to the dedicated, serialised `e2e` target (jest.e2e.config.cts) only. Before phase 2
  // this went unnoticed because only one e2e file shared the fixture site's port; a second one
  // (picking.e2e.test.ts) makes the port collision (and the missing-browser dependency) a real,
  // reproducible failure under `nx run studio:test`'s parallel workers.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/e2e/'],
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig]
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage'
};
