import { Platform } from "obsidian";

interface ElectronModule {
  shell: { openExternal(url: string): Promise<void> };
}

/**
 * Obsidian's link handling only promises to route http(s) and file URLs, so on
 * desktop a custom scheme like linear:// goes to the OS through Electron directly.
 */
export function openExternal(url: string): void {
  if (Platform.isDesktopApp) {
    const { shell } = (window as unknown as { require(id: "electron"): ElectronModule }).require("electron");
    void shell.openExternal(url);
  } else {
    window.open(url);
  }
}
