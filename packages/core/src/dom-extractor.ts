/**
 * dom-extractor.ts
 *
 * This module runs INSIDE the browser (content script or page.evaluate).
 * It serialises DOM elements into ElementDescriptor objects that can be
 * passed to the locator engine (which is environment-agnostic).
 *
 * It has NO Node.js or Playwright imports — pure browser APIs only.
 */

import type { ElementDescriptor } from './types.js';

// ---------------------------------------------------------------------------
// ARIA role resolution
// ---------------------------------------------------------------------------

const IMPLICIT_ROLES: Record<string, string> = {
  a: 'link',
  button: 'button',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  img: 'img',
  input: 'textbox', // overridden below by type
  select: 'combobox',
  textarea: 'textbox',
  nav: 'navigation',
  main: 'main',
  header: 'banner',
  footer: 'contentinfo',
  form: 'form',
  table: 'table',
  li: 'listitem',
  ul: 'list',
  ol: 'list',
  checkbox: 'checkbox',
  radio: 'radio',
};

function getImplicitRole(el: Element): string | null {
  const tag = el.tagName.toLowerCase();

  if (tag === 'input') {
    const type = (el as HTMLInputElement).type.toLowerCase();
    const inputRoles: Record<string, string> = {
      checkbox: 'checkbox',
      radio: 'radio',
      button: 'button',
      submit: 'button',
      reset: 'button',
      range: 'slider',
      search: 'searchbox',
      email: 'textbox',
      tel: 'textbox',
      url: 'textbox',
      text: 'textbox',
      password: 'textbox',
      number: 'spinbutton',
    };
    return inputRoles[type] ?? 'textbox';
  }

  return IMPLICIT_ROLES[tag] ?? null;
}

function getRole(el: Element): string | null {
  return el.getAttribute('role') ?? getImplicitRole(el);
}

// ---------------------------------------------------------------------------
// Accessible name computation (simplified, covers 90% of real cases)
// ---------------------------------------------------------------------------

function getAccessibleName(el: Element): string | null {
  // aria-label wins
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel?.trim()) return ariaLabel.trim();

  // aria-labelledby
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const names = labelledBy
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean)
      .join(' ');
    if (names) return names;
  }

  // value attribute for inputs
  if (el instanceof HTMLInputElement && el.type === 'button') {
    return el.value || null;
  }

  // innerText for buttons, links, headings
  const tag = el.tagName.toLowerCase();
  if (['button', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
    const text = el.textContent?.trim();
    return text || null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Label resolution for form controls
// ---------------------------------------------------------------------------

function getLabelText(el: Element): string | null {
  if (!(el instanceof HTMLElement)) return null;

  // id-based label association
  const id = el.id;
  if (id) {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`);
    if (label) return label.textContent?.trim() ?? null;
  }

  // Wrapped label
  const parentLabel = el.closest('label');
  if (parentLabel) {
    // Return label text minus the input's own value
    const clone = parentLabel.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('input, select, textarea').forEach((n) => n.remove());
    const text = clone.textContent?.trim();
    return text || null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// CSS path builder
// ---------------------------------------------------------------------------

function buildCSSPath(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.documentElement) {
    const tag = current.tagName.toLowerCase();
    const id = (current as HTMLElement).id;

    if (id) {
      parts.unshift(`#${CSS.escape(id)}`);
      break;
    }

    const parent: Element | null = current.parentElement;
    if (!parent) break;

    const currentTag = current.tagName;
    const siblings = Array.from(parent.children).filter(
      (c: Element) => c.tagName === currentTag,
    );

    const index = siblings.indexOf(current) + 1;
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
    current = parent;
  }

  return parts.join(' > ');
}

// ---------------------------------------------------------------------------
// XPath builder
// ---------------------------------------------------------------------------

function buildXPath(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const tag = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;

    if (!parent) {
      parts.unshift(`/${tag}`);
      break;
    }

    const currentTag = current.tagName;
    const siblings = Array.from(parent.children).filter(
      (c: Element) => c.tagName === currentTag,
    );
    const index = siblings.indexOf(current) + 1;
    parts.unshift(siblings.length > 1 ? `${tag}[${index}]` : tag);
    current = parent;
  }

  return '//' + parts.join('/');
}

// ---------------------------------------------------------------------------
// Test ID detection (supports data-testid, data-test, data-cy, data-qa)
// ---------------------------------------------------------------------------

const TEST_ID_ATTRS = ['data-testid', 'data-test', 'data-cy', 'data-qa'];

function getTestId(el: Element): string | null {
  for (const attr of TEST_ID_ATTRS) {
    const val = el.getAttribute(attr);
    if (val) return val;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract an ElementDescriptor from a live DOM element.
 * Call this from a content script or page.evaluate().
 */
export function extractDescriptor(el: Element): ElementDescriptor {
  return {
    tagName: el.tagName.toLowerCase(),
    role: getRole(el),
    accessibleName: getAccessibleName(el),
    labelText: getLabelText(el),
    placeholder: el.getAttribute('placeholder'),
    altText: el.getAttribute('alt'),
    title: el.getAttribute('title') ?? null,
    innerText: (el as HTMLElement).innerText?.trim() ?? null,
    testId: getTestId(el),
    id: el.id || null,
    name: el.getAttribute('name'),
    classList: Array.from(el.classList),
    cssPath: buildCSSPath(el),
    xpath: buildXPath(el),
  };
}

/**
 * Extract descriptors for all interactive elements on the current page.
 * Useful for the CLI's "scan page" mode.
 */
export function extractAllInteractive(): ElementDescriptor[] {
  const selector = [
    'a[href]',
    'button',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="tab"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="combobox"]',
    '[role="textbox"]',
    '[role="searchbox"]',
  ].join(', ');

  return Array.from(document.querySelectorAll<Element>(selector))
    .filter((el) => {
      // Skip hidden elements
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    })
    .map(extractDescriptor);
}
