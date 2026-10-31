/**
 * Minimal filesystem the markdown adapter needs. The command center provides
 * an HTTP-backed implementation via the Vite dev server; a CLI would pass
 * one backed by node:fs.
 */
export interface MarkdownFs {
  /** All `.md` paths under the root, relative and `/`-separated. */
  list(): Promise<string[]>;
  read(path: string): Promise<string>;
  write(path: string, text: string): Promise<void>;
  /** Optional: notify on external changes so other sessions' edits stream in. */
  watch?(cb: (path: string) => void): () => void;
}
