module.exports = {
  displayName:     '@opencraw/studio-ui',
  preset:          '../../jest.preset.js',
  testEnvironment: 'jsdom',
  transform:       {
    '^(?!.*\\.(js|jsx|ts|tsx|css|json)$)': '<rootDir>/../../jest.asset-transform.cjs',
    '^.+\\.[tj]sx?$':                      ['babel-jest', { presets: [['@babel/preset-env', { targets: { node: 'current' }, loose: true }], ['@babel/preset-typescript', { allowDeclareFields: true }], ['@babel/preset-react', { runtime: 'automatic', development: true }]] }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory:    'test-output/jest/coverage',
}
