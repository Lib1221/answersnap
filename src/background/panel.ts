// The answer workspace is Chrome's side panel, or the sidebar in Firefox (WXT turns the side panel
// entrypoint into a `sidebar_action` there). Both only open inside a user gesture, so call this
// before any await.

interface FirefoxSidebar {
  sidebarAction?: { open(): Promise<void> };
}

export function openPanel(windowId: number): Promise<unknown> {
  if (browser.sidePanel?.open) return browser.sidePanel.open({ windowId });
  const sidebar = (browser as unknown as FirefoxSidebar).sidebarAction;
  return sidebar ? sidebar.open() : Promise.resolve();
}

/** Chrome only: the toolbar icon starts a snip instead of opening the panel. */
export function configurePanel(): void {
  void browser.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false });
}
