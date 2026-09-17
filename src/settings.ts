import { App, PluginSettingTab, SecretComponent, Setting } from "obsidian";
import type LinearTicketsPlugin from "./main";

export class LinearTicketsSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: LinearTicketsPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl, plugin } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Linear API key")
      .setDesc(
        "A personal API key (Linear → Settings → Security & access). Kept in Obsidian's secret storage, not in the plugin's synced data, so set it on each device.",
      )
      .addComponent((el) =>
        new SecretComponent(this.app, el).setValue(plugin.settings.apiKeySecret).onChange(async (secretName) => {
          plugin.settings.apiKeySecret = secretName;
          await plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Open tickets in")
      .setDesc("The desktop app needs Linear installed on this device.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("browser", "Browser")
          .addOption("app", "Linear desktop app")
          .setValue(plugin.settings.openIn)
          .onChange(async (value) => {
            plugin.settings.openIn = value === "app" ? "app" : "browser";
            await plugin.saveSettings(true);
          }),
      );

    new Setting(containerEl)
      .setName("Workspace URL slug")
      .setDesc("The part after linear.app/ in your ticket URLs. Required for links to resolve.")
      .addText((text) =>
        text.setPlaceholder("acme").setValue(plugin.settings.workspaceSlug).onChange(async (value) => {
          plugin.settings.workspaceSlug = value.trim();
          await plugin.saveSettings(true);
        }),
      );

    new Setting(containerEl)
      .setName("Team keys")
      .setDesc("Ticket prefixes to link, comma-separated. ENG links ENG-123 and leaves ADR-0003 alone. Nothing is linked until this is set.")
      .addText((text) =>
        text.setPlaceholder("ENG, OPS").setValue(plugin.settings.teamKeys).onChange(async (value) => {
          plugin.settings.teamKeys = value;
          await plugin.saveSettings(true);
        }),
      );

    new Setting(containerEl)
      .setName("Hover delay")
      .setDesc("Milliseconds the pointer rests on a ticket before its card opens.")
      .addSlider((slider) =>
        slider
          .setLimits(0, 1000, 50)
          .setValue(plugin.settings.hoverDelayMs)
          .setDynamicTooltip()
          .onChange(async (value) => {
            plugin.settings.hoverDelayMs = value;
            await plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Show description")
      .setDesc("Include the opening lines of the ticket description in the card.")
      .addToggle((toggle) =>
        toggle.setValue(plugin.settings.showDescription).onChange(async (value) => {
          plugin.settings.showDescription = value;
          await plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Ticket cache")
      .setDesc("Open tickets refresh after 15 minutes, finished ones after a day.")
      .addButton((button) =>
        button.setButtonText("Clear cache").onClick(async () => {
          await plugin.store.clear();
          button.setButtonText("Cleared");
        }),
      );
  }
}
