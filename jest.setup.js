// Suppresses the "not wrapped in act(...)" warning that fires when
// chunk-progress updates land between waitFor() polling ticks. The updates
// themselves are correct — React just can't confirm a test observed them
// synchronously — so this is safe to filter out rather than fix.
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('not wrapped in act')) return;
    originalError(...args);
  };
});
afterAll(() => {
  console.error = originalError;
});
