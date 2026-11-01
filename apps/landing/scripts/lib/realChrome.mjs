// The capture scripts drive the built-in simulation (?simulate) to produce live missions, but the
// product's real UI has no simulation controls. This hides them in every frame and shows the real
// command bar instead; `simClick` still presses the hidden controls behind the scenes.
const CSS = `
.command-bar .btn.primary, .command-bar .toggle, .upnext .link,
[data-tip="Send an agent to work this ticket"] { display: none !important; }
.command-bar::before { content: 'Agents pick up ready work from their chat'; color: var(--dim); font-size: var(--fs-sm); }
.command-bar::after { content: '/milo resume'; padding: 4px 10px; border: 1px solid var(--line2); background: rgba(0,0,0,.35);
  font-family: var(--mono); font-size: var(--fs-sm); color: var(--text-hi); }`;

export async function realChrome(page) {
  await page.addInitScript((css) => {
    const add = () => document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
    if (document.head) add();
    else document.addEventListener('DOMContentLoaded', add);
  }, CSS);
}

/** Clicks a simulation control even while it is hidden from the frame. */
export const simClick = (page, selector, text) =>
  page.evaluate(
    ([sel, t]) => {
      const el = [...document.querySelectorAll(sel)].find((b) => !t || b.textContent.includes(t));
      if (!el) throw new Error(`no ${sel} ${t ?? ''}`);
      el.click();
    },
    [selector, text],
  );
