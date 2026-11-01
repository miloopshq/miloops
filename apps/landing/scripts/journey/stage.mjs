// Overlay injected into the command-center page while the journey records: chapter label + caption,
// full-screen terminal / Claude Code windows that type their lines, and the title and end cards.
// Runs in the browser (page.addInitScript), so it must stay self-contained.
export function installStage(milo) {
  const css = `
  #stage-cap{position:fixed;left:50%;bottom:34px;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;
    align-items:center;gap:10px;pointer-events:none;transition:opacity .35s}
  #stage-cap b{font:400 13px 'Geist Pixel',monospace;letter-spacing:.16em;text-transform:uppercase;color:#c98b5e}
  #stage-cap span{font:400 22px 'Geist Pixel',monospace;color:#eef4f5;padding:12px 22px;background:rgba(5,9,11,.92);
    border:1px solid rgba(128,164,172,.3);box-shadow:0 18px 50px rgba(0,0,0,.6)}
  #stage-ov{position:fixed;inset:0;z-index:9998;background:#05090b;display:grid;place-items:center;transition:opacity .35s}
  #stage-ov.off{opacity:0;pointer-events:none}
  .st-win{width:1180px;height:640px;margin-bottom:90px;border:1px solid rgba(128,164,172,.28);background:#0a1215;display:flex;flex-direction:column;
    box-shadow:0 40px 100px rgba(0,0,0,.7)}
  .st-bar{height:38px;display:flex;align-items:center;gap:8px;padding:0 14px;border-bottom:1px solid rgba(128,164,172,.16);
    font:400 13px 'Geist Variable',sans-serif;color:#8598a0}
  .st-bar i{width:11px;height:11px;border-radius:50%;background:#2a3437}
  .st-bar em{margin:0 auto;font-style:normal;transform:translateX(-30px)}
  .st-body{flex:1;padding:22px 26px;overflow:hidden;font:400 19px/1.6 ui-monospace,Menlo,monospace;color:#c9d6d8;white-space:pre-wrap}
  .st-body .dim{color:#6f8288}.st-body .ok{color:#84b6c2}.st-body .acc{color:#c98b5e}.st-body .milo{color:#e1e9ea}
  .st-body .user{color:#eef4f5}.st-body .box{display:inline-block;border:1px solid #c98b5e;padding:6px 14px;margin-bottom:6px}
  .st-cur{display:inline-block;width:10px;height:1.1em;vertical-align:-3px;background:#c98b5e;animation:stb 1s steps(1) infinite}
  @keyframes stb{50%{opacity:0}}
  .st-card{display:flex;flex-direction:column;align-items:center;gap:26px;margin-bottom:60px;text-align:center}
  .st-card img{width:170px;height:170px;image-rendering:pixelated}
  .st-card h1{margin:0;font:400 96px 'Geist Pixel',monospace;letter-spacing:.06em;color:#eef4f5}
  .st-card h1 span{color:#c98b5e}
  .st-card p{margin:0;font:400 26px 'Geist Pixel',monospace;color:#b9c9cc}
  .st-card code{font:400 28px 'Geist Pixel',monospace;color:#eef4f5;padding:14px 24px;border:1px solid rgba(128,164,172,.3)}
  .st-card code span{color:#c98b5e}
  .st-card small{font:400 15px 'Geist Pixel',monospace;letter-spacing:.18em;color:#8598a0;text-transform:uppercase}`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const el = (tag, attrs = {}, html = '') => Object.assign(document.createElement(tag), attrs, { innerHTML: html });
  let cap, ov;
  const ensure = () => {
    if (cap) return;
    document.head.append(el('style', {}, css));
    cap = el('div', { id: 'stage-cap' });
    ov = el('div', { id: 'stage-ov', className: 'off' });
    document.body.append(ov, cap);
  };
  window.__stage = {
    caption(label, text) {
      ensure();
      cap.style.opacity = text ? '1' : '0';
      if (text) cap.innerHTML = `<b>${label}</b><span>${text}</span>`;
    },
    hide() {
      ensure();
      ov.classList.add('off');
    },
    card(kind) {
      ensure();
      const word = '<h1>MILO<span>OPS</span></h1>';
      ov.innerHTML =
        kind === 'title'
          ? `<div class="st-card"><img src="${milo}" alt="">${word}<p>Mission control for your AI coding agents.</p></div>`
          : `<div class="st-card"><img src="${milo}" alt="">${word}<code><span>$</span> npx miloops</code>
             <small>Works with Claude Code, Codex and any MCP agent</small><small>miloops.app</small></div>`;
      ov.classList.remove('off');
    },
    /** lines: [{ t, cls?, type?, pause? }]; `type` lines are typed after a prompt, the rest appear at once. */
    async term(title, lines, prompt = '~/fieldnote-app $ ') {
      ensure();
      ov.innerHTML = `<div class="st-win"><div class="st-bar"><i></i><i></i><i></i><em>${title}</em></div><div class="st-body"></div></div>`;
      ov.classList.remove('off');
      const body = ov.querySelector('.st-body');
      const cur = el('span', { className: 'st-cur' });
      body.append(cur);
      for (const l of lines) {
        const row = el('div', { className: l.cls ?? '' });
        body.insertBefore(row, cur);
        if (l.type) {
          row.append(el('span', { className: 'dim' }, l.prompt ?? prompt));
          const typed = el('span', { className: 'user' });
          row.append(typed, cur);
          await sleep(350);
          for (const ch of l.t) {
            typed.textContent += ch;
            await sleep(34);
          }
          await sleep(300);
          body.append(cur);
        } else row.innerHTML = l.t || '&nbsp;';
        await sleep(l.pause ?? 110);
      }
    },
  };
}
