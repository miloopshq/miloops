/** Node side of the agent link (agentLink.ts): session docs, answers and the command-center lock under a tracker root. */
export { AgentDocWriter } from './agents/agentDocWriter';
export { AnswerError, readAgentDoc, readAgentDocs, writeAgentAnswer } from './agents/agentDocs';
export { readCommandCenterLock, writeCommandCenterLock } from './agents/commandCenterLock';
export { writeJsonAtomic } from './lib/jsonFile';
export { dropLease, readLease, readLeases, renewLease, writeLease } from './agents/leaseStore';
export { LEASE_REAPER, reclaimExpired, returnToQueue, type ReturnOutcome } from './agents/returnToQueue';
