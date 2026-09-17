# Linear Tickets for Obsidian

Turns bare Linear ticket IDs (`ENG-123`) into links, with a hover card showing the ticket's title, state, priority, assignee, project, labels and the start of its description.

- **Reading view:** IDs become ordinary links.
- **Live Preview / Source mode:** IDs stay editable text; hover for the card, Cmd-click to open.
- **Inline preview (optional):** show each ticket's status dot, or a Linear-style chip with status and title, right in the text. Purely visual: the note still contains just `ENG-123`.
- Skips code, frontmatter, tags, URLs, existing markdown links and wikilinks.

## Install

The plugin isn't in the community list; install it with [BRAT](https://github.com/TfTHacker/obsidian42-brat), which also keeps it updated:

1. Install and enable **BRAT** from Settings → Community plugins → Browse.
2. Run the command **BRAT: Add a beta plugin for testing** and enter `tomcoakes/obsidian-linear-tickets`.
3. Enable **Linear Tickets** in Settings → Community plugins.

Requires Obsidian 1.11.4 or later.

## Setup

1. Settings → Linear Tickets → **Linear API key**: create a secret holding a Linear personal API key (Linear → Settings → Security & access → Personal API keys). The key lives in Obsidian's secret storage, which doesn't sync, so do this on each device.
2. Set the **workspace URL slug** (the `acme` in `linear.app/acme/issue/ENG-123`) and your **team keys** (`ENG`). Nothing is linked until team keys are set.
3. **Inline preview** is off by default. *Status only* adds a dot before each ID (ring = to do, half = in progress, solid = done; finished tickets are dimmed). *Status + title* renders a chip; in Live Preview the chip opens back into the plain ID when the cursor touches it. The command **Cycle inline preview** switches modes and can be bound to a hotkey. With a preview on, a note's tickets are fetched from Linear when the note is shown (one batched request per team, cached), rather than only on hover.
4. **Open tickets in** chooses between the browser and the Linear desktop app (`linear://` deep links, opened through Electron's shell on desktop).

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

### Releasing

```sh
npm version patch          # bumps package.json, manifest.json and versions.json, commits, tags
git push --follow-tags     # the tag triggers the release workflow
```

The workflow builds the plugin and attaches `main.js`, `manifest.json` and `styles.css` to a GitHub release, which is what BRAT installs.

## Layout

| File | Role |
|------|------|
| `src/matcher.ts` | Ticket-ID regex and URL building, shared by both render paths |
| `src/editor.ts` | CodeMirror 6 decorations (marks, and the chip widget) + Mod-click |
| `src/inline.ts` | Inline preview rendering shared by both render paths |
| `src/reading.ts` | Markdown post-processor for rendered HTML |
| `src/hover.ts` | The shared hover card, driven by delegated DOM events |
| `src/store.ts` | Stale-while-revalidate cache with batched loading, persisted to `cache.json` (not synced) |
| `src/linear.ts` | Linear GraphQL client |
