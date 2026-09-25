export default defineBackground(() => {
  // All listeners are registered synchronously at top level (spec 4).
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') void browser.runtime.openOptionsPage();
  });

  browser.action.onClicked.addListener((tab) => {
    // sidePanel.open needs the live gesture: call it before any await.
    if (tab.windowId !== undefined) void browser.sidePanel.open({ windowId: tab.windowId });
  });
});
