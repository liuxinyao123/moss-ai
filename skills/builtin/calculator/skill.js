/**
 * 计算器技能
 * 提供基本数学计算功能
 */

class CalculatorSkill {
  constructor(context) {
    this.context = context;
    this.name = '计算器';
    this.version = '1.0.0';
    this.history = [];
    this.maxHistorySize = 100;
  }
  
  // 技能初始化
  async initialize(config = {}) {
    try {
      this.context.logger.info('计算器技能初始化完成');
      return {
        success: true,
        message: '计算器技能初始化完成',
        capabilities: this.getCapabilities()
      };
    } catch (error) {
      this.context.logger.error('计算器技能初始化失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // 技能执行
  async execute(params) {
    try {
      const { expression } = params;
      
      if (!expression) {
        throw new Error('请输入要计算的表达式');
      }
      
      // 清理表达式
      const cleanedExpression = this.cleanExpression(expression);
      
      // 解析和计算
      const result = this.evaluateExpression(cleanedExpression);
      
      // 记录历史
      this.addToHistory(cleanedExpression, result);
      
      return {
        success: true,
        data: {
          expression: cleanedExpression,
          result,
          formatted: this.formatResult(cleanedExpression, result)
        },
        message: `计算完成: ${cleanedExpression} = ${result}`
      };
    } catch (error) {
      this.context.logger.error('计算器技能执行失败:', error);
      return {
        success: false,
        error: error.message,
        suggestion: '请检查表达式格式是否正确'
      };
    }
  }
  
  // 清理表达式
  cleanExpression(expression) {
    // 移除空格
    let cleaned = expression.replace(/\s+/g, '');
    
    // 替换中文运算符
    const operatorMap = {
      '加': '+',
      '减': '-',
      '乘': '*',
      '除以': '/',
      '除': '/',
      '乘以': '*',
      '平方': '**2',
      '开方': 'sqrt',
      '的平方': '**2',
      '的立方': '**3',
      '等于': '=',
      '百分之': '*0.01*',
      '百分': '*0.01*'
    };
    
    for (const [chinese, math] of Object.entries(operatorMap)) {
      cleaned = cleaned.replace(new RegExp(chinese, 'g'), math);
    }
    
    // 处理特殊表达式
    cleaned = cleaned.replace(/sqrt\(/g, 'Math.sqrt(');
    cleaned = cleaned.replace(/\*\*(\d+)/g, '**$1');
    
    return cleaned;
  }
  
  // 计算表达式
  evaluateExpression(expression) {
    try {
      // 安全地计算表达式
      const result = this.safeEval(expression);
      
      // 处理特殊值
      if (result === Infinity || result === -Infinity) {
        throw new Error('计算结果超出范围');
      }
      
      if (isNaN(result)) {
        throw new Error('无法计算该表达式');
      }
      
      return result;
    } catch (error) {
      throw new Error(`表达式计算失败: ${error.message}`);
    }
  }
  
  // 安全地计算表达式
  safeEval(expression) {
    // 移除危险字符
    const safeExpression = expression.replace(/[^0-9+\-*/().,^√πe%]/g, '');
    
    // 替换数学函数
    let evalExpression = safeExpression
      .replace(/\^/g, '**')
      .replace(/√/g, 'Math.sqrt')
      .replace(/π/g, 'Math.PI')
      .replace(/e/g, 'Math.E');
    
    // 使用Function构造函数进行安全的表达式求值
    try {
      // 创建安全的计算函数
      const calculate = new Function('return ' + evalExpression);
      return calculate();
    } catch (error) {
      // 如果失败，尝试更简单的解析
      return this.simpleEval(expression);
    }
  }
  
  // 简单表达式求值（处理基本运算）
  simpleEval(expression) {
    const tokens = expression.match(/(\d+\.?\d*)|[+\-*/()]/g);
    if (!tokens) {
      throw new Error('无法解析表达式');
    }
    
    // 实现简单的表达式求值
    const values = [];
    const ops = [];
    
    const precedence = {
      '+': 1, '-': 1,
      '*': 2, '/': 2
    };
    
    const applyOp = (a, b, op) => {
      switch (op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': 
          if (b === 0) throw new Error('除数不能为零');
          return a / b;
        default: throw new Error('未知运算符');
      }
    };
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      
      if (!isNaN(token)) {
        values.push(parseFloat(token));
      } else if (token === '(') {
        ops.push(token);
      } else if (token === ')') {
        while (ops.length && ops[ops.length - 1] !== '(') {
          const b = values.pop();
          const a = values.pop();
          const op = ops.pop();
          values.push(applyOp(a, b, op));
        }
        ops.pop(); // 移除 '('
      } else {
        while (ops.length && precedence[ops[ops.length - 1]] >= precedence[token]) {
          const b = values.pop();
          const a = values.pop();
          const op = ops.pop();
          values.push(applyOp(a, b, op));
        }
        ops.push(token);
      }
    }
    
    while (ops.length) {
      const b = values.pop();
      const a = values.pop();
      const op = ops.pop();
      values.push(applyOp(a, b, op));
    }
    
    return values[0];
  }
  
  // 格式化结果
  formatResult(expression, result) {
    // 四舍五入到合理的小数位数
    const rounded = Math.round(result * 1000000) / 1000000;
    
    // 如果结果是整数，显示为整数
    const displayResult = Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(6).replace(/\.?0+$/, '');
    
    return `${expression} = ${displayResult}`;
  }
  
  // 添加历史记录
  addToHistory(expression, result) {
    this.history.unshift({
      expression,
      result,
      timestamp: new Date().toISOString()
    });
    
    // 限制历史记录大小
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(0, this.maxHistorySize);
    }
  }
  
  // 获取能力列表
  getCapabilities() {
    return [
      '基本运算: 加(+)、减(-)、乘(*)、除(/)',
      '幂运算: 平方(**2)、立方(**3)',
      '开方: sqrt() 或 √',
      '百分比: %',
      '括号: 支持括号改变运算顺序',
      '常数: π (圆周率)、e (自然常数)'
    ];
  }
  
  // 获取历史记录
  async getHistory(limit = 10) {
    return {
      success: true,
      data: this.history.slice(0, limit),
      total: this.history.length
    };
  }
  
  // 帮助信息
  async help() {
    return {
      name: this.name,
      version: this.version,
      description: '提供基本数学计算功能，支持加减乘除、乘方、开方等运算',
      usage: '计算 <表达式>',
      examples: [
        '计算 12+34',
        '计算 56*78',
        '计算 100/25',
        '计算 5的平方',
        '计算 36开平方',
        '计算 (3+4)*5',
        '计算 15% of 200',
        '计算 π * 10'
      ],
      operators: {
        '加法': ['+', '加'],
        '减法': ['-', '减'],
        '乘法': ['*', '乘', '乘以'],
        '除法': ['/', '除以', '除'],
        '幂运算': ['^', '**', '的平方', '的立方'],
        '开方': ['sqrt', '√', '开方'],
        '括号': ['(', ')'],
        '常数': ['π (圆周率)', 'e (自然常数)']
      },
      tips: [
        '支持中文运算符，如"加"、"减"、"乘"、"除"等',
        '支持复杂表达式，如"(3+4)*5/2"',
        '支持科学计数法，如"1.23e4"',
        '计算结果保留6位小数精度'
      ]
    };
  }
  
  // 技能元信息
  async meta() {
    return {
      id: 'calculator-skill-v1.0.0',
      name: this.name,
      version: this.version,
      category: 'utility',
      tags: ['calculator', 'math', 'arithmetic', 'computation'],
      created_at: '2026-03-18',
      last_updated: '2026-03-18',
      status: 'active'
    };
  }
  
  // 获取技能状态
  async status() {
    return {
      skill: this.name,
      version: this.version,
      historySize: this.history.length,
      maxHistorySize: this.maxHistorySize,
      lastCalculations: this.history.slice(0, 5),
      lastUpdated: new Date().toISOString(),
      capabilities: this.getCapabilities()
    };
  }
  
  // 清除历史记录
  async clearHistory() {
    const oldSize = this.history.length;
    this.history = [];
    return {
      success: true,
      message: `已清除 ${oldSize} 条历史记录`,
      historySize: 0
    };
  }
}

module.exports = CalculatorSkill;