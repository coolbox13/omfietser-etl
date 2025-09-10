// Jest global setup for the processor project
// Keep this minimal to avoid unintended side effects in unit tests

// Increase default timeout for async tests if needed
jest.setTimeout(30000);

// Silence noisy console warnings during tests (optional)
const originalWarn = console.warn;
console.warn = (...args) => {
  // Allow warnings, but keep output cleaner if desired
  originalWarn.apply(console, args);
};

