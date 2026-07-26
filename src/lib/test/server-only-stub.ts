// Aliased onto the bare `server-only` specifier by vitest.config.ts's
// resolve.alias. `server-only` isn't a real installed npm package — Next.js's
// bundler special-cases that literal string at build time to throw if a
// tagged module ends up in a client bundle, but nothing provides an actual
// resolvable module for Node/Vite outside of Next's own compiler. This
// empty stub lets Vitest resolve `import "server-only"` at all, so a test
// can import the real implementation of a server-only-tagged file directly
// instead of always mocking it away (docs/toolkit.md).
export {};
