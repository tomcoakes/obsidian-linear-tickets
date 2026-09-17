import { Plugin, setIcon } from "obsidian";
import { IssueStore } from "./store";
import { CacheEntry, LinearError, LinearIssue, LinearTicketsSettings, TICKET_ATTR, TICKET_CLASS } from "./types";

const HIDE_DELAY_MS = 150;
const GAP_PX = 6;
const EDGE_PX = 8;
const EXCERPT_CHARS = 220;
const CARD_ID = "linear-ticket-card";

const ERROR_TEXT: Record<LinearError["kind"], string> = {
  "no-key": "Add a Linear API key in Settings → Linear Tickets to see ticket details.",
  auth: "Linear rejected the API key. Check it in Settings → Linear Tickets.",
  "rate-limit": "Linear's rate limit was reached. Try again shortly.",
  network: "Couldn't reach Linear.",
};

export interface HoverHost {
  settings: LinearTicketsSettings;
  store: IssueStore;
  urlFor(id: string): string;
  open(id: string): void;
}

/** One floating card shared by every ticket, driven by delegated events so both render paths need no wiring. */
export class HoverCard {
  private cardEl: HTMLElement | null = null;
  private anchorEl: HTMLElement | null = null;
  private anchorRect: DOMRect | null = null;
  private currentId: string | null = null;
  private showTimer: number | null = null;
  private hideTimer: number | null = null;
  private attached = new WeakSet<Document>();

  constructor(private plugin: Plugin, private host: HoverHost) {}

  /** Popout windows have their own document, so each one needs its own listeners. */
  attach(doc: Document): void {
    if (this.attached.has(doc)) return;
    this.attached.add(doc);

    const { plugin } = this;
    plugin.registerDomEvent(doc, "mouseover", (e) => this.onEnter(e.target));
    plugin.registerDomEvent(doc, "mouseout", (e) => this.onLeave(e.relatedTarget));
    plugin.registerDomEvent(doc, "focusin", (e) => this.onEnter(e.target, 0));
    plugin.registerDomEvent(doc, "focusout", (e) => this.onLeave(e.relatedTarget));
    plugin.registerDomEvent(doc, "click", (e) => this.onClick(e));
    plugin.registerDomEvent(doc, "keydown", (e) => e.key === "Escape" && this.hide());
    plugin.registerDomEvent(doc, "mousedown", (e) => !this.isInCard(e.target) && this.hide());
    plugin.registerDomEvent(doc, "scroll", (e) => !this.isInCard(e.target) && this.hide(), { capture: true });
  }

  destroy(): void {
    this.hide();
  }

  private onEnter(target: EventTarget | null, delay = this.host.settings.hoverDelayMs): void {
    if (this.isInCard(target)) return this.clearTimer("hideTimer");

    const ticket = (target as Element | null)?.closest?.<HTMLElement>(`.${TICKET_CLASS}`);
    const id = ticket?.getAttribute(TICKET_ATTR);
    if (!ticket || !id) return;

    this.clearTimer("hideTimer");
    if (this.cardEl && this.currentId === id) {
      // Editor marks can be split across spans; sliding between them is still the same ticket.
      this.anchorEl = ticket;
      return;
    }
    this.clearTimer("showTimer");
    this.showTimer = window.setTimeout(() => this.show(ticket, id), delay);
  }

  private onLeave(movedTo: EventTarget | null): void {
    if (this.isInCard(movedTo)) return;
    const next = (movedTo as Element | null)?.closest?.(`.${TICKET_CLASS}`);
    if (next && next.getAttribute(TICKET_ATTR) === this.currentId) return;

    this.clearTimer("showTimer");
    this.clearTimer("hideTimer");
    this.hideTimer = window.setTimeout(() => this.hide(), HIDE_DELAY_MS);
  }

  /** Browser links are left to Obsidian; a linear:// href needs opening by hand (see openExternal). */
  private onClick(event: MouseEvent): void {
    if (this.host.settings.openIn !== "app") return;
    const link = (event.target as Element | null)?.closest?.(`a.${TICKET_CLASS}, a.linear-ticket-card__title`);
    const id = link?.getAttribute(TICKET_ATTR);
    if (!id) return;
    event.preventDefault();
    this.host.open(id);
  }

  private show(anchor: HTMLElement, id: string): void {
    if (!anchor.isConnected) return;
    this.hide();
    this.anchorEl = anchor;
    this.currentId = id;
    this.cardEl = anchor.ownerDocument.body.createDiv({
      cls: "linear-ticket-card",
      attr: { id: CARD_ID, role: "tooltip" },
    });
    anchor.setAttribute("aria-describedby", CARD_ID);

    const { store } = this.host;
    const cached = store.peek(id);
    if (cached) this.renderEntry(id, cached);
    else this.renderMessage(id, "Loading…", "is-loading");

    if (cached && store.isFresh(cached)) return;
    store
      .refresh(id)
      .then((entry) => this.currentId === id && this.renderEntry(id, entry))
      .catch((error: unknown) => {
        // A stale card beats an error message, so only surface failures when there's nothing to show.
        if (this.currentId !== id || cached) return;
        const kind = error instanceof LinearError ? error.kind : "network";
        this.renderMessage(id, ERROR_TEXT[kind], "is-error");
      });
  }

  private hide(): void {
    this.clearTimer("showTimer");
    this.clearTimer("hideTimer");
    this.anchorEl?.removeAttribute("aria-describedby");
    this.cardEl?.remove();
    this.cardEl = this.anchorEl = this.anchorRect = this.currentId = null;
  }

  private renderEntry(id: string, entry: CacheEntry): void {
    if (entry.issue) this.renderIssue(entry.issue);
    else this.renderMessage(id, `No ticket ${id} in Linear.`, "is-error");
  }

