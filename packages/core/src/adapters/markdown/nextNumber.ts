import { parseFront, str } from '../../model/frontmatter';
import type { MarkdownFs } from './markdownFs';

/** The next free issue number across trails and tickets, as a tracker would hand out. */
export async function nextNumber(fs: MarkdownFs) {
  const files = await fs.list();
  const nums = files.filter((f) => !f.includes('/decisions/')).map((f) => Number(f.match(/(\d+)\.md$/)?.[1] ?? 0));
  const keys = await Promise.all(
    files
      .filter((f) => f.endsWith('/map.md'))
      .map(async (f) => Number(str(parseFront(await fs.read(f)).front.key).replace(/\D/g, '')) || 0),
  );
  return Math.max(0, ...nums, ...keys) + 1;
}
