const WORDMARK = [
  '████████╗███████╗ █████╗ ███╗   ███╗████████╗██████╗  █████╗ ██╗██╗     ',
  '╚══██╔══╝██╔════╝██╔══██╗████╗ ████║╚══██╔══╝██╔══██╗██╔══██╗██║██║     ',
  '   ██║   █████╗  ███████║██╔████╔██║   ██║   ██████╔╝███████║██║██║     ',
  '   ██║   ██╔══╝  ██╔══██║██║╚██╔╝██║   ██║   ██╔══██╗██╔══██║██║██║     ',
  '   ██║   ███████╗██║  ██║██║ ╚═╝ ██║   ██║   ██║  ██║██║  ██║██║███████╗',
  '   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚══════╝',
];
const MIN_WORDMARK = 76;
const MOSS = '\x1b[38;2;143;191;132m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

/**
 * The start-up greeting, sized to the terminal. Only for people: returns nothing when stdout isn't a terminal, so pipes,
 * logs and scripts see plain output. `NO_COLOR` keeps the art and drops the colour.
 */
export function greeting({
  version,
  tagline,
  isTTY,
  columns,
  noColor,
}: {
  version: string;
  tagline: string;
  isTTY: boolean;
  columns: number;
  noColor: boolean;
}) {
  if (!isTTY) return '';
  const ink = noColor ? '' : MOSS;
  const dim = noColor ? '' : DIM;
  const reset = noColor ? '' : RESET;
  const footer = `  ${dim}${tagline}  v${version}${reset}`;
  if (columns < MIN_WORDMARK) return `\n  ${ink}Teamtrail${reset}\n${footer}\n\n`;
  const rows = WORDMARK.map((row) => `  ${ink}${row}${reset}`.trimEnd());
  return `\n${rows.join('\n')}\n\n${footer}\n\n`;
}