  private renderMessage(id: string, message: string, cls: string): void {
    const card = this.cardEl;
    if (!card) return;
    card.empty();
    card.createDiv({ cls: "linear-ticket-card__header" }).createSpan({ cls: "linear-ticket-card__id", text: id });
    card.createDiv({ cls: `linear-ticket-card__message ${cls}`, text: message });
    this.position();
  }

  private renderIssue(issue: LinearIssue): void {
    const card = this.cardEl;
    if (!card) return;
    card.empty();

    const header = card.createDiv({ cls: "linear-ticket-card__header" });
    const state = header.createSpan({ cls: "linear-ticket-card__state", attr: { "data-state-type": issue.state.type } });
    state.createSpan({ cls: "linear-ticket-card__dot" });
    state.createSpan({ text: issue.state.name });
    header.createSpan({ cls: "linear-ticket-card__id", text: issue.identifier });
    if (issue.priority > 0) {
      const priority = header.createSpan({
        cls: "linear-ticket-card__priority",
        attr: { "data-priority": String(issue.priority) },
      });
      const bars = priority.createSpan({ cls: "linear-ticket-card__bars" });
      for (let bar = 0; bar < 3; bar++) bars.createSpan();
      priority.createSpan({ text: issue.priorityLabel });
    }

    const title = card.createEl("a", {
      cls: "linear-ticket-card__title",
      href: this.host.urlFor(issue.identifier),
      attr: { [TICKET_ATTR]: issue.identifier, target: "_blank", rel: "noopener" },
    });
    appendWithInlineCode(title, issue.title);

    const excerpt = this.host.settings.showDescription ? excerptOf(issue.description) : "";
    if (excerpt) card.createDiv({ cls: "linear-ticket-card__description", text: excerpt });

    if (issue.labels.length > 0) {
      const labels = card.createDiv({ cls: "linear-ticket-card__labels" });
      for (const label of issue.labels) labels.createSpan({ text: label });
    }

    const footer = card.createDiv({ cls: "linear-ticket-card__footer" });
    const context = footer.createDiv({ cls: "linear-ticket-card__context" });
    if (issue.assignee) {
      context.createSpan({ cls: "linear-ticket-card__avatar", text: initialsOf(issue.assignee) });
      context.createSpan({ cls: "linear-ticket-card__person", text: issue.assignee });
    } else {
      context.createSpan({ cls: "linear-ticket-card__person is-unassigned", text: "Unassigned" });
    }
    if (issue.project) {
      const project = context.createSpan({ cls: "linear-ticket-card__project" });
      setIcon(project.createSpan({ cls: "linear-ticket-card__project-icon" }), "box");
      project.createSpan({ text: issue.project });
    }
    footer.createSpan({ cls: "linear-ticket-card__time", text: ageOf(issue.updatedAt) });

    this.position();
  }

  /** Below the ticket by default, flipped above when there's no room, clamped to the window. */
  private position(): void {
    const card = this.cardEl;
    const anchor = this.anchorEl;
    if (!card || !anchor) return;

    // Arriving data can make the editor re-create the ticket's element; a detached one reports a zero rect.
    if (anchor.isConnected || !this.anchorRect) this.anchorRect = anchor.getBoundingClientRect();
    const win = anchor.ownerDocument.defaultView ?? window;
    const rect = this.anchorRect;
    const { offsetWidth: width, offsetHeight: height } = card;

    const below = rect.bottom + GAP_PX;
    const above = rect.top - GAP_PX - height;
    const top = below + height > win.innerHeight - EDGE_PX && above >= EDGE_PX ? above : below;
    const left = Math.max(EDGE_PX, Math.min(rect.left, win.innerWidth - width - EDGE_PX));

    card.style.top = `${Math.round(top)}px`;
    card.style.left = `${Math.round(left)}px`;
  }

  private isInCard(target: EventTarget | null): boolean {
    return Boolean(this.cardEl && target && this.cardEl.contains(target as Node));
  }

  private clearTimer(name: "showTimer" | "hideTimer"): void {
    const timer = this[name];
    if (timer !== null) window.clearTimeout(timer);
    this[name] = null;
  }
}

const AGE_UNITS: [string, number][] = [
  ["y", 31_536_000],
  ["mo", 2_592_000],
  ["w", 604_800],
  ["d", 86_400],
  ["h", 3_600],
  ["m", 60],
];

/** Compact age ("34m ago") so the footer stays on one line. */
function ageOf(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const unit = AGE_UNITS.find(([, size]) => seconds >= size);
  return unit ? `${Math.floor(seconds / unit[1])}${unit[0]} ago` : "just now";
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return letters.map((word) => word.charAt(0).toUpperCase()).join("");
}

/** Linear titles often carry `inline code`; render it rather than showing the backticks. */
function appendWithInlineCode(el: HTMLElement, text: string): void {
  text.split(/`([^`]+)`/).forEach((part, index) => {
    if (!part) return;
    if (index % 2 === 1) el.createEl("code", { text: part });
    else el.appendText(part);
  });
}

/**
 * Plain-text excerpt of the opening prose. Headings are dropped rather than flattened in,
 * since run together with the body they read as a broken sentence.
 */
function excerptOf(markdown: string | null): string {
  if (!markdown) return "";
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s{0,3}#{1,6}\s.*$/gm, " ")
    .replace(/^\s*\*\*[^*\n]+\*\*\s*$/gm, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(?:>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/\[[ xX]\]\s*/g, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= EXCERPT_CHARS) return text;
  const wordBreak = text.lastIndexOf(" ", EXCERPT_CHARS);
  return `${text.slice(0, wordBreak > 0 ? wordBreak : EXCERPT_CHARS)}…`;
}
