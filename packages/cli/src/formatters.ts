import chalk from 'chalk';
import type { LocatorResult } from '@mister-locator/core';

const strategyColor: Record<string, (s: string) => string> = {
  getByRole:        chalk.green,
  getByLabel:       chalk.green,
  getByPlaceholder: chalk.cyan,
  getByTestId:      chalk.cyan,
  getByAltText:     chalk.yellow,
  getByTitle:       chalk.yellow,
  getByText:        chalk.yellow,
  css:              chalk.gray,
  xpath:            chalk.red,
};

// ---------------------------------------------------------------------------
// Table formatter (default, for humans)
// ---------------------------------------------------------------------------
export function formatAsTable(results: LocatorResult[]): string {
  const lines: string[] = [
    chalk.bold('mister-locator results'),
    chalk.dim('─'.repeat(80)),
  ];

  for (const result of results) {
    const { best, descriptor } = result;
    const colorFn = strategyColor[best.strategy] ?? chalk.white;
    const tag = chalk.dim(`<${descriptor.tagName}>`);
    const strategy = colorFn(`[${best.strategy}]`);
    const confidence = best.confidence >= 80
      ? chalk.green(`${best.confidence}%`)
      : best.confidence >= 50
        ? chalk.yellow(`${best.confidence}%`)
        : chalk.red(`${best.confidence}%`);

    lines.push(`${tag} ${strategy} ${confidence}`);
    lines.push(`  ${chalk.white(best.expression)}`);

    if (result.locators.length > 1) {
      lines.push(chalk.dim(`  alternatives: ${result.locators.length - 1}`));
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// JSON formatter (for piping / tooling)
// ---------------------------------------------------------------------------
export function formatAsJSON(results: LocatorResult[]): string {
  return JSON.stringify(
    results.map(r => ({
      element: r.descriptor.tagName,
      best: r.best.expression,
      strategy: r.best.strategy,
      confidence: r.best.confidence,
      alternatives: r.locators.slice(1).map(l => l.expression),
    })),
    null,
    2,
  );
}

// ---------------------------------------------------------------------------
// Code formatter — generates a ready-to-use TypeScript test helper file
// ---------------------------------------------------------------------------
export function formatAsCode(results: LocatorResult[], url: string): string {
  const timestamp = new Date().toISOString();
  const lines: string[] = [
    `/**`,
    ` * Locators extracted by mister-locator`,
    ` * Source: ${url}`,
    ` * Generated: ${timestamp}`,
    ` */`,
    ``,
    `import { Page } from '@playwright/test';`,
    ``,
    `export function getLocators(page: Page) {`,
    `  return {`,
  ];

  for (const result of results) {
    const { best, descriptor } = result;
    // Generate a camelCase key from accessible name or tag+index
    const name = descriptor.accessibleName ?? descriptor.labelText ?? descriptor.id;
    const key = name
      ? toCamelCase(name)
      : `${descriptor.tagName}${results.indexOf(result)}`;

    lines.push(`    /** strategy: ${best.strategy} | confidence: ${best.confidence}% */`);
    lines.push(`    ${key}: ${best.expression},`);
  }

  lines.push(`  };`);
  lines.push(`}`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function toCamelCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean)
    .map((word, i) =>
      i === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join('');
}
