import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VERSION } from '../index.js';

describe('package version', () => {
  it('exports a semver VERSION matching package.json', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as {
      version: string;
    };
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(VERSION).toBe(pkg.version);
  });
});
