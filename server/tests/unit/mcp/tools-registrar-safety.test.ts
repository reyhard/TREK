/**
 * Registrar safety: verify no duplicate registerTransitTools imports, invocations, or definitions.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const projectRoot = resolve(import.meta.dirname, '../../../');

describe('registerTransitTools uniqueness', () => {
  function grep(pattern: RegExp, filePath: string): number {
    const content = readFileSync(filePath, 'utf-8');
    const re = new RegExp(pattern.source, 'g');
    const matches = content.match(re);
    return matches ? matches.length : 0;
  }

  it('REG-001: exactly one registerTransitTools import in tools.ts', () => {
    const count = grep(/import\s+\{[^}]*registerTransitTools[^}]*\}\s+from/, resolve(projectRoot, 'src/mcp/tools.ts'));
    expect(count).toBe(1);
  });

  it('REG-002: exactly one registerTransitTools invocation in tools.ts', () => {
    const count = grep(/registerTransitTools\(/, resolve(projectRoot, 'src/mcp/tools.ts'));
    expect(count).toBe(1);
  });

  it('REG-003: exactly one registerTransitTools definition (export function)', () => {
    const srcDir = resolve(projectRoot, 'src');
    let definitionCount = 0;
    const files = ['src/mcp/tools/transit.ts', 'src/mcp/tools.ts', 'src/mcp/index.ts'];
    for (const f of files) {
      const full = resolve(projectRoot, f);
      definitionCount += grep(/export\s+function\s+registerTransitTools/, full);
    }
    expect(definitionCount).toBe(1);
  });

  it('REG-004: no other source file imports or defines registerTransitTools beyond tools.ts and transit.ts', () => {
    const srcDir = resolve(projectRoot, 'src');
    // tools.ts: 1 import + 1 invocation; transit.ts: 1 definition = 3
    let count = 0;
    count += grep(/registerTransitTools/, resolve(projectRoot, 'src/mcp/tools.ts'));
    count += grep(/registerTransitTools/, resolve(projectRoot, 'src/mcp/tools/transit.ts'));
    expect(count).toBe(3); // 1 import + 1 invocation + 1 definition
  });

  it('REG-005: tools.ts has exactly one registerTools export function', () => {
    const count = grep(/export\s+function\s+registerTools/, resolve(projectRoot, 'src/mcp/tools.ts'));
    expect(count).toBe(1);
  });
});
