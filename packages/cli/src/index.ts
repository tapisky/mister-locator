#!/usr/bin/env node
/**
 * mister-locator CLI
 *
 * Usage:
 *   mister-locator scan <url>                  # Scan all interactive elements
 *   mister-locator scan <url> --format json    # Output as JSON
 *   mister-locator scan <url> --output file.ts # Save to file
 */

import { program } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { chromium } from 'playwright';
import { resolveAll } from '@mister-locator/core';
import type { ElementDescriptor, LocatorResult } from '@mister-locator/core';
import { writeFileSync } from 'node:fs';
import { scanPage } from './scanner.js';
import { formatAsCode, formatAsJSON, formatAsTable } from './formatters.js';

program
  .name('mister-locator')
  .description('Extract robust Playwright locators from any web page')
  .version('0.1.0');

program
  .command('scan <url>')
  .description('Scan a page and extract locators for all interactive elements')
  .option('-f, --format <format>', 'Output format: table | json | code', 'table')
  .option('-o, --output <file>', 'Write output to a file instead of stdout')
  .option('--timeout <ms>', 'Navigation timeout in milliseconds', '30000')
  .option('--no-headless', 'Show the browser window during scan')
  .action(async (url: string, options: {
    format: 'table' | 'json' | 'code';
    output?: string;
    timeout: string;
    headless: boolean;
  }) => {
    const spinner = ora(`Launching browser and scanning ${chalk.cyan(url)}`).start();

    try {
      const browser = await chromium.launch({ headless: options.headless });
      const page = await browser.newPage();

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: parseInt(options.timeout, 10),
      });

      spinner.text = 'Extracting elements…';
      const descriptors = await scanPage(page);
      const results = resolveAll(descriptors);

      await browser.close();
      spinner.succeed(`Found ${chalk.green(results.length)} interactive elements`);

      let output: string;
      switch (options.format) {
        case 'json':
          output = formatAsJSON(results);
          break;
        case 'code':
          output = formatAsCode(results, url);
          break;
        default:
          output = formatAsTable(results);
      }

      if (options.output) {
        writeFileSync(options.output, output, 'utf-8');
        console.log(chalk.green(`✓ Written to ${options.output}`));
      } else {
        console.log('\n' + output);
      }
    } catch (err) {
      spinner.fail(chalk.red('Scan failed'));
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program.parse();
