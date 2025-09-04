/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    transform: {
      '^.+\\.tsx?$': [
        'ts-jest',
        {
          tsconfig: 'tsconfig.json'
        },
      ],
    },
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    testMatch: ['**/__tests__/**/*.(test|spec).(ts|tsx|js)'],
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    globals: {
      'process.env': {
        NODE_ENV: 'test'
      }
    },
    // Force exit after tests to prevent hanging
    forceExit: true,
    // Detect open handles
    detectOpenHandles: true
  };