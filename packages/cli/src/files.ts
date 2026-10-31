import fs from 'node:fs';
import path from 'node:path';

export function writeIfChanged(file: string, text: string) {
  const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
  if (prev === text) return 'unchanged';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return prev === undefined ? 'added' : 'updated';
}
