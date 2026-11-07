import { BRAND } from '@teamtrail/core';
import { greeting } from './greeting';

/** Writes the start-up greeting for the terminal this process is attached to. Never called by `mcp` or `hook`, whose stdout belongs to their protocol. */
export function printGreeting() {
  process.stdout.write(
    greeting({
      version: __VERSION__,
      tagline: BRAND.tagline,
      isTTY: !!process.stdout.isTTY,
      columns: process.stdout.columns ?? 80,
      noColor: 'NO_COLOR' in process.env,
    }),
  );
}
