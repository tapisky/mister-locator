import { describe, it, expect } from 'vitest';
import { resolveLocators, resolveAll } from '../src/locator-engine.js';
import { descriptor } from './helpers.js';

// ---------------------------------------------------------------------------
// Strategy selection — best locator chosen correctly
// ---------------------------------------------------------------------------

describe('strategy selection', () => {
  it('prefers getByRole when role + accessible name are present', () => {
    const result = resolveLocators(descriptor({
      tagName: 'button',
      role: 'button',
      accessibleName: 'Submit',
    }));
    expect(result.best.strategy).toBe('getByRole');
    expect(result.best.expression).toBe(`page.getByRole('button', { name: 'Submit' })`);
  });

  it('prefers getByLabel over getByPlaceholder', () => {
    const result = resolveLocators(descriptor({
      tagName: 'input',
      role: null,
      accessibleName: null,
      labelText: 'Email address',
      placeholder: 'you@example.com',
    }));
    expect(result.best.strategy).toBe('getByLabel');
  });

  it('prefers getByTestId over getByText', () => {
    const result = resolveLocators(descriptor({
      tagName: 'button',
      testId: 'submit-btn',
      innerText: 'Submit',
    }));
    expect(result.best.strategy).toBe('getByTestId');
  });

  it('falls back to getByPlaceholder when no label', () => {
    const result = resolveLocators(descriptor({
      tagName: 'input',
      placeholder: 'Search…',
    }));
    expect(result.best.strategy).toBe('getByPlaceholder');
  });

  it('falls back to getByAltText for images', () => {
    const result = resolveLocators(descriptor({
      tagName: 'img',
      altText: 'Company logo',
    }));
    expect(result.best.strategy).toBe('getByAltText');
  });

  it('falls back to getByTitle when only title is present', () => {
    const result = resolveLocators(descriptor({
      tagName: 'button',
      title: 'Close dialog',
    }));
    expect(result.best.strategy).toBe('getByTitle');
  });

  it('falls back to getByText for short static text', () => {
    const result = resolveLocators(descriptor({
      tagName: 'a',
      innerText: 'Privacy policy',
    }));
    expect(result.best.strategy).toBe('getByText');
  });

  it('falls back to CSS with id when no semantic attributes', () => {
    const result = resolveLocators(descriptor({
      tagName: 'div',
      id: 'main-container',
      cssPath: '#main-container',
    }));
    expect(result.best.strategy).toBe('css');
    expect(result.best.expression).toContain('#main-container');
  });

  it('falls back to xpath as last resort', () => {
    const result = resolveLocators(descriptor({
      tagName: 'span',
      cssPath: '',
      xpath: '//div/span[2]',
    }));
    expect(result.best.strategy).toBe('xpath');
  });
});

// ---------------------------------------------------------------------------
// Confidence scores — correct ranking
// ---------------------------------------------------------------------------

describe('confidence scores', () => {
  it('getByRole has the highest confidence (95)', () => {
    const result = resolveLocators(descriptor({
      role: 'button',
      accessibleName: 'Sign in',
    }));
    expect(result.best.confidence).toBe(95);
  });

  it('locators are sorted highest confidence first', () => {
    const result = resolveLocators(descriptor({
      tagName: 'input',
      role: 'textbox',
      accessibleName: 'Username',
      labelText: 'Username',
      placeholder: 'Enter username',
      testId: 'username-input',
      cssPath: 'form > input',
      xpath: '//form/input',
    }));

    const confidences = result.locators.map(l => l.confidence);
    for (let i = 1; i < confidences.length; i++) {
      expect(confidences[i]!).toBeLessThanOrEqual(confidences[i - 1]!);
    }
  });

  it('getByTestId scores higher than getByText', () => {
    const result = resolveLocators(descriptor({
      testId: 'nav-link',
      innerText: 'Home',
    }));
    const testIdLocator = result.locators.find(l => l.strategy === 'getByTestId');
    const textLocator = result.locators.find(l => l.strategy === 'getByText');
    expect(testIdLocator!.confidence).toBeGreaterThan(textLocator!.confidence);
  });

  it('css fallback scores lower than all semantic strategies', () => {
    const result = resolveLocators(descriptor({
      role: 'link',
      accessibleName: 'About',
      innerText: 'About',
      cssPath: 'nav > a:nth-of-type(2)',
    }));
    const cssLocator = result.locators.find(l => l.strategy === 'css');
    const roleLocator = result.locators.find(l => l.strategy === 'getByRole');
    expect(cssLocator!.confidence).toBeLessThan(roleLocator!.confidence);
  });
});

