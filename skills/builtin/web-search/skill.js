/**
 * 网页搜索技能
 * 提供网络搜索功能
 */

const axios = require('axios');

class WebSearchSkill {
  constructor(context) {
    this.context = context;
    this.name = '网页搜索';
    this.version = '1.0.0';
    this.cache = new Map();
    this.cacheDuration = 60 * 60 * 1000; // 1小时
    // 搜索引擎配置

    this.searchEngines = {
      duckduckgo: {
        name: 'DuckDuckGo',
        baseUrl: 'https://api.duckduckgo.com',
        apiKey: null,
        formatResponse: this.formatDuckDuckGoResponse.bind(this)
      },
      brave: {
        name: 'Brave Search',
        baseUrl: 'https://search.brave.com/api',
        apiKey: null,
        formatResponse: this.formatBraveResponse.bind(this)
      }
    };
    
    this.currentEngine = 'duckduckgo';
  }
  
  // 技能初始化
  async initialize(config = {}) {
    try {
      // 配置API密钥（如果有的话）

      if (config.duckduckgoApiKey) {
        this.searchEngines.duckduckgo.apiKey = config.duckduckgoApiKey;
      }
      
      if (config.braveApiKey) {
        this.searchEngines.brave.apiKey = config.braveApiKey;
      }
      
      this.context.logger.info('网页搜索技能初始化完成');
      return {
        success: true,
        message: '网页搜索技能初始化完成',
        availableEngines: Object.keys(this.searchEngines),
        currentEngine: this.currentEngine
      };
    } catch (error) {
      this.context.logger.error('网页搜索技能初始化失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // 技能执行
  async execute(params) {
    try {
      const { query, count = 5, lang = 'zh-CN' } = params;
      
      if (!query) {
        throw new Error('请输入搜索关键词');
      }
      
      // 检查缓存
      const cacheKey = `${query}_${count}_${lang}`;
      const cachedData = this.cache.get(cacheKey);
      
      if (cachedData && (Date.now() - cachedData.timestamp) < this.cacheDuration) {
        this.context.logger.info('从缓存获取搜索结果');
        return {
          success: true,
          data: cachedData.data,
          fromCache: true,
          message: `搜索"${query}"成功（来自缓存）`
        };
      }
      
      // 执行搜索
      const searchResults = await this.performSearch(query, count, lang);
      
      // 缓存结果
      this.cache.set(cacheKey, {
        data: searchResults,
        timestamp: Date.now()
      });
      
      // 清理过期缓存

      this.cleanCache();
      
      return {
        success: true,
        data: searchResults,
        fromCache: false,
        message: `搜索"${query}"成功，找到${searchResults.results?.length || 0}个结果`
      };
    } catch (error) {
      this.context.logger.error('网页搜索技能执行失败:', error);
      return {
        success: false,
        error: error.message,
        suggestion: '请检查网络连接或稍后重试'
      };
    }
  }
  
  // 执行搜索
  async performSearch(query, count, lang) {
    const engine = this.searchEngines[this.currentEngine];
    
    // 如果没有API密钥，返回模拟数据
    if (!engine.apiKey) {
      return this.generateMockSearchResults(query, count, lang);
    }
    
    try {
      // 实际API调用（示例）
      const response = await axios.get(`${engine.baseUrl}/search`, {
        params: {
          q: query,
          count,
          lang,
          format: 'json',
          api_key: engine.apiKey
        },
        timeout: 10000
      });
      
      return engine.formatResponse(response.data, query);
    } catch (error) {
      this.context.logger.warn('API调用失败，使用模拟数据:', error.message);
      return this.generateMockSearchResults(query, count, lang);
    }
  }
  
  // 生成模拟搜索结果
  generateMockSearchResults(query, count, lang) {
    const results = [];
    const domains = [
      'wikipedia.org', 'baidu.com', 'zhihu.com', 'csdn.net', 
      'github.com', 'stackoverflow.com', 'medium.com', 'juejin.cn'
    ];
    
    const titles = [
      `${query}的全面解析`,
      `最新${query}发展趋势`,
      `${query}入门教程`,
      `${query}实战案例`,
      `${query}常见问题解答`,
      `深入理解${query}`,
      `${query}最佳实践`,
      `${query}技术原理`
    ];
    
    const snippets = [
      `本文详细介绍了${query}的基本概念、应用场景和发展趋势。`,
      `最新的研究显示，${query}在人工智能领域有重要应用。`,
      `学习${query}需要掌握的基础知识和技能。`,
      `通过实际案例展示${query}的应用效果。`,
      `解答关于${query}的常见疑问和困惑。`,
      `深入分析${query}的技术原理和实现机制。`,
      `分享${query}在实际项目中的最佳实践。`,
      `探讨${query}的未来发展方向和挑战。`
    ];
    
    for (let i = 0; i < count; i++) {
      const domain = domains[i % domains.length];
      results.push({
        title: titles[i % titles.length],
        link: `https://${domain}/search?q=${encodeURIComponent(query)}`,
        snippet: snippets[i % snippets.length],
        domain,
        rank: i + 1,
        date: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        language: lang,
        type: ['web', 'article', 'tutorial', 'forum'][i % 4]
      });
    }
    
    return {
      query,
      engine: this.searchEngines[this.currentEngine].name,
      count: results.length,
      results,
      total_estimated: 1000 + Math.floor(Math.random() * 9000),
      search_time: (Math.random() * 0.5 + 0.1).toFixed(2),
      warning: '此为演示数据，非真实搜索结果',
      suggestions: [
        `${query} 教程`,
        `${query} 是什么`,
        `${query} 应用`,
        `${query} 最新进展`
      ]
    };
  }
  
  // 格式化DuckDuckGo响应
  formatDuckDuckGoResponse(data, query) {
    return {
      query,
      engine: 'DuckDuckGo',
      results: (data.Results || []).map((result, index) => ({
        title: result.Text || `关于${query}`,
        link: result.FirstURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        snippet: result.Text || `DuckDuckGo关于${query}的搜索结果`,
        domain: new URL(result.FirstURL || 'https://duckduckgo.com').hostname,
        rank: index + 1
      })),
      abstract: data.AbstractText || `关于${query}的信息`,
      abstract_url: data.AbstractURL || null,
      related_topics: data.RelatedTopics || []
    };
  }
  
  // 格式化Brave响应
  formatBraveResponse(data, query) {
    return {
      query,
      engine: 'Brave Search',
      results: (data.web?.results || []).map((result, index) => ({
        title: result.title || `关于${query}`,
        link: result.url || `https://search.brave.com/search?q=${encodeURIComponent(query)}`,
        snippet: result.description || `Brave关于${query}的搜索结果`,
        domain: new URL(result.url || 'https://search.brave.com').hostname,
        rank: index + 1,
        date: result.date || null,
        language: result.language || 'en'
      })),
      news: data.news?.results || [],
      videos: data.videos?.results || [],
      images: data.images?.results || []
    };
  }
  
  // 清理缓存
  cleanCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheDuration * 2) {
        this.cache.delete(key);
      }
    }
  }
  
