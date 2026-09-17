import { MarkdownView, Notice, Plugin } from "obsidian";
import { EditorView } from "@codemirror/view";
import { ticketEditorExtension, TicketHost, ticketsChanged } from "./editor";
import { HoverCard, HoverHost } from "./hover";
import { buildTicketRegex, issueUrl, parseTeamKeys } from "./matcher";
import { openExternal } from "./open";
import { linkifyTickets, refreshLinks } from "./reading";
import { LinearTicketsSettingTab } from "./settings";
import { IssueStore } from "./store";
import { CacheEntry, DEFAULT_SETTINGS, InlineMode, LinearTicketsSettings } from "./types";

const INLINE_MODES: InlineMode[] = ["off", "status", "title"];
const INLINE_MODE_NAMES: Record<InlineMode, string> = { off: "off", status: "status only", title: "status + title" };

export default class LinearTicketsPlugin extends Plugin implements TicketHost, HoverHost {
  settings: LinearTicketsSettings = DEFAULT_SETTINGS;
  store!: IssueStore;
  private regex: RegExp | null = null;
  private hoverCard!: HoverCard;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.store = new IssueStore(this.app.vault.adapter, `${this.manifest.dir}/cache.json`, () => this.getApiKey());
    await this.store.load();
    this.register(this.store.onChange((ids) => this.repaint(new Set(ids))));

    this.registerMarkdownPostProcessor((el) => linkifyTickets(el, this));
    this.registerEditorExtension(ticketEditorExtension(this));

    this.hoverCard = new HoverCard(this, this);
    this.hoverCard.attach(document);
    this.registerEvent(this.app.workspace.on("window-open", (win) => this.hoverCard.attach(win.doc)));
    this.app.workspace.onLayoutReady(() => {
      this.app.workspace.iterateAllLeaves((leaf) => this.hoverCard.attach(leaf.view.containerEl.ownerDocument));
    });

    this.addSettingTab(new LinearTicketsSettingTab(this.app, this));
    this.addCommand({
      id: "cycle-inline-preview",
      name: "Cycle inline preview (off → status → status + title)",
      callback: async () => {
        const next = INLINE_MODES[(INLINE_MODES.indexOf(this.settings.inlinePreview) + 1) % INLINE_MODES.length];
        this.settings.inlinePreview = next;
        await this.saveSettings(true);
        new Notice(`Linear inline preview: ${INLINE_MODE_NAMES[next]}`);
      },
    });
    this.addCommand({
      id: "clear-cache",
      name: "Clear ticket cache",
      callback: async () => {
        await this.store.clear();
        new Notice("Linear ticket cache cleared");
      },
    });
  }

  onunload(): void {
    this.hoverCard?.destroy();
    void this.store?.save();
  }

  getRegex(): RegExp | null {
    return this.regex;
  }

  urlFor(id: string): string {
    return issueUrl(this.settings.workspaceSlug, id, this.settings.openIn);
  }

  inlineMode(): InlineMode {
    return this.settings.inlinePreview;
  }

  peek(id: string): CacheEntry | undefined {
    return this.store.peek(id);
  }

  ensure(ids: Iterable<string>): void {
    this.store.ensure(ids);
  }

  /** Ticket data arrived: nudge open editors to rebuild decorations and patch rendered links in place. */
  private repaint(ids: Set<string>): void {
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (!(leaf.view instanceof MarkdownView)) return;
      // `cm` is the editor's CodeMirror view; Obsidian doesn't type it.
      const cm = (leaf.view.editor as unknown as { cm?: EditorView }).cm;
      cm?.dispatch({ effects: ticketsChanged.of(null) });
      refreshLinks(leaf.view.containerEl, ids, this);
    });
  }

  open(id: string): void {
    openExternal(this.urlFor(id));
  }

  async loadSettings(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<LinearTicketsSettings> | null) };
    this.regex = buildTicketRegex(parseTeamKeys(this.settings.teamKeys));
  }

  async saveSettings(rescan = false): Promise<void> {
    await this.saveData(this.settings);
    if (!rescan) return;
    this.regex = buildTicketRegex(parseTeamKeys(this.settings.teamKeys));
    // Forces a reconfigure transaction, which the editor extension treats as a cue to re-scan.
    this.app.workspace.updateOptions();
    // Reading-view links bake their href in at render time.
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      if (leaf.view instanceof MarkdownView) leaf.view.previewMode.rerender(true);
    }
  }

  private getApiKey(): string | null {
    const secretName = this.settings.apiKeySecret;
    return secretName ? this.app.secretStorage.getSecret(secretName) : null;
  }
}
