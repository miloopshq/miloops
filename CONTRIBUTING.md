# Contributing

Run `npm run check` before opening a pull request. It runs lint, the Prettier format check, typecheck, build, the vitest and node:test suites, and `verify:mcp`. Changes that touch the command center UI should include a before/after screenshot.

## Code standards

ESLint (`eslint.config.js`) and Prettier (`.prettierrc.json`) enforce most of these.

- **One export per file.** Each file exports one component, hook, or class and is named after it (`SessionsList.tsx`, `useNow.ts`, `GitHubAdapter.ts`). Don't put a second component in the same file, even a private one. Give it its own file in the same folder.
- **Keep kinds apart.** Hooks go in `useX.ts`, pure helpers in `lib/` (apps) or a topic module (core), and shared types in `types.ts`. A component file never exports helpers or constants for other files.
- **200 lines max** per file, not counting blank lines and comments. Split by responsibility. Tests, `scripts/` and `tools/` are exempt.
- **Layout.**
  - command center: `components/ui/` holds design-system primitives, `features/<feature>/` holds one folder per zone or dialog, and app-wide code goes in `hooks/` and `lib/`.
  - core: modules are grouped by topic under `src/`, with the entry points listed in `package.json` `exports`.
  - Code used by more than one package belongs in `packages/core`, or in `packages/milo-avatar` for the avatar.
- **Imports.** Use inline type imports (`import { x, type Y } from '…'`) and one import statement per module. No unused imports and no import cycles.
- **Barrels.** A folder that is imported from outside gets one `index.ts` with explicit named re-exports. Inside the folder, import siblings by path, never through its own `index.ts`. Use `export *` only in package entry points.
- **Naming.** Components and classes use `PascalCase`, hooks `useCamelCase`, other modules `camelCase`, and folders `kebab-case`.
- **Tests.** vitest suites are `*.test.ts` and node:test suites are `*.node.test.ts`. Both live in the package's `test/` folder, with fakes in `test/fakes/` and recorded fixtures in `test/fixtures/`.
- **Formatting.** Run `npm run format` on the files you touch: single quotes, 120 columns, trailing commas.
- **Behavior-neutral refactors.** Keep package exports and public names stable. Run the full `check` and compare command center screenshots before and after.
