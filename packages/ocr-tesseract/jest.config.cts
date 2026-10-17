/* eslint-disable */
const { readFileSync } = require('fs')

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'))

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false

module.exports = {
  displayName: '@opencraw/ocr-tesseract',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  // pdf.js is an ES module Jest cannot load itself: see jest-pdfjs.cjs.
  moduleNameMapper: { '^pdfjs-dist/legacy/build/pdf\\.mjs$': '<rootDir>/jest-pdfjs.cjs', '^@opencraw/ocr-tesseract$': '<rootDir>/src/index.ts' },
  // marked ships as an ES module only: transform it like the sources (@opencraw/core is read from its sources).
  transformIgnorePatterns: ['/node_modules/(?!marked/)'],
  coverageDirectory: 'test-output/jest/coverage',
}
