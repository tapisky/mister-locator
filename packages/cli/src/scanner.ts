/**
 * scanner.ts
 *
 * Injects the DOM extractor logic into a Playwright Page and
 * returns the list of ElementDescriptors.
 */

import type { Page } from 'playwright';
import type { ElementDescriptor } from '@mister-locator/core';

/**
 * Runs the element extraction inside the browser context via page.evaluate.
 * We inline the extraction logic here so we don't need a bundler step
 * for the content that gets sent to the browser.
 */
export async function scanPage(page: Page): Promise<ElementDescriptor[]> {
  return page.evaluate(() => {
    // -----------------------------------------------------------------------
    // Inlined extraction logic (mirrors dom-extractor.ts)
    // This runs inside the browser — no imports allowed.
    // -----------------------------------------------------------------------

    const TEST_ID_ATTRS = ['data-testid', 'data-test', 'data-cy', 'data-qa'];
    const IMPLICIT_ROLES: Record<string, string> = {
      a: 'link', button: 'button',
      h1: 'heading', h2: 'heading', h3: 'heading',
      h4: 'heading', h5: 'heading', h6: 'heading',
      img: 'img', select: 'combobox', textarea: 'textbox',
      nav: 'navigation', main: 'main', header: 'banner',
      footer: 'contentinfo', form: 'form', table: 'table',
    };

    function getImplicitRole(el: Element): string | null {
      const tag = el.tagName.toLowerCase();
      if (tag === 'input') {
        const type = (el as HTMLInputElement).type.toLowerCase();
        const map: Record<string, string> = {
          checkbox: 'checkbox', radio: 'radio', button: 'button',
          submit: 'button', reset: 'button', range: 'slider',
          search: 'searchbox', email: 'textbox', tel: 'textbox',
          url: 'textbox', text: 'textbox', password: 'textbox',
          number: 'spinbutton',
        };
        return map[type] ?? 'textbox';
      }
      return IMPLICIT_ROLES[tag] ?? null;
    }

    function getRole(el: Element): string | null {
      return el.getAttribute('role') ?? getImplicitRole(el);
    }

    function getAccessibleName(el: Element): string | null {
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel?.trim()) return ariaLabel.trim();
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const names = labelledBy.split(' ')
          .map(id => document.getElementById(id)?.textContent?.trim())
          .filter(Boolean).join(' ');
        if (names) return names;
      }
      if (el instanceof HTMLInputElement && el.type === 'button') return el.value || null;
      const tag = el.tagName.toLowerCase();
      if (['button', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
        return el.textContent?.trim() || null;
      }
      return null;
    }

    function getLabelText(el: Element): string | null {
      const id = (el as HTMLElement).id;
      if (id) {
        const label = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`);
        if (label) return label.textContent?.trim() ?? null;
      }
      const parentLabel = el.closest('label');
      if (parentLabel) {
        const clone = parentLabel.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('input, select, textarea').forEach(n => n.remove());
        return clone.textContent?.trim() || null;
      }
      return null;
    }

    function buildCSSPath(el: Element): string {
      const parts: string[] = [];
      let current: Element | null = el;
      while (current && current !== document.documentElement) {
        const id = current.id;
        if (id) { parts.unshift(`#${CSS.escape(id)}`); break; }
        const parent: Element | null = current.parentElement;
        if (!parent) break;
        const siblings = Array.from(parent.children).filter((c: Element) => c.tagName === current!.tagName);
        const index = siblings.indexOf(current) + 1;
        const tag = current.tagName.toLowerCase();
        parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
        current = parent;
      }
      return parts.join(' > ');
    }

    function buildXPath(el: Element): string {
      const parts: string[] = [];
      let current: Element | null = el;
      while (current && current.nodeType === Node.ELEMENT_NODE) {
        const tag = current.tagName.toLowerCase();
        const parent: Element | null = current.parentElement;
        if (!parent) { parts.unshift(`/${tag}`); break; }
        const siblings = Array.from(parent.children).filter(c => c.tagName === current!.tagName);
        const index = siblings.indexOf(current) + 1;
        parts.unshift(siblings.length > 1 ? `${tag}[${index}]` : tag);
        current = parent;
      }
      return '//' + parts.join('/');
    }

    function getTestId(el: Element): string | null {
      for (const attr of TEST_ID_ATTRS) {
        const val = el.getAttribute(attr);
        if (val) return val;
      }
      return null;
    }

    const selector = [
      'a[href]', 'button', 'input:not([type="hidden"])',
      'select', 'textarea', '[role="button"]', '[role="link"]',
      '[role="menuitem"]', '[role="tab"]', '[role="checkbox"]',
      '[role="radio"]', '[role="combobox"]', '[role="textbox"]', '[role="searchbox"]',
    ].join(', ');

    return Array.from(document.querySelectorAll<Element>(selector))
      .filter(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      })
      .map(el => ({
        tagName: el.tagName.toLowerCase(),
        role: getRole(el),
        accessibleName: getAccessibleName(el),
        labelText: getLabelText(el),
        placeholder: el.getAttribute('placeholder'),
        altText: el.getAttribute('alt'),
        title: el.getAttribute('title') ?? null,
        innerText: (el as HTMLElement).innerText?.trim() ?? null,
        testId: getTestId(el),
        id: (el as HTMLElement).id || null,
        name: el.getAttribute('name'),
        classList: Array.from(el.classList),
        cssPath: buildCSSPath(el),
        xpath: buildXPath(el),
      }));
  });
}
