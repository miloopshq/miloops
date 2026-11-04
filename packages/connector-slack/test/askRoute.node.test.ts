import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AttentionItem, AttentionPrefs } from '@miloops-hq/core';
import { askRoute } from '../src/service/askRoute';

const item = (ref: string): AttentionItem => ({
  id: `question:m1:${ref}`,
  kind: 'question',
  mapId: 'm1',
  title: 'Answer',
  since: 0,
  urgency: 'soon',
  score: 50,
  reasons: [],
  batchKey: 'm1:question',
  ref,
});
const prefs = (channel: AttentionPrefs['channel']): AttentionPrefs => ({ v: 1, channel });

test('interrupt gating: only interrupting questions get their own Slack message, the rest go to the digest', () => {
  const view = { items: [item('q1'), item('q2')], interrupting: ['question:m1:q1'], prefs: prefs('slack-dm') };
  assert.equal(askRoute({ id: 'q1' }, view), 'ask');
  assert.equal(askRoute({ id: 'q2' }, view), 'digest');
  assert.equal(askRoute({ id: 'q3' }, view), 'digest', 'not in the queue (snoozed): no interruption');
  assert.equal(askRoute({ id: 'q1' }, { ...view, prefs: prefs('none') }), 'digest');
  assert.equal(askRoute({ id: 'q2' }, undefined), 'ask', 'gating off: every question is posted');
});
