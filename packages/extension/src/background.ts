/**
 * background.ts — Service worker
 *
 * - Relays START_PICKING to the content script (injecting it first if needed)
 * - Stores the last locator result
 * - Reopens the popup when a result arrives
 */

interface StoredState {
  lastResult: unknown | null;
  isPicking: boolean;
}

const state: StoredState = {
  lastResult: null,
  isPicking: false,
};

async function injectContentScriptIfNeeded(tabId: number): Promise<void> {
  try {
    // Ping the content script — if it responds, it's already injected
    await chrome.tabs.sendMessage(tabId, { type: 'PING' });
  } catch {
    // Not injected yet — inject it now
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['dist/content.js'],
    });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {

    case 'START_PICKING':
      state.isPicking = true;
      // Get active tab and inject+start picking
      chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
        if (!tab?.id) return;
        await injectContentScriptIfNeeded(tab.id);
        await chrome.tabs.sendMessage(tab.id, { type: 'START_PICKING' });
      });
      break;

    case 'STOP_PICKING':
      state.isPicking = false;
      chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
        if (!tab?.id) return;
        await chrome.tabs.sendMessage(tab.id, { type: 'STOP_PICKING' }).catch(() => {});
      });
      break;

    case 'LOCATOR_RESULT':
      state.lastResult = message.payload;
      state.isPicking = false;
      // Re-open the popup to show the result
      chrome.action.openPopup().catch(() => {
        // openPopup() can fail if not triggered by a user gesture in some Chrome versions
        // The result is still stored and will show when user clicks the icon
      });
      break;

    case 'PICKING_STARTED':
      state.isPicking = true;
      break;

    case 'PICKING_STOPPED':
      state.isPicking = false;
      break;

    case 'GET_STATE':
      sendResponse(state);
      return true;
  }
});