  // 帮助信息
  async help() {
    return {
      name: this.name,
      version: this.version,
      description: '提供网页搜索功能，获取网络信息',
      usage: '搜索 <关键词> [数量] [语言]',
      examples: [
        '搜索 AI发展趋势',
        '搜索 机器学习教程 10',
        '搜索 Python编程 en-US',
        '参数说明:',
        '- query (必填): 搜索关键词',
        '- count (可选): 结果数量，默认5个，最多10个',
        '- lang (可选): 语言代码，zh-CN(中文)、en-US(英文)等，默认zh-CN'
      ],
      supported_engines: Object.entries(this.searchEngines).map(([key, engine]) => ({
        id: key,
        name: engine.name,
        requires_api_key: true
      })),
      tips: [
        '支持中文和英文搜索',
        '搜索结果有1小时缓存',
        '需要配置API密钥才能使用真实搜索',
        '支持多种搜索引擎切换'
      ]
    };
  }
  
  // 技能元信息
  async meta() {
    return {
      id: 'web-search-skill-v1.0.0',
      name: this.name,
      version: this.version,
      category: 'information',
      tags: ['web-search', 'internet', 'information', 'research'],
      created_at: '2026-03-18',
      last_updated: '2026-03-18',
      status: 'active'
    };
  }
  
  // 更新技能配置
  async updateConfig(config) {
    try {
      if (config.duckduckgoApiKey) {
        this.searchEngines.duckduckgo.apiKey = config.duckduckgoApiKey;
      }
      
      if (config.braveApiKey) {
        this.searchEngines.brave.apiKey = config.braveApiKey;
      }
      
      if (config.engine && this.searchEngines[config.engine]) {
        this.currentEngine = config.engine;
      }
      
      return {
        success: true,
        message: '搜索技能配置更新成功',
        currentConfig: {
          currentEngine: this.currentEngine,
          apiKeysConfigured: {
            duckduckgo: !!this.searchEngines.duckduckgo.apiKey,
            brave: !!this.searchEngines.brave.apiKey
          }
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // 获取技能状态
  async status() {
    return {
      skill: this.name,
      version: this.version,
      engine: this.currentEngine,
      cacheSize: this.cache.size,
      apiConfigured: {
        duckduckgo: !!this.searchEngines.duckduckgo.apiKey,
        brave: !!this.searchEngines.brave.apiKey
      },
      lastUpdated: new Date().toISOString(),
      capabilities: ['web_search', 'mock_search', 'caching']
    };
  }
  
  // 清除缓存
  async clearCache() {
    const oldSize = this.cache.size;
    this.cache.clear();
    return {
      success: true,
      message: `已清除 ${oldSize} 条缓存`,
      cacheSize: 0
    };
  }
}

module.exports = WebSearchSkill;