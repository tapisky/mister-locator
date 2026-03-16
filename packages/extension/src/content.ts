/**
 * content.ts — Mister Locator content script
 *
 * Guards against double-injection via a global flag.
 */

import { extractDescriptor, resolveLocators } from '@mister-locator/core';

if (!(window as any).__misterLocatorInjected) {
  (window as any).__misterLocatorInjected = true;

  let isPicking = false;
  let highlightOverlay: HTMLElement | null = null;
  let tooltip: HTMLElement | null = null;
  let currentTarget: Element | null = null;

  // -------------------------------------------------------------------------
  // Overlay + tooltip
  // -------------------------------------------------------------------------
  function createOverlay(): HTMLElement {
    const existing = document.getElementById('__mister-locator-overlay__');
    if (existing) return existing;

    const el = document.createElement('div');
    el.id = '__mister-locator-overlay__';
    Object.assign(el.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483646',
      border: '2px solid #6366f1',
      backgroundColor: 'rgba(99, 102, 241, 0.15)',
      borderRadius: '3px',
      boxShadow: '0 0 0 2px rgba(99,102,241,0.4), inset 0 0 0 1px rgba(99,102,241,0.2)',
      display: 'none',
      transition: 'top 40ms ease, left 40ms ease, width 40ms ease, height 40ms ease',
    });
    document.documentElement.appendChild(el);
    return el;
  }

  function createTooltip(): HTMLElement {
    const existing = document.getElementById('__mister-locator-tooltip__');
    if (existing) return existing;

    const el = document.createElement('div');
    el.id = '__mister-locator-tooltip__';
    Object.assign(el.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483647',
      background: '#1a1a24',
      color: '#c4b5fd',
      border: '1px solid #6366f1',
      borderRadius: '4px',
      padding: '3px 8px',
      fontSize: '11px',
      fontFamily: 'monospace',
      whiteSpace: 'nowrap',
      display: 'none',
      maxWidth: '320px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    });
    document.documentElement.appendChild(el);
    return el;
  }

  function updateOverlay(target: Element): void {
    if (!highlightOverlay || !tooltip) return;

    const rect = target.getBoundingClientRect();

    // Don't highlight tiny or zero-size elements
    if (rect.width === 0 && rect.height === 0) return;

    Object.assign(highlightOverlay.style, {
      top: `${rect.top + window.scrollY}px`,
      left: `${rect.left + window.scrollX}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      display: 'block',
      position: 'absolute', // use absolute so it stays with scroll
    });

    // Build a quick preview of the best locator for the tooltip
    const tag = target.tagName.toLowerCase();
    const role = target.getAttribute('role');
    const ariaLabel = target.getAttribute('aria-label');
    const id = (target as HTMLElement).id;
    const testId = target.getAttribute('data-testid') ?? target.getAttribute('data-cy');
    const text = (target as HTMLElement).innerText?.trim().slice(0, 40);

    let hint = `<${tag}>`;
    if (id) hint = `#${id}`;
    else if (testId) hint = `[data-testid="${testId}"]`;
    else if (ariaLabel) hint = `${tag}[aria-label="${ariaLabel}"]`;
    else if (role) hint = `${tag}[role="${role}"]`;
    else if (text) hint = `${tag} "${text}"`;

    tooltip.textContent = hint;

    // Position tooltip above the element, or below if not enough space
    const tooltipHeight = 24;
    const gap = 6;
    let tooltipTop = rect.top + window.scrollY - tooltipHeight - gap;
    if (tooltipTop < window.scrollY) {
      tooltipTop = rect.bottom + window.scrollY + gap;
    }

    Object.assign(tooltip.style, {
      top: `${tooltipTop}px`,
      left: `${Math.max(4, rect.left + window.scrollX)}px`,
      display: 'block',
      position: 'absolute',
    });
  }

  function hideHighlight(): void {
    if (highlightOverlay) highlightOverlay.style.display = 'none';
    if (tooltip) tooltip.style.display = 'none';
  }

  function removeHighlight(): void {
    highlightOverlay?.remove();
    highlightOverlay = null;
    tooltip?.remove();
    tooltip = null;
  }

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------
  function onMouseMove(e: MouseEvent): void {
    const target = e.target as Element;
    if (
      target.id === '__mister-locator-overlay__' ||
      target.id === '__mister-locator-tooltip__'
    ) return;
    currentTarget = target;
    updateOverlay(target);
  }

  function onMouseClick(e: MouseEvent): void {
    e.preventDefault();
    e.stopImmediatePropagation();

    if (!currentTarget) return;

    const descriptor = extractDescriptor(currentTarget);
    const result = resolveLocators(descriptor);

    chrome.runtime.sendMessage({ type: 'LOCATOR_RESULT', payload: result });
    stopPicking();
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      stopPicking();
      chrome.runtime.sendMessage({ type: 'PICKING_STOPPED' });
    }
  }

  // -------------------------------------------------------------------------
  // Start / stop
  // -------------------------------------------------------------------------
  function startPicking(): void {
    if (isPicking) return;
    isPicking = true;

    highlightOverlay = createOverlay();
    tooltip = createTooltip();

    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onMouseClick, true);
    document.addEventListener('keydown', onKeyDown, true);

    document.body.style.cursor = 'crosshair';
  }

  function stopPicking(): void {
    if (!isPicking) return;
    isPicking = false;

    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onMouseClick, true);
    document.removeEventListener('keydown', onKeyDown, true);

    document.body.style.cursor = '';
    removeHighlight();
  }

  // -------------------------------------------------------------------------
  // Message listener
  // -------------------------------------------------------------------------
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.type) {
      case 'PING':
        sendResponse({ alive: true });
        break;
      case 'START_PICKING':
        startPicking();
        break;
      case 'STOP_PICKING':
        stopPicking();
        break;
    }
    return true;
  });
}
