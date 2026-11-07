/** `<trail>/decisions/<D-n>.md`; groups: trail, decision id. */
export const DECISION_PATH = /^([^/]+)\/decisions\/([^/]+)\.md$/;

/** Folder name of a new trail: its title in kebab case, else `map-<n>`. */
export const trailSlug = (title: string, n: number) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || `map-${n}`;
