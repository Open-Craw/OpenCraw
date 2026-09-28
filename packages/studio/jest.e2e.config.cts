/* eslint-disable */
const { readFileSync } = require('fs')

// The e2e suite: starts the real studio server against a fixture recipe folder and hits its HTTP/WS API.
const swcJestConfig = JSON.parse(readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'))
swcJestConfig.swcrc = false

module.exports = {
  displayName: '@opencraw/studio (e2e)',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  roots: ['<rootDir>/e2e'],
  testMatch: ['**/*.e2e.test.ts'],
  testTimeout: 60000,
  maxWorkers: 1,
  transform: { '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig] },
  moduleFileExtensions: ['ts', 'js', 'html'],
  // pdf.js is an ES module Jest cannot load itself: see jest-pdfjs.cjs (a PDF-reading recipe runs through the real server here — pdf-canvas.e2e.test.ts, issue #94's 5b).
  moduleNameMapper: { '^pdfjs-dist/legacy/build/pdf\\.mjs$': '<rootDir>/jest-pdfjs.cjs' },
}
