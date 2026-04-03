import { describe, it, expect, beforeEach } from 'vitest';
import { Engine } from '../../core/Engine';

describe('Engine', () => {
  let engine;

  beforeEach(() => {
    engine = new Engine();
  });

  it('should create engine instance', () => {
    expect(engine).toBeDefined();
    expect(engine.initialized).toBe(false);
  });

  it('should expose api after initialization', async () => {
    await engine.initialize();
    const api = engine.getApi();
    expect(api.agents).toBeDefined();
    expect(api.sessions).toBeDefined();
    expect(api.models).toBeDefined();
    expect(api.skills).toBeDefined();
    expect(api.channels).toBeDefined();
    expect(api.bridges).toBeDefined();
    expect(engine.initialized).toBe(true);
  });

  it('should shutdown correctly', async () => {
    await engine.initialize();
    await engine.shutdown();
    expect(engine.initialized).toBe(false);
  });
});
