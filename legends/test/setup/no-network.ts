// Tests must never reach the network. Any accidental use of the global fetch fails loudly.
globalThis.fetch = (() => {
  throw new Error("Network access is disabled in tests; inject a fixture transport instead.");
}) as typeof fetch;
