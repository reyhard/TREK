import { describe, it, expect } from 'vitest';

describe('OidcService lifecycle module path', () => {
  it('imports the canonical Nest OIDC service', async () => {
    const mod = await import('../../../src/nest/oidc/oidc.service');
    expect(mod.OidcService).toBeDefined();
  });
});
