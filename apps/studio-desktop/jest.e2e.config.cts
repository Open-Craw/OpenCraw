/* eslint-disable */
const { readFileSync } = require('fs')

// The e2e suite: starts the built Electron app against a fixture recipe folder and drives its window.
const swcJestConfig = JSON.parse(readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'))
swcJestConfig.swcrc = false

module.exports = {
  displayName: '@opencraw/studio-desktop (e2e)',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  roots: ['<rootDir>/e2e'],
  testMatch: ['**/*.e2e.test.ts'],
  testTimeout: 60000,
  maxWorkers: 1,
  transform: { '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig] },
  moduleFileExtensions: ['ts', 'js', 'html'],
}
