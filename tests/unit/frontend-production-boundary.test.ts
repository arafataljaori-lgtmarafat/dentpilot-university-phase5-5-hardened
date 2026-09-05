import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();
const webSourceRoot = join(projectRoot, 'apps/web/src');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  }).filter((path) => /\.(ts|tsx|css)$/.test(path));
}

function webSource(): string {
  return sourceFiles(webSourceRoot).map((path) => readFileSync(path, 'utf8')).join('\n');
}

describe('Phase 2B frontend production boundary', () => {
  it('does not import prototype data or persist authority in browser storage', () => {
    const source = webSource();
    expect(source).not.toMatch(/window\.PortalData/);
    expect(source).not.toMatch(/window\.PortalPermissions/);
    expect(source).not.toMatch(/\blocalStorage\b/);
    expect(source).not.toMatch(/\bsessionStorage\b/);
    expect(source).not.toMatch(/from\s+['"].*data\.js['"]/);
    expect(source).not.toMatch(/Math\.random\(\)/);
  });

  it('uses server cookies and CSRF for the typed API client', () => {
    const client = readFileSync(join(webSourceRoot, 'api/client.ts'), 'utf8');
    expect(client).toContain("credentials: 'include'");
    expect(client).toContain("entry.startsWith('dp_csrf=')");
    expect(client).toContain("headers.set('x-csrf-token', token)");
    expect(client).toContain("request<SessionActorDto>('/api/v1/session')");
  });

  it('connects the migrated read screens to Phase 2A endpoints', () => {
    const client = readFileSync(join(webSourceRoot, 'api/client.ts'), 'utf8');
    for (const endpoint of [
      '/api/v1/catalog/departments',
      '/api/v1/catalog/academic-years',
      '/api/v1/catalog/academic-levels',
      '/api/v1/catalog/cohorts',
      '/api/v1/groups',
      '/api/v1/students',
      '/api/v1/supervisor-assignments',
      '/api/v1/staff/submissions',
      '/api/v1/reports/dashboard',
      '/api/v1/reports/scoped',
    ]) expect(client).toContain(endpoint);
  });

  it('does not encode a client-side role permission matrix in navigation', () => {
    const shell = readFileSync(join(webSourceRoot, 'app/portal-app.tsx'), 'utf8');
    const navigationDeclaration = shell.slice(shell.indexOf('const universityAdminNavigation'), shell.indexOf('const roleLabels'));
    expect(navigationDeclaration).not.toContain('roles:');
    expect(navigationDeclaration).not.toMatch(/UNIVERSITY_ADMIN|DEPARTMENT_ADMIN|CLINICAL_SUPERVISOR|STUDENT_INTEGRATION/);
    expect(shell).toContain('الخادم هو المرجع الوحيد');
  });
});
