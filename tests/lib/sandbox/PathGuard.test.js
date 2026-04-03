import { describe, it, expect, beforeEach } from 'vitest';
import { PathGuard } from '../../../lib/sandbox/PathGuard';
import { AccessTier } from '../../../lib/sandbox/AccessTier';

describe('PathGuard', () => {
  let guard;

  beforeEach(() => {
    guard = new PathGuard({
      workspaceRoot: '/test/workspace'
    });
  });

  it('should have default rules', () => {
    const rules = guard.listRules();
    expect(rules.allowList.length).toBeGreaterThan(0);
    expect(rules.denyList.length).toBeGreaterThan(0);
  });

  it('should allow workspace access', () => {
    const canRead = guard.canRead('/test/workspace/file.txt');
    const canWrite = guard.canWrite('/test/workspace/file.txt');
    expect(canRead).toBe(true);
    expect(canWrite).toBe(true);
  });

  it('should block sensitive directories', () => {
    expect(guard.canRead('/etc/passwd')).toBe(false);
    expect(guard.canRead('/root/.ssh/id_rsa')).toBe(false);
  });

  it('should allow adding custom rules', () => {
    guard.allow('/custom/path', AccessTier.READONLY);
    expect(guard.canRead('/custom/path/file.txt')).toBe(true);
    expect(guard.canWrite('/custom/path/file.txt')).toBe(false);
  });

  it('should allow changing tier', () => {
    guard.allow('/custom/path', AccessTier.FULL);
    expect(guard.canRead('/custom/path/file.txt')).toBe(true);
    expect(guard.canWrite('/custom/path/file.txt')).toBe(true);
  });

  it('should block explicitly denied paths', () => {
    guard.block('/test/workspace/secrets');
    expect(guard.canRead('/test/workspace/secrets/passwords.txt')).toBe(false);
  });

  it('should return correct tier for nested paths', () => {
    const tier = guard.getAccessTier('/test/workspace/agents/agent1/desk/file.txt');
    expect(tier).toBe(AccessTier.FULL);
  });
});
