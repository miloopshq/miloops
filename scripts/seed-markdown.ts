// Writes the sample map into a local-markdown tracker folder using only @miloops-hq/core.
// Run: npm run seed:markdown   (target folder: $<DATA_DIR_ENV> or ./<dataDir>)
import { BRAND, MarkdownAdapter, seedSnapshot } from '@miloops-hq/core';
import { nodeMarkdownFs } from '@miloops-hq/core/node';

const root = process.env[BRAND.dataDirEnv] ?? BRAND.dataDir;
const adapter = new MarkdownAdapter(nodeMarkdownFs(root), root);
if ((await adapter.listMaps()).length) {
  console.log(`maps already exist in ${root}; nothing to do`);
} else {
  const map = await seedSnapshot(adapter);
  console.log(`seeded ${root}/${map.id}`);
}
process.exit(0);
