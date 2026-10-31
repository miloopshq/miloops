import { type RemoteKind, CONNECTORS } from '@miloops-hq/core';
import { useState, useMemo } from 'react';
import type { TrackerChoice, Prefs } from '../../lib';
import { GitHubSetup } from './GitHubSetup';
import { isRemote } from './labels';
import { LinearSetup } from './LinearSetup';
import { SyncLine } from './SyncLine';
import { trackerApi, switchTracker } from './trackerApi';
import { useTrackerSettings } from './useTrackerSettings';

/** The Tracker section of Settings: one card per connector, with inline setup for GitHub and Linear. */
export function TrackerConnectors(props: {
  activeTracker: TrackerChoice;
  location: string;
  update: (p: Partial<Prefs>) => void;
}) {
  const [s] = useTrackerSettings(5000);
  const [open, setOpen] = useState<RemoteKind | null>(null);
  const select = async (id: TrackerChoice) => {
    if (s && (id === 'markdown' || isRemote(id)))
      await trackerApi
        .connect({
          active: id === 'markdown' ? 'markdown' : id,
          ...(id === 'github' && s.github.repo ? { github: { repo: s.github.repo } } : {}),
          ...(id === 'linear' && s.linear.teamId
            ? {
                linear: {
                  teamId: s.linear.teamId,
                  teamKey: s.linear.teamKey,
                  teamName: s.linear.teamName,
                  projectId: s.linear.projectId,
                  projectName: s.linear.projectName,
                },
              }
            : {}),
        })
        .catch(() => {});
    switchTracker(props.update, id);
  };
  const configured = useMemo(() => ({ github: !!s?.github.repo, linear: !!s?.linear.teamId }), [s]);
  return (
    <>
      <div className="connectors">
        {CONNECTORS.map((c) => {
          const id = c.id as TrackerChoice;
          const active = id === props.activeTracker;
          const remote = isRemote(id);
          const usable = !remote || !!s;
          return (
            <div
              key={c.id}
              className={`card connector ${active ? 'active' : ''} ${usable ? '' : 'disabled'} ${open === id ? 'open' : ''}`}
            >
              <div className="card-row">
                <b className="card-title">{c.name}</b>
                {active && <span className="pill on">Active</span>}
              </div>
              {(c.id === 'markdown' || remote) && active && <div className="c-loc">{props.location}</div>}
              {remote && !active && configured[id] && (
                <div className="c-loc">
                  {id === 'github'
                    ? s!.github.repo
                    : [s!.linear.teamKey, s!.linear.projectName].filter(Boolean).join(' · ')}
                </div>
              )}
              {remote && active && <SyncLine status={s?.[id].status} />}
              <div className="c-actions">
                {!active && (!remote || configured[id]) && (
                  <button className="btn sm" disabled={!usable} onClick={() => void select(id)}>
                    Switch
                  </button>
                )}
                {remote && (
                  <button
                    className={`btn sm ${open === id ? 'on' : ''}`}
                    disabled={!usable}
                    onClick={() => setOpen(open === id ? null : id)}
                  >
                    {configured[id] ? 'Edit' : 'Connect'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {s && open === 'github' && <GitHubSetup s={s} onConnected={() => switchTracker(props.update, 'github')} />}
      {s && open === 'linear' && <LinearSetup s={s} onConnected={() => switchTracker(props.update, 'linear')} />}
    </>
  );
}
