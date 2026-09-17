import { syntaxTree } from "@codemirror/language";
import { Extension, Range, StateEffect } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { editorLivePreviewField, Keymap } from "obsidian";
import { dotAttributes, InlineView, inlineViewOf, renderTicket } from "./inline";
import { CacheEntry, InlineMode, TICKET_ATTR, TICKET_CLASS } from "./types";

export interface TicketHost {
  getRegex(): RegExp | null;
  urlFor(id: string): string;
  open(id: string): void;
  inlineMode(): InlineMode;
  peek(id: string): CacheEntry | undefined;
  ensure(ids: Iterable<string>): void;
}

/** Dispatched to open editors when ticket data arrives, so inline previews repaint. */
export const ticketsChanged = StateEffect.define<null>();

// Obsidian's markdown tree is flat, with node names built from token classes
// (e.g. "formatting_formatting-code_inline-code", "hmd-internal-link", "string_url").
const SKIPPED_NODE = /code|link|url|frontmatter|tag|math|comment/;

function isSkippedContext(view: EditorView, pos: number): boolean {
  for (let node = syntaxTree(view.state).resolveInner(pos, 1); node.parent; node = node.parent) {
    if (SKIPPED_NODE.test(node.type.name)) return true;
  }
  return false;
}

/**
 * Status + title chip. It replaces the ID on screen only, and only while the selection is
 * elsewhere: touching it reveals the plain editable ID, as Live Preview does for links.
 * One element rather than pieces around the text, because CodeMirror separates adjacent
 * widgets and text with zero-width buffers that let a pieced-together chip break across lines.
 */
class ChipWidget extends WidgetType {
  constructor(private id: string, private inline: InlineView) {
    super();
  }

  eq(other: ChipWidget): boolean {
    return other.id === this.id && other.inline.stateType === this.inline.stateType && other.inline.title === this.inline.title;
  }

  toDOM(view: EditorView): HTMLElement {
    const el = view.dom.ownerDocument.createElement("span");
    renderTicket(el, this.id, this.inline);
    return el;
  }

  // Let Mod-click reach the handler below; a plain click lands the cursor beside the chip, revealing the ID.
  ignoreEvent(): boolean {
    return false;
  }
}

function buildDecorations(view: EditorView, host: TicketHost): DecorationSet {
  const regex = host.getRegex();
  if (!regex) return Decoration.none;

  // Source mode shows the file as written; previews are a Live Preview feature.
  const mode = view.state.field(editorLivePreviewField, false) ? host.inlineMode() : "off";
  const selection = view.state.selection.ranges;
  const ranges: Range<Decoration>[] = [];
  const seen = new Set<string>();

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);
    for (const match of text.matchAll(regex)) {
      const id = match[0];
      const start = from + match.index;
      const end = start + id.length;
      if (isSkippedContext(view, start)) continue;

      seen.add(id);
      const inline = inlineViewOf(host.peek(id), mode);
      const touched = selection.some((range) => range.from <= end && range.to >= start);
      if (inline?.title && !touched) {
        ranges.push(Decoration.replace({ widget: new ChipWidget(id, inline) }).range(start, end));
      } else {
        // A mark keeps the ID as ordinary editable text; the status dot is CSS on the same span.
        ranges.push(Decoration.mark(dotAttributes(id, inline)).range(start, end));
      }
    }
  }

  if (mode !== "off") host.ensure(seen);
  return Decoration.set(ranges, true);
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
        const signalled = update.transactions.some(
          (tr) => tr.reconfigured || tr.effects.some((effect) => effect.is(ticketsChanged)),
        );
        // Chips open and close as the selection reaches them, so title mode also tracks the selection.
        const selected = update.selectionSet && host.inlineMode() === "title";
        if (update.docChanged || update.viewportChanged || reparsed || signalled || selected) {
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
