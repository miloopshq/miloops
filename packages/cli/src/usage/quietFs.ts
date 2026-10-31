import fs from 'node:fs';

/** File reads for log discovery: a missing or unreadable file is an empty answer, never an error. */
export function tail(file: string, bytes = 256 << 10) {
  try {
    const size = fs.statSync(file).size;
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(Math.min(size, bytes));
      fs.readSync(fd, buf, 0, buf.length, size - buf.length);
      return buf.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '';
  }
}

export const size = (file: string) => {
  try {
    return fs.statSync(file).size;
  } catch {
    return -1;
  }
};

export const recent = (file: string, since: number) => {
  try {
    return fs.statSync(file).mtimeMs >= since;
  } catch {
    return false;
  }
};

export const ls = (dir: string) => {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
};
