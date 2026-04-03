/**
 * Personality Template - 人格模板
 * 定义AI的声音、行为风格、语气
 */

class PersonalityTemplate {
  constructor(options) {
    this.id = options.id;
    this.name = options.name;
    this.description = options.description;
    this.systemPrompt = options.systemPrompt; // 基础系统提示词
    this.tone = options.tone || 'neutral'; // 语气: friendly, professional, casual, concise
    this.style = options.style || {};
    this.behavior = options.behavior || {};
    this.temperature = options.temperature || 0.7;
    this.maxTokens = options.maxTokens || 2000;
  }

  /**
   * 生成系统提示词
   */
  buildSystemPrompt(context = {}) {
    let prompt = this.systemPrompt || '';

    // 添加行为指导
    if (this.behavior) {
      if (this.behavior.concise) {
        prompt += '\n\n- 请保持回答简洁，避免冗长。';
      }
      if (this.behavior.proactive) {
        prompt += '\n\n- 请主动提出建议，帮用户解决问题。';
      }
      if (this.behavior.cautious) {
        prompt += '\n\n- 请谨慎回答，不确定的内容请说明。';
      }
    }

    // 替换上下文变量
    for (const [key, value] of Object.entries(context)) {
      prompt = prompt.replace(`{${key}}`, value);
    }

    return prompt.trim();
  }

  /**
   * 获取生成参数
   */
  getGenerationConfig() {
    return {
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      tone: this.tone
    };
  }

  /**
   * 序列化
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      tone: this.tone,
      temperature: this.temperature,
      maxTokens: this.maxTokens
    };
  }
}

// 内置默认模板
const DefaultTemplates = {
  default: new PersonalityTemplate({
    id: 'default',
    name: '默认助手',
    description: '通用平衡风格的AI助手',
    systemPrompt: '你是一个有用的AI助手，能够帮助用户解决各种问题。请提供准确、有用的回答。',
    tone: 'neutral',
    temperature: 0.7
  }),

  professional: new PersonalityTemplate({
    id: 'professional',
    name: '专业顾问',
    description: '专业、严谨的顾问风格',
    systemPrompt: '你是一位专业顾问，请提供严谨、准确、结构化的专业建议。分析问题要深入，给出方案要具体。',
    tone: 'professional',
    temperature: 0.3,
    behavior: { cautious: true }
  }),

  friendly: new PersonalityTemplate({
    id: 'friendly',
    name: '友好伙伴',
    description: '友好、轻松的伙伴风格',
    systemPrompt: '你是用户友好的AI伙伴，语气轻松愉快，善于鼓励用户，帮助用户解决问题。',
    tone: 'friendly',
    temperature: 0.9,
    behavior: { proactive: true }
  }),

  concise: new PersonalityTemplate({
    id: 'concise',
    name: '简洁高效',
    description: '简洁回答，直达要点',
    systemPrompt: '请提供简洁、直接的回答，直达问题核心，避免不必要的客套和冗长解释。',
    tone: 'concise',
    temperature: 0.5,
    behavior: { concise: true },
    maxTokens: 500
  }),

  code: new PersonalityTemplate({
    id: 'code',
    name: '代码专家',
    description: '专业代码助手，清晰解释代码',
    systemPrompt: '你是一位专业的编程专家，擅长编写清晰、优雅的代码并提供详细解释。请提供可运行的代码，并解释关键部分。',
    tone: 'professional',
    temperature: 0.2,
    behavior: { cautious: true }
  })
};

module.exports = { PersonalityTemplate, DefaultTemplates };
