import { type SlackApi } from '../api';
import { homeView } from '../blocks';
import { gitEmail } from './gitEmail';
import type { SlackContext } from './slackContext';

export async function publishHome(ctx: SlackContext, user: string) {
  const c = ctx.store.read();
  await ctx.call('views.publish', {
    user_id: user,
    view: homeView({
      claimed: !!c.owners.length,
      owner: c.owners[0]?.id,
      you: c.owners.some((o) => o.id === user),
      url: ctx.o.url(),
      command: c.command,
    }),
  });
}

/**
 * Step 5 without leaving Teamtrail: the person running `teamtrail` is the owner, so when their git
 * email belongs to exactly one workspace member, that member is claimed and DM'd right away.
 * Anything else (no email, no match, missing scope) falls back to "This is me" on the Home tab.
 */
export async function ownerByEmail(ctx: SlackContext, api: SlackApi) {
  const email = (ctx.o.ownerEmail ?? (() => gitEmail(ctx.o.root)))()?.trim();
  if (!email) return;
  const r = await api
    .call<{
      user?: {
        id: string;
        deleted?: boolean;
        is_bot?: boolean;
        name?: string;
        real_name?: string;
        profile?: { display_name?: string };
      };
    }>('users.lookupByEmail', { email })
    .catch(() => undefined);
  const u = r?.user;
  if (!u || u.deleted || u.is_bot) return;
  ctx.store.update({
    owners: [{ id: u.id, name: u.profile?.display_name || u.name || u.real_name, via: 'git-email' }],
  });
  await api
    .call<{ channel: { id: string } }>('conversations.open', { users: u.id })
    .then((o) =>
      api.call('chat.postMessage', {
        channel: o.channel.id,
        text: 'Connected. Decisions and questions will reach you here.',
      }),
    )
    .catch(() => undefined);
}

/** Step 5: the first person to click "This is me" on the Home tab becomes the owner; Scout confirms in their DM. */
export async function claim(ctx: SlackContext, user: string) {
  if (ctx.store.read().owners.length) return publishHome(ctx, user);
  ctx.store.update({ owners: [{ id: user, name: await ctx.nameOf(user), via: 'home' }] });
  await ctx.call('chat.postMessage', {
    channel: await ctx.dmOf(user),
    text: 'Connected. Decisions and questions will reach you here.',
  });
  await publishHome(ctx, user);
}
