import { deliveryReport, durationLabel, type AgentSessionDoc, type MapSnapshot } from '@miloops-hq/core';
import { journalFile } from '@miloops-hq/core/agents';

/** The `delivery` part of `status`: the mission report in one line, plus its numbers (see `deliveryReport`). */
export function deliveryView(root: string, snap: MapSnapshot, docs: AgentSessionDoc[]) {
  const used = docs.flatMap((d) => (d.session.mapId === snap.map.id && d.session.usage ? [d.session.usage] : []));
  const usage = {
    inputTokens: used.reduce((n, u) => n + u.inputTokens, 0),
    outputTokens: used.reduce((n, u) => n + u.outputTokens, 0),
    costUsd: used.reduce((n, u) => n + u.costUsd, 0),
  };
  const r = deliveryReport({
    snap,
    journal: journalFile(root).read(snap.map.id),
    answered: docs.flatMap((d) => d.answered),
    usage,
  });
  const cost = r.spend.perVerifiedTicketUsd;
  return {
    summary: [
      `${r.done} done`,
      `median lead time ${durationLabel(r.medianLeadMs)}`,
      `${r.interventions.total} human interventions`,
      `${r.rework.cycles} rework cycles`,
      cost === undefined ? 'cost per verified ticket —' : `$${cost} per verified ticket`,
    ].join(' · '),
    done: r.done,
    medianLeadMs: r.medianLeadMs,
    interventions: r.interventions,
    rework: r.rework,
    reviews: r.reviews,
    costPerVerifiedTicketUsd: cost,
  };
}
