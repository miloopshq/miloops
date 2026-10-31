export { createTrackerBridge } from './server/trackerBridge';
export type {
  BridgeContext,
  BridgeOptions,
  BridgePlugin,
  BridgePluginFactory,
  DecisionEvent,
  TrackerBridge,
} from './server/bridgeTypes';
export type { VerificationEvidenceEvent } from './server/verificationEvents';
export { activeTracker } from './server/activeTracker';
export { crossSite } from './server/trackerErrors';
export { configDir, credentialStore, type Credentials } from './server/trackerConfig';
export { AnswerError, readAgentDocs, writeAgentAnswer } from './agents/agentDocs';
export { readCommandCenterLock } from './agents/commandCenterLock';
export { writeJsonAtomic } from './lib/jsonFile';
export { outboxFile, outboxKey } from './adapters/remote/outboxFile';
