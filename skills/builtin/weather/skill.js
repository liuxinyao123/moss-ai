/**
 * 天气查询技能
 * 提供天气查询和预报功能
 */

const axios = require('axios');
const moment = require('moment');

class WeatherSkill {
  constructor(context) {
    this.context = context;
    this.name = '天气查询';
    this.version = '1.0.0';
    this.apiKey = null;
    this.cache = new Map();
    this.cacheDuration = 30 * 60 * 1000; // 30分钟
  }
  
  // 技能初始化
  async initialize(config = {}) {
    try {
      // 尝试获取API密钥（如果有的话）
      this.apiKey = config.apiKey || process.env.WEATHER_API_KEY || null;
      
      // 加载支持的天气服务
      this.services = {
        // 模拟天气数据（实际使用时应替换为真实API）
        default: {
          name: '模拟天气服务',
          baseUrl: 'https://api.weather.example.com',
          formatResponse: this.formatMockWeatherData.bind(this)
        }
      };
      
      this.currentService = 'default';
      
      this.context.logger.info('天气技能初始化完成');
      return {
        success: true,
        message: '天气技能初始化完成',
        availableServices: Object.keys(this.services)
      };
    } catch (error) {
      this.context.logger.error('天气技能初始化失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // 技能执行
  async execute(params) {
    try {
      const { location, days = 3, units = 'celsius' } = params;
      
      if (!location) {
        throw new Error('请提供要查询的城市或地址');
      }
      
      // 检查缓存
      const cacheKey = `${location}_${days}_${units}`;
      const cachedData = this.cache.get(cacheKey);
      
      if (cachedData && (Date.now() - cachedData.timestamp) < this.cacheDuration) {
        this.context.logger.info('从缓存获取天气数据');
        return {
          success: true,
          data: cachedData.data,
          fromCache: true,
          message: `获取${location}的${days}天天气预报成功（来自缓存）`
        };
      }
      
      // 获取天气数据
      const weatherData = await this.fetchWeatherData(location, days, units);
      
      // 缓存结果
      this.cache.set(cacheKey, {
        data: weatherData,
        timestamp: Date.now()
      });
      
      // 清理过期缓存
      this.cleanCache();
      
      return {
        success: true,
        data: weatherData,
        fromCache: false,
        message: `获取${location}的${days}天天气预报成功`
      };
    } catch (error) {
      this.context.logger.error('天气技能执行失败:', error);
      return {
        success: false,
        error: error.message,
        suggestion: '请检查网络连接或稍后重试'
      };
    }
  }
  
  // 获取天气数据
  async fetchWeatherData(location, days, units) {
    const service = this.services[this.currentService];
    
    // 如果使用真实API，这里应该是实际的HTTP请求
    // 这里使用模拟数据作为演示
    
    if (this.apiKey) {
      // 如果有API密钥，可以调用真实API
      // const response = await axios.get(`${service.baseUrl}/weather`, {
      //   params: {
      //     city: location,
      //     days,
      //     units,
      //     apikey: this.apiKey
      //   }
      // });
      // return service.formatResponse(response.data);
    }
    
    // 返回模拟数据
    return this.generateMockWeatherData(location, days, units);
  }
  
  // 生成模拟天气数据
  generateMockWeatherData(location, days, units) {
    const current = new Date();
    const forecast = [];
    
    for (let i = 0; i < days; i++) {
      const date = new Date(current);
      date.setDate(current.getDate() + i);
      
      // 模拟不同的天气情况
      const weatherConditions = ['晴', '多云', '阴', '小雨', '中雨', '大雨', '雷阵雨'];
      const condition = weatherConditions[i % weatherConditions.length];
      
      // 模拟温度（摄氏度）
      let temperature = 15 + (i * 2) + Math.random() * 10 - 5;
      
      // 如果要求华氏度，进行转换
      if (units === 'fahrenheit') {
        temperature = temperature * 9/5 + 32;
      }
      
      // 模拟湿度
      const humidity = 40 + Math.random() * 40;
      
      // 模拟风向和风速
      const windDirections = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
      const windSpeed = 1 + Math.random() * 5;
      
      forecast.push({
        date: moment(date).format('YYYY-MM-DD'),
        dayOfWeek: moment(date).format('dddd'),
        condition,
        temperature: Math.round(temperature * 10) / 10,
        units: units === 'celsius' ? '°C' : '°F',
        humidity: Math.round(humidity),
        wind: {
          direction: windDirections[i % windDirections.length],
          speed: Math.round(windSpeed * 10) / 10,
          unit: 'm/s'
        },
        sunrise: '06:30',
        sunset: '18:45',
        uvIndex: 3 + Math.floor(Math.random() * 8)
      });
    }
    
    return {
      location,
      current: forecast[0],
      forecast: forecast.slice(1),
      updated_at: moment().format('YYYY-MM-DD HH:mm:ss'),
      units: units === 'celsius' ? '°C' : '°F',
      source: 'DSclaw 模拟天气数据',
      warning: '此为演示数据，非真实天气信息'
    };
  }
  
  // 格式化模拟天气数据
  formatMockWeatherData(data) {
    return {
      location: data.location || '未知',
      current: {
        condition: data.current?.condition || '晴',
        temperature: data.current?.temperature || 20,
        humidity: data.current?.humidity || 50,
        wind: {
          direction: data.current?.wind?.direction || '北',
          speed: data.current?.wind?.speed || 3
        }
      },
      forecast: (data.forecast || []).map(day => ({
        date: day.date || moment().format('YYYY-MM-DD'),
        condition: day.condition || '多云',
        temperature: {
          high: day.temperature?.high || 25,
          low: day.temperature?.low || 15
        }
      }))
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
      description: '查询天气信息，支持当前天气和未来几天天气预报',
      usage: '天气 <城市> [天数] [单位]',
      examples: [
        '天气 北京',
        '天气 上海 5',
        '天气 广州 3 fahrenheit',

        '参数说明:',
        '- location (必填): 城市名称，如"北京"、"上海"',
        '- days (可选): 预报天数，默认3天，最多7天',
        '- units (可选): 温度单位，celsius(摄氏度)或fahrenheit(华氏度)，默认celsius'
      ],
      tips: [
        '支持的城市: 任意中国城市或国际城市名称',
        '数据来源: 演示使用模拟数据，真实API需要配置API密钥',
        '缓存机制: 天气数据有30分钟缓存，提高查询速度'
      ]
    };
  }
  
  // 技能元信息
  async meta() {
    return {
      id: 'weather-skill-v1.0.0',
      name: this.name,
      version: this.version,
      category: 'utility',
      tags: ['weather', 'forecast', 'temperature', 'humidity'],
      created_at: '2026-03-18',
      last_updated: '2026-03-18',
      status: 'active'
    };
  }
  
  // 更新技能配置
  async updateConfig(config) {
    try {
      if (config.apiKey) {
        this.apiKey = config.apiKey;
      }
      
      if (config.service && this.services[config.service]) {
        this.currentService = config.service;
      }
      
      return {
        success: true,
        message: '技能配置更新成功',
        currentConfig: {
          apiKeyConfigured: !!this.apiKey,
          currentService: this.currentService,
          availableServices: Object.keys(this.services)
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
      service: this.currentService,
      cacheSize: this.cache.size,
      apiConfigured: !!this.apiKey,
      lastUpdated: new Date().toISOString(),
      capabilities: this.services[this.currentService]?.capabilities || []
    };
  }
}

module.exports = WeatherSkill;