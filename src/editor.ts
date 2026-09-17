import { syntaxTree } from "@codemirror/language";
import { Extension, RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { Keymap } from "obsidian";
import { TICKET_ATTR, TICKET_CLASS } from "./types";

export interface TicketHost {
  getRegex(): RegExp | null;
  urlFor(id: string): string;
  open(id: string): void;
}

// Obsidian's markdown tree is flat, with node names built from token classes
// (e.g. "formatting_formatting-code_inline-code", "hmd-internal-link", "string_url").
const SKIPPED_NODE = /code|link|url|frontmatter|tag|math|comment/;

function isSkippedContext(view: EditorView, pos: number): boolean {
  for (let node = syntaxTree(view.state).resolveInner(pos, 1); node.parent; node = node.parent) {
    if (SKIPPED_NODE.test(node.type.name)) return true;
  }
  return false;
}

function buildDecorations(view: EditorView, host: TicketHost): DecorationSet {
  const regex = host.getRegex();
  const builder = new RangeSetBuilder<Decoration>();
  if (!regex) return builder.finish();

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);
    for (const match of text.matchAll(regex)) {
      const start = from + match.index;
      if (isSkippedContext(view, start)) continue;
      // A mark (not a replace widget) keeps the ID as ordinary editable text.
      builder.add(
        start,
        start + match[0].length,
        Decoration.mark({ class: TICKET_CLASS, attributes: { [TICKET_ATTR]: match[0] } }),
      );
    }
  }
  return builder.finish();
}

export function ticketEditorExtension(host: TicketHost): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, host);
      }

      update(update: ViewUpdate) {
        const reparsed = syntaxTree(update.startState) !== syntaxTree(update.state);
        const reconfigured = update.transactions.some((tr) => tr.reconfigured);
        if (update.docChanged || update.viewportChanged || reparsed || reconfigured) {
          this.decorations = buildDecorations(update.view, host);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
      eventHandlers: {
        // Mod-click opens the ticket, as with Obsidian's own editor links; a plain click still places the cursor.
        mousedown(event) {
          const ticket = (event.target as Element | null)?.closest?.(`.${TICKET_CLASS}`);
          const id = ticket?.getAttribute(TICKET_ATTR);
          if (!id || !Keymap.isModEvent(event)) return false;
          event.preventDefault();
          host.open(id);
          return true;
        },
      },
    },
  );
}
