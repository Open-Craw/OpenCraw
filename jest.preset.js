// Written by smith convert: the values @nx/jest/preset provided, without Nx.
module.exports = {
  testMatch:            ['**/?(*.)+(spec|test).?([mc])[jt]s?(x)'],
  moduleFileExtensions: ['ts', 'js', 'mts', 'mjs', 'cts', 'cjs', 'html'],
  coverageReporters:    ['html'],
  moduleNameMapper:     { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform:            {
    '^.+\\.(ts|js|mts|mjs|cts|cjs|html)$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  testEnvironment:          'jsdom',
  modulePathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/out-tsc/'],
  testEnvironmentOptions:   {
    customExportConditions: ['node', 'require', 'default'],
  },
}
