import type {
  ElementDescriptor,
  LocatorResult,
  LocatorStrategy,
  ResolvedLocator,
} from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escape(value: string): string {
  // Escape single quotes for use inside JS string literals
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function truncate(value: string, max = 50): string {
  return value.length > max ? value.slice(0, max).trimEnd() + '…' : value;
}

function isInteractive(tagName: string): boolean {
  return ['button', 'a', 'input', 'select', 'textarea', 'summary'].includes(
    tagName.toLowerCase(),
  );
}

// ---------------------------------------------------------------------------
// Candidate builders
// Each builder returns a ResolvedLocator or null if not applicable.
// ---------------------------------------------------------------------------

function tryGetByRole(d: ElementDescriptor): ResolvedLocator | null {
  if (!d.role || !d.accessibleName) return null;

  // Only emit getByRole for meaningful ARIA roles
  const ignoredRoles = ['none', 'presentation', 'generic'];
  if (ignoredRoles.includes(d.role)) return null;

  const name = truncate(d.accessibleName);
  const expression = `page.getByRole('${escape(d.role)}', { name: '${escape(name)}' })`;
  return { expression, strategy: 'getByRole', confidence: 95 };
}

function tryGetByLabel(d: ElementDescriptor): ResolvedLocator | null {
  if (!d.labelText) return null;
  const expression = `page.getByLabel('${escape(truncate(d.labelText))}')`;
  return { expression, strategy: 'getByLabel', confidence: 90 };
}

function tryGetByPlaceholder(d: ElementDescriptor): ResolvedLocator | null {
  if (!d.placeholder) return null;
  const expression = `page.getByPlaceholder('${escape(d.placeholder)}')`;
  return { expression, strategy: 'getByPlaceholder', confidence: 85 };
}

function tryGetByAltText(d: ElementDescriptor): ResolvedLocator | null {
  if (!d.altText) return null;
  const expression = `page.getByAltText('${escape(d.altText)}')`;
  return { expression, strategy: 'getByAltText', confidence: 80 };
}

function tryGetByTitle(d: ElementDescriptor): ResolvedLocator | null {
  if (!d.title) return null;
  const expression = `page.getByTitle('${escape(d.title)}')`;
  return { expression, strategy: 'getByTitle', confidence: 75 };
}

function tryGetByText(d: ElementDescriptor): ResolvedLocator | null {
  if (!d.innerText) return null;

  // Avoid using long or dynamic-looking text
  const text = d.innerText.trim();
  if (text.length === 0 || text.length > 80) return null;

  // Prefer exact match only for short, clearly static strings
  const exact = text.length < 40;
  const expression = exact
    ? `page.getByText('${escape(text)}', { exact: true })`
    : `page.getByText('${escape(truncate(text, 40))}')`;

  return { expression, strategy: 'getByText', confidence: 70 };
}

function tryGetByTestId(d: ElementDescriptor): ResolvedLocator | null {
  if (!d.testId) return null;
  const expression = `page.getByTestId('${escape(d.testId)}')`;
  return { expression, strategy: 'getByTestId', confidence: 88 };
}

function tryCSS(d: ElementDescriptor): ResolvedLocator | null {
  // Prefer id-based CSS selectors
  if (d.id) {
    return {
      expression: `page.locator('#${CSS.escape(d.id)}')`,
      strategy: 'css',
      confidence: 60,
    };
  }
  if (d.cssPath) {
    return {
      expression: `page.locator('${escape(d.cssPath)}')`,
      strategy: 'css',
      confidence: 30,
    };
  }
  return null;
}

function tryXPath(d: ElementDescriptor): ResolvedLocator | null {
  if (!d.xpath) return null;
  return {
    expression: `page.locator('xpath=${escape(d.xpath)}')`,
    strategy: 'xpath',
    confidence: 20,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const BUILDERS: Array<(d: ElementDescriptor) => ResolvedLocator | null> = [
  tryGetByRole,
  tryGetByLabel,
  tryGetByPlaceholder,
  tryGetByTestId,
  tryGetByAltText,
  tryGetByTitle,
  tryGetByText,
  tryCSS,
  tryXPath,
];

/**
 * Given an ElementDescriptor (extracted from the DOM), returns a ranked list
 * of Playwright locators from most to least resilient.
 */
export function resolveLocators(descriptor: ElementDescriptor): LocatorResult {
  const candidates: ResolvedLocator[] = [];

  for (const builder of BUILDERS) {
    const result = builder(descriptor);
    if (result) candidates.push(result);
  }

  // Sort by confidence descending
  candidates.sort((a, b) => b.confidence - a.confidence);

  // Always guarantee at least one fallback
  if (candidates.length === 0) {
    candidates.push({
      expression: `page.locator('${escape(descriptor.cssPath || descriptor.tagName)}')`,
      strategy: 'css' as LocatorStrategy,
      confidence: 10,
    });
  }

  const best = candidates[0]!;

  return { descriptor, locators: candidates, best };
}

/**
 * Resolve locators for multiple elements.
 */
export function resolveAll(descriptors: ElementDescriptor[]): LocatorResult[] {
  return descriptors.map(resolveLocators);
}