// ---------------------------------------------------------------------------
// Expression generation — correct Playwright syntax
// ---------------------------------------------------------------------------

describe('expression generation', () => {
  it('generates correct getByRole expression', () => {
    const result = resolveLocators(descriptor({
      role: 'checkbox',
      accessibleName: 'Accept terms',
    }));
    expect(result.best.expression).toBe(
      `page.getByRole('checkbox', { name: 'Accept terms' })`
    );
  });

  it('generates correct getByLabel expression', () => {
    const result = resolveLocators(descriptor({
      labelText: 'Password',
    }));
    expect(result.best.expression).toBe(`page.getByLabel('Password')`);
  });

  it('generates correct getByPlaceholder expression', () => {
    const result = resolveLocators(descriptor({
      placeholder: 'Search products',
    }));
    expect(result.best.expression).toBe(`page.getByPlaceholder('Search products')`);
  });

  it('generates correct getByTestId expression', () => {
    const result = resolveLocators(descriptor({
      testId: 'login-button',
    }));
    expect(result.best.expression).toBe(`page.getByTestId('login-button')`);
  });

  it('generates correct getByAltText expression', () => {
    const result = resolveLocators(descriptor({
      altText: 'User avatar',
    }));
    expect(result.best.expression).toBe(`page.getByAltText('User avatar')`);
  });

  it('generates getByText with exact:true for short text', () => {
    const result = resolveLocators(descriptor({
      innerText: 'Sign out',
    }));
    expect(result.best.expression).toBe(`page.getByText('Sign out', { exact: true })`);
  });

  it('generates getByText without exact for longer text', () => {
    const longText = 'This is a fairly long button label that exceeds forty chars';
    const result = resolveLocators(descriptor({ innerText: longText }));
    expect(result.best.expression).not.toContain('exact: true');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('escapes single quotes in accessible name', () => {
    const result = resolveLocators(descriptor({
      role: 'button',
      accessibleName: "Don't click me",
    }));
    expect(result.best.expression).toContain(`Don\\'t click me`);
  });

  it('escapes single quotes in label text', () => {
    const result = resolveLocators(descriptor({
      labelText: "User's email",
    }));
    expect(result.best.expression).toContain(`User\\'s email`);
  });

  it('ignores role=none and role=presentation', () => {
    const noneResult = resolveLocators(descriptor({ role: 'none', accessibleName: 'test' }));
    const presResult = resolveLocators(descriptor({ role: 'presentation', accessibleName: 'test' }));
    expect(noneResult.best.strategy).not.toBe('getByRole');
    expect(presResult.best.strategy).not.toBe('getByRole');
  });

  it('skips getByText for very long inner text (>80 chars)', () => {
    const result = resolveLocators(descriptor({
      innerText: 'a'.repeat(81),
      cssPath: 'p',
    }));
    expect(result.locators.find(l => l.strategy === 'getByText')).toBeUndefined();
  });

  it('skips getByText for empty inner text', () => {
    const result = resolveLocators(descriptor({
      innerText: '   ',
      cssPath: 'span',
    }));
    expect(result.locators.find(l => l.strategy === 'getByText')).toBeUndefined();
  });

  it('always returns at least one locator even for a bare element', () => {
    const result = resolveLocators(descriptor({
      tagName: 'div',
      cssPath: '',
      xpath: '',
    }));
    expect(result.locators.length).toBeGreaterThan(0);
    expect(result.best).toBeDefined();
  });

  it('truncates very long accessible names in expression', () => {
    const result = resolveLocators(descriptor({
      role: 'button',
      accessibleName: 'a'.repeat(100),
    }));
    expect(result.best.expression.length).toBeLessThan(200);
    expect(result.best.expression).toContain('…');
  });
});

// ---------------------------------------------------------------------------
// resolveAll
// ---------------------------------------------------------------------------

describe('resolveAll', () => {
  it('processes multiple descriptors and returns one result per input', () => {
    const descriptors = [
      descriptor({ role: 'button', accessibleName: 'OK' }),
      descriptor({ labelText: 'Email' }),
      descriptor({ testId: 'close-btn' }),
    ];
    const results = resolveAll(descriptors);
    expect(results).toHaveLength(3);
    expect(results[0]!.best.strategy).toBe('getByRole');
    expect(results[1]!.best.strategy).toBe('getByLabel');
    expect(results[2]!.best.strategy).toBe('getByTestId');
  });

  it('returns empty array for empty input', () => {
    expect(resolveAll([])).toEqual([]);
  });
});
