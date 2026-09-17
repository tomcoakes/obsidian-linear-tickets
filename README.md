# Linear Tickets for Obsidian

Turns bare Linear ticket IDs (`ENG-123`) into links, with a hover card showing the ticket's title, state, priority, assignee, project, labels and the start of its description.

- **Reading view:** IDs become ordinary links.
- **Live Preview / Source mode:** IDs stay editable text; hover for the card, Cmd-click to open.
- Skips code, frontmatter, tags, URLs, existing markdown links and wikilinks.

## Setup

1. Settings → Linear Tickets → **Linear API key**: create a secret holding a Linear personal API key (Linear → Settings → Security & access). The key lives in Obsidian's secret storage, which doesn't sync, so do this on each device.
2. Set the **workspace URL slug** (the `acme` in `linear.app/acme/issue/ENG-123`) and your **team keys** (`ENG`). Nothing is linked until team keys are set.
3. **Open tickets in** chooses between the browser and the Linear desktop app (`linear://` deep links, opened through Electron's shell on desktop).

## Development

```sh
npm install
npm run dev     # watch build
npm run build   # typecheck + production build
```

Create a gitignored `local.config.json` to have every build copied into a vault:

```json
{ "pluginDir": "/path/to/vault/.obsidian/plugins/linear-tickets" }
```

Then `obsidian plugin:reload id=linear-tickets`.

## Layout

| File | Role |
|------|------|
| `src/matcher.ts` | Ticket-ID regex and URL building, shared by both render paths |
| `src/editor.ts` | CodeMirror 6 mark decorations + Mod-click |
| `src/reading.ts` | Markdown post-processor for rendered HTML |
| `src/hover.ts` | The shared hover card, driven by delegated DOM events |
| `src/store.ts` | Stale-while-revalidate cache, persisted to `cache.json` (not synced) |
| `src/linear.ts` | Linear GraphQL client |
