/** Block Kit for every surface Scout renders in Slack. Pure functions; no I/O. */

export { ACTIONS, VIEWS, clip, escape, md, plain, quote } from './blocks/kit';
export { askClosedMessage, askMessage, replyModal, type AskRef, type AskView } from './blocks/asks';
export { approvalClosedMessage, approvalMessage, reworkModal, type ApprovalRef } from './blocks/approvals';
export { decisionModal, loadingModal, noticeModal, type DecisionForm, type SaveMode } from './blocks/decisions';
export { helpText, homeView } from './blocks/home';
