// Picks the version the Release workflow publishes and prints `version=<v>` for $GITHUB_OUTPUT.
// CHANNEL=next|latest|stub, REQUESTED=<x.y.z> (latest only, optional). Reads npm's current `latest` for teamtrail.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const parse = (v) => SEMVER.exec(v)?.slice(1).map(Number);
const cmp = (a, b) => {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};
const fail = (msg) => {
  console.error(`::error::${msg}`);
  process.exit(1);
};
const npmView = (spec) => {
  try {
    return execFileSync('npm', ['view', spec, 'version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
};

const channel = process.env.CHANNEL;
const pkg = JSON.parse(readFileSync('packages/cli/package.json', 'utf8')).version;
// npm's latest can be a placeholder or prerelease (e.g. 0.0.0-stage from staged publishing): count that as nothing released.
const npmLatest = npmView('teamtrail@latest');
const latest = parse(npmLatest) ? npmLatest : '0.0.0';
if (!parse(pkg)) fail(`packages/cli/package.json version ${pkg} is not x.y.z`);

let version;
if (channel === 'latest') {
  version = process.env.REQUESTED?.trim() || pkg;
  if (!parse(version)) fail(`version ${version} is not x.y.z`);
  if (cmp(version, latest) <= 0) fail(`version ${version} must be higher than npm's latest (${latest})`);
  if (npmView(`teamtrail@${version}`)) fail(`teamtrail@${version} is already on npm`);
} else if (channel === 'next') {
  const [a, b, c] = parse(latest);
  const afterLatest = `${a}.${b}.${c + 1}`;
  const upcoming = cmp(pkg, afterLatest) >= 0 ? pkg : afterLatest;
  version = `${upcoming}-next.${process.env.GITHUB_RUN_NUMBER ?? '0'}`;
} else if (channel === 'stub') {
  // The placeholder lives at 0.0.x; once a real release is on latest, there is nothing to refresh.
  const [a, b, c] = parse(latest);
  if (a !== 0 || b !== 0) fail(`npm's latest is ${latest}, a real release: the placeholder is retired`);
  version = `0.0.${c + 1}`;
} else fail(`unknown channel ${channel}`);

console.error(`npm latest ${latest} · package.json ${pkg} → ${version}`);
console.log(`version=${version}`);
