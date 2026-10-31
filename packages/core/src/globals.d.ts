// Core targets plain ES2022 so it runs in browsers, Node, and edge runtimes alike.
// These are the only host APIs it relies on.
declare function setTimeout(cb: () => void, ms?: number): unknown;
declare function clearTimeout(handle: unknown): void;
declare function structuredClone<T>(value: T): T;
