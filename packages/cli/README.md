# miloops

MILOOPS, the Autonomous Agent Command Center. One command opens a local command center for the agents working in your repo.

```bash
npm i -g miloops      # or skip the install: npx miloops
cd your-repo
miloops
```

`miloops` starts a local server, opens the command center in your browser and keeps missions as markdown in `./.miloops/` in the current folder. Commit that folder or ignore it; agents and people can edit the files directly, and changes show up live.

| Option | Default | |
| --- | --- | --- |
| `--dir <path>` | `./.miloops` (or `$MILOOPS_DIR`) | Tracker folder |
| `--port <n>` | `7420`, next free port if taken | Port |
| `--host <addr>` | `127.0.0.1` | Interface to bind. The server can write files in the tracker folder, so only expose it on networks you trust. |
| `--no-open` | | Don't open the browser |

Requires Node 20 or newer. No other runtime dependencies.

Concepts derived from mattpocock/skills (MIT); see `THIRD_PARTY_NOTICES.md`.
