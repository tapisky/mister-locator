import type { ElementDescriptor } from '../src/types.js';

/**
 * Returns a blank ElementDescriptor with all nullable fields set to null.
 * Override only the fields relevant to each test — keeps tests focused.
 */
export function descriptor(overrides: Partial<ElementDescriptor> = {}): ElementDescriptor {
  return {
    tagName: 'div',
    role: null,
    accessibleName: null,
    labelText: null,
    placeholder: null,
    altText: null,
    title: null,
    innerText: null,
    testId: null,
    id: null,
    name: null,
    classList: [],
    cssPath: 'div',
    xpath: '//div',
    ...overrides,
  };
}
