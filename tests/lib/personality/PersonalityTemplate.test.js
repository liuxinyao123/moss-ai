import { describe, it, expect } from 'vitest';
import { PersonalityTemplate, DefaultTemplates } from '../../../lib/identity/PersonalityTemplate';

describe('PersonalityTemplate', () => {
  it('should create template with defaults', () => {
    const template = new PersonalityTemplate({
      id: 'test',
      name: 'Test',
      systemPrompt: 'You are a test assistant'
    });
    expect(template.id).toBe('test');
    expect(template.temperature).toBe(0.7);
  });

  it('should build system prompt', () => {
    const template = new PersonalityTemplate({
      id: 'test',
      name: 'Test',
      systemPrompt: 'You are {role} assistant',
      behavior: { concise: true, proactive: true }
    });
    const prompt = template.buildSystemPrompt({ role: 'a testing' });
    expect(prompt).toContain('You are a testing assistant');
    expect(prompt).toContain('保持回答简洁');
    expect(prompt).toContain('主动提出建议');
  });

  it('should return generation config', () => {
    const template = new PersonalityTemplate({
      id: 'test',
      temperature: 0.3,
      maxTokens: 1000
    });
    const config = template.getGenerationConfig();
    expect(config.temperature).toBe(0.3);
    expect(config.maxTokens).toBe(1000);
  });
});

describe('DefaultTemplates', () => {
  it('should have all default templates', () => {
    expect(DefaultTemplates.default).toBeDefined();
    expect(DefaultTemplates.professional).toBeDefined();
    expect(DefaultTemplates.friendly).toBeDefined();
    expect(DefaultTemplates.concise).toBeDefined();
    expect(DefaultTemplates.code).toBeDefined();
  });

  it('default template should have reasonable defaults', () => {
    const def = DefaultTemplates.default;
    expect(def.temperature).toBe(0.7);
    expect(def.systemPrompt).toBeDefined();
  });
});
