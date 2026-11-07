import type { RateInfo, TrackerErrorCode } from './http';
import type { SyncStatus } from './sync/types';

export type RemoteKind = 'github' | 'linear';
export type ActiveTracker = 'markdown' | RemoteKind;

/** Where a credential came from. Values never leave the machine running `teamtrail`; only the source is reported. */
export type CredentialSource = 'stored' | 'GITHUB_TOKEN' | 'GH_TOKEN' | 'gh' | 'LINEAR_API_KEY';

export interface LinearTarget {
  teamId: string;
  teamKey?: string;
  teamName?: string;
  /** Optional: trails are created in this project and only its trails are listed. */
  projectId?: string;
  projectName?: string;
}

/** `GET <api>/trackers`: what Settings shows. Contains no secrets. */
export interface TrackerSettings {
  active: ActiveTracker;
  github: {
    repo?: string;
    /** `owner/name` of the `origin` remote, offered as the default. */
    detectedRepo?: string;
    auth: CredentialSource | null;
    status?: SyncStatus;
  };
  linear: Partial<LinearTarget> & {
    auth: CredentialSource | null;
    status?: SyncStatus;
  };
}

/** `POST <api>/trackers/test` body. Omitted credentials fall back to the stored / detected ones. */
export interface TrackerTestRequest {
  kind: RemoteKind;
  repo?: string;
  token?: string;
  apiKey?: string;
  teamId?: string;
}

export interface TrackerTestResult {
  ok: boolean;
  /** `@login` on GitHub, the user's name on Linear. */
  account?: string;
  /** `owner/name`, or `TEAM · Project`. */
  target?: string;
  /** False when the token can read but not write issues; undefined when the tracker does not say. */
  canWrite?: boolean;
  rate?: RateInfo;
  /** Linear: teams the key can see, and the projects of the chosen team. */
  teams?: { id: string; key: string; name: string }[];
  projects?: { id: string; name: string }[];
  error?: string;
  code?: TrackerErrorCode;
}

/** `PUT <api>/trackers` body. Credentials are optional: env / `gh` / stored ones are used when omitted. */
export interface TrackerConnectRequest {
  active: ActiveTracker;
  github?: { repo: string; token?: string };
  linear?: LinearTarget & { apiKey?: string };
}
