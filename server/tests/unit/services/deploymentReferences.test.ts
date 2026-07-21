import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const repoRoot = resolve(__dirname, '..', '..', '..', '..');

function readRelative(parts: string[]) {
  return readFileSync(resolve(repoRoot, ...parts), 'utf-8');
}

describe('DEPLOY-DOCS-001: upstream image reference casing', () => {
  const files = [
    'README.md',
    'SECURITY.md',
    'charts/trek/values.yaml',
    'docker-compose.yml',
    'unraid-template.xml',
    'wiki/Install-Docker-Compose.md',
    'wiki/Install-Docker.md',
    'wiki/Install-Helm.md',
    'wiki/Install-Portainer.md',
    'wiki/Quick-Start.md',
    'wiki/Updating.md',
  ];

  for (const file of files) {
    it(`no uppercase mauriceboe/TREK image ref in ${file}`, () => {
      const content = readRelative([file]);
      expect(content).not.toMatch(/mauriceboe\/TREK/);
    });
  }
});

describe('DEPLOY-DOCS-002: upstream Helm chart URL correctness', () => {
  it('README.md uses chart.liketrek.com for Helm install', () => {
    const content = readRelative(['README.md']);
    expect(content).toMatch(/chart\.liketrek\.com/);
    expect(content).not.toMatch(/mauriceboe\.github\.io\/TREK/);
  });

  it('charts/README.md uses chart.liketrek.com and documents CNAME alias', () => {
    const content = readRelative(['charts', 'README.md']);
    expect(content).toMatch(/chart\.liketrek\.com/);
    expect(content).toMatch(/liketrek\.github\.io\/TREK/);
  });

  it('wiki/Install-Helm.md uses chart.liketrek.com', () => {
    const content = readRelative(['wiki', 'Install-Helm.md']);
    expect(content).toMatch(/chart\.liketrek\.com/);
  });

  it('wiki/Updating.md uses chart.liketrek.com', () => {
    const content = readRelative(['wiki', 'Updating.md']);
    expect(content).toMatch(/chart\.liketrek\.com/);
  });
});

describe('DEPLOY-DOCS-003: chart release workflow', () => {
  it('docker.yml has charts_url pointing to chart.liketrek.com', () => {
    const content = readRelative(['.github', 'workflows', 'docker.yml']);
    expect(content).toMatch(/charts_url:\s+https:\/\/chart\.liketrek\.com/);
  });
});

describe('DEPLOY-DOCS-004: deployment surface parity preserved', () => {
  it('docker-compose.yml retains MCP env vars', () => {
    const content = readRelative(['docker-compose.yml']);
    expect(content).toMatch(/MCP_RATE_LIMIT/);
    expect(content).toMatch(/MCP_MAX_SESSION_PER_USER/);
    expect(content).toMatch(/MCP_SESSION_TTL/);
    expect(content).toMatch(/MCP_SSE_KEEPALIVE/);
  });

  it('docker-compose.yml retains plugin env vars', () => {
    const content = readRelative(['docker-compose.yml']);
    expect(content).toMatch(/TREK_PLUGINS_ENABLED/);
    expect(content).toMatch(/TREK_PLUGINS_DIR/);
    expect(content).toMatch(/TREK_PLUGIN_PERMISSIONS/);
    expect(content).toMatch(/TREK_PLUGIN_REGISTRY_URL/);
  });

  it('docker-compose.yml retains transit env vars', () => {
    const content = readRelative(['docker-compose.yml']);
    expect(content).toMatch(/TRANSIT_API_URL/);
  });

  it('docker-compose.yml retains backup env vars', () => {
    const content = readRelative(['docker-compose.yml']);
    expect(content).toMatch(/BACKUP_UPLOAD_LIMIT_MB/);
    expect(content).toMatch(/BACKUP_MAX_DECOMPRESSED_MB/);
  });

  it('docker-compose.yml retains WebAuthn env vars', () => {
    const content = readRelative(['docker-compose.yml']);
    expect(content).toMatch(/WEBAUTHN_ORIGINS/);
    expect(content).toMatch(/WEBAUTHN_RP_ID/);
  });

  it('docker-compose.yml retains SMTP env vars', () => {
    const content = readRelative(['docker-compose.yml']);
    expect(content).toMatch(/SMTP_HOST/);
    expect(content).toMatch(/SMTP_PORT/);
    expect(content).toMatch(/SMTP_USER/);
    expect(content).toMatch(/SMTP_PASS/);
  });

  it('charts/trek/values.yaml retains MCP env vars', () => {
    const content = readRelative(['charts', 'trek', 'values.yaml']);
    expect(content).toMatch(/MCP_RATE_LIMIT/);
    expect(content).toMatch(/MCP_MAX_SESSION_PER_USER/);
    expect(content).toMatch(/MCP_SESSION_TTL/);
    expect(content).toMatch(/MCP_SSE_KEEPALIVE/);
  });

  it('charts/trek/values.yaml retains plugin env vars', () => {
    const content = readRelative(['charts', 'trek', 'values.yaml']);
    expect(content).toMatch(/TREK_PLUGINS_ENABLED/);
    expect(content).toMatch(/TREK_PLUGINS_DIR/);
    expect(content).toMatch(/TREK_PLUGIN_PERMISSIONS/);
    expect(content).toMatch(/TREK_PLUGIN_REGISTRY_URL/);
  });

  it('charts/trek/values.yaml retains WebAuthn env vars', () => {
    const content = readRelative(['charts', 'trek', 'values.yaml']);
    expect(content).toMatch(/WEBAUTHN_ORIGINS/);
    expect(content).toMatch(/WEBAUTHN_RP_ID/);
  });

  it('charts/trek/values.yaml retains SMTP env vars', () => {
    const content = readRelative(['charts', 'trek', 'values.yaml']);
    expect(content).toMatch(/SMTP_HOST/);
    expect(content).toMatch(/SMTP_PORT/);
    expect(content).toMatch(/SMTP_USER/);
    expect(content).toMatch(/SMTP_FROM/);
  });

  it('charts/trek/values.yaml retains backup env vars', () => {
    const content = readRelative(['charts', 'trek', 'values.yaml']);
    expect(content).toMatch(/BACKUP_UPLOAD_LIMIT_MB/);
    expect(content).toMatch(/BACKUP_MAX_DECOMPRESSED_MB/);
  });

  it('charts/trek/values.yaml retains transit env vars', () => {
    const content = readRelative(['charts', 'trek', 'values.yaml']);
    expect(content).toMatch(/TRANSIT_API_URL/);
  });
});

describe('DEPLOY-DOCS-005: chart version bumped', () => {
  it('Chart.yaml version is 3.4.1', () => {
    const content = readRelative(['charts', 'trek', 'Chart.yaml']);
    expect(content).toMatch(/^version:\s*3\.4\.1$/m);
    expect(content).toMatch(/^appVersion:\s*"3\.4\.1"$/m);
  });
});
