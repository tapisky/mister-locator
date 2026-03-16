/**
 * popup.ts — Popup UI logic
 *
 * Flow:
 * 1. User clicks "Pick element" → popup tells background → background injects
 *    content script and starts pick mode → popup closes (Chrome behaviour)
 * 2. User clicks element on page → content script sends LOCATOR_RESULT to background
 * 3. Background stores result and calls chrome.action.openPopup()
 * 4. Popup opens, fetches stored state from background, renders result
 */

import type { LocatorResult } from '@mister-locator/core';

const pickBtn = document.getElementById('pick-btn') as HTMLButtonElement;
const stateMessage = document.getElementById('state-message') as HTMLDivElement;
const resultsEl = document.getElementById('results') as HTMLDivElement;

// ---------------------------------------------------------------------------
// On open: always check background state first
// ---------------------------------------------------------------------------
chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
  if (chrome.runtime.lastError) return; // popup opened too early

  if (state?.isPicking) {
    // We're in pick mode — user reopened popup while picking
    setPickingState();
  } else if (state?.lastResult) {
    // A result is waiting
    renderResult(state.lastResult as LocatorResult);
  }
});

// ---------------------------------------------------------------------------
// Pick button — delegates everything to the background
// ---------------------------------------------------------------------------
pickBtn.addEventListener('click', async () => {
  if (pickBtn.classList.contains('active')) {
    chrome.runtime.sendMessage({ type: 'STOP_PICKING' });
    setIdleState();
  } else {
    setPickingState();
    chrome.runtime.sendMessage({ type: 'START_PICKING' });
    // Note: Chrome will close the popup when focus moves to the page.
    // The background will reopen it once a result arrives.
  }
});

// ---------------------------------------------------------------------------
// Listen for results pushed from background while popup is open
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'LOCATOR_RESULT') {
    renderResult(message.payload as LocatorResult);
  }
});

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------
function setPickingState(): void {
  pickBtn.textContent = 'Cancel (Esc)';
  pickBtn.classList.add('active');
  stateMessage.textContent = 'Click any element on the page…';
  resultsEl.hidden = true;
}

function setIdleState(): void {
  pickBtn.textContent = 'Pick element';
  pickBtn.classList.remove('active');
}

// ---------------------------------------------------------------------------
// Render results
// ---------------------------------------------------------------------------
function renderResult(result: LocatorResult): void {
  setIdleState();

  const best = result.best;
  const alternatives = result.locators.slice(1);

  const confidenceClass =
    best.confidence >= 80 ? 'confidence-high'
    : best.confidence >= 50 ? 'confidence-mid'
    : 'confidence-low';

  resultsEl.innerHTML = `
    <div class="best-locator">
      <div class="label">Best locator</div>
      <div class="locator-code">${escapeHTML(best.expression)}</div>
      <div class="meta">
        <span class="badge">${escapeHTML(best.strategy)}</span>
        <span class="badge ${confidenceClass}">${best.confidence}% confidence</span>
        <button id="copy-btn">Copy</button>
      </div>
    </div>
    ${alternatives.length > 0 ? `
      <div class="alternatives-title">Alternatives</div>
      ${alternatives.map(alt => `
        <div class="alt-item" data-expression="${escapeHTML(alt.expression)}">
          <div class="locator-code">${escapeHTML(alt.expression)}</div>
          <div class="meta">
            <span class="badge">${escapeHTML(alt.strategy)}</span>
            <span class="badge">${alt.confidence}%</span>
          </div>
        </div>
      `).join('')}
    ` : ''}
  `;

  resultsEl.hidden = false;
  stateMessage.textContent = `Found ${result.locators.length} locator${result.locators.length !== 1 ? 's' : ''}. Pick another or copy.`;

  document.getElementById('copy-btn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(best.expression).then(() => {
      const btn = document.getElementById('copy-btn');
      if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 1500); }
    });
  });

  document.querySelectorAll<HTMLElement>('.alt-item').forEach(el => {
    el.addEventListener('click', () => {
      const expr = el.dataset['expression'];
      if (expr) navigator.clipboard.writeText(expr);
    });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
