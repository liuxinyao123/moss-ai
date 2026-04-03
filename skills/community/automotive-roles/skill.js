/**
 * 汽车企业专属AI角色技能
 * MOSS-AI © 2026
 */

class AutomotiveEnterpriseRolesSkill {
  constructor() {
    this.id = 'automotive-enterprise-roles-v1.0.0';
    this.name = '汽车企业专属AI角色';
    this.version = '1.0.0';
  }

  /**
   * 获取所有汽车企业角色
   */
  getAllRoles() {
    return {
      coreRND: this.getCoreRndRoles(),
      design: this.getDesignRoles(),
      manufacturing: this.getManufacturingRoles(),
      digital: this.getDigitalRoles(),
      testing: this.getTestingRoles(),
      marketing: this.getMarketingRoles(),
      strategy: this.getStrategyRoles()
    };
  }

  /**
   * 核心研发部门角色
   */
  getCoreRndRoles() {
    return [
      {
        id: 'embedded-firmware-engineer',
        name: '嵌入式固件工程师',
        icon: '🔩',
        specialty: 'ECU软件、BMS、MCU开发',
        scenario: '汽车电子开发，ESP32/STM32/Nordic固件',
        description: '汽车电子占整车成本30-40%，大量嵌入式开发需求',
        promptFile: 'prompts/embedded-firmware-engineer.md'
      },
      {
        id: 'devops-automator',
        name: 'DevOps自动化工程师',
        icon: '🚀',
        specialty: 'CI/CD流水线、OTA更新自动化',
        scenario: '车载软件频繁OTA需要成熟自动化流程',
        description: '为智能网联汽车构建可靠的CI/CD流水线',
        promptFile: 'prompts/devops-automator.md'
      },
      {
        id: 'security-engineer',
        name: '安全工程师',
        icon: '🔒',
        specialty: '车载网络安全、OTA安全、ECU安全加固',
        scenario: '智能网联汽车安全，漏洞可能影响行车安全',
        description: '保障车载系统安全，防止黑客攻击和漏洞利用',
        promptFile: 'prompts/security-engineer-automotive.md'
      },
      {
        id: 'software-architect',
        name: '软件架构师',
        icon: '🏛️',
        specialty: 'SOA面向服务架构、域控制器架构设计',
        scenario: '软件定义汽车，需要清晰的架构设计',
        description: '现代汽车软件架构设计，支持OTA和功能更新',
        promptFile: 'prompts/software-architect-automotive.md'
      },
      {
        id: 'ai-data-remediation',
        name: 'AI数据修复工程师',
        icon: '🧬',
        specialty: '自动驾驶训练数据清洗、坏数据修复',
        scenario: '自动驾驶需要海量高质量训练数据',
        description: '大规模修复自动驾驶训练数据，零数据丢失',
        promptFile: 'prompts/ai-data-remediation.md'
      },
      {
        id: 'data-engineer',
        name: '数据工程师',
        icon: '🔧',
        specialty: '车辆数据湖、CAN信号数据处理、OTA日志分析',
        scenario: '智能网联汽车产生海量数据需要处理',
        description: '构建车辆数据管道和数据仓库',
        promptFile: 'prompts/data-engineer-automotive.md'
      }
    ];
  }

  /**
   * 设计部门角色
   */
  getDesignRoles() {
    return [
      {
        id: 'uiux-designer',
        name: 'UI/UX设计师',
        icon: '🎨',
        specialty: '车机UI设计、座舱交互设计',
        scenario: '智能座舱体验是核心竞争力',
        description: '设计直观、安全、美观的车机交互界面'
      },
      {
        id: 'mobile-ux-designer',
        name: '移动UX设计师',
        icon: '📱',
        specialty: '手机App交互设计（配套车机）',
        scenario: '车企需要手机App控车等功能',
        description: '设计手机端控车、服务、社交体验'
      },
      {
        id: 'data-viz-designer',
        name: '数据可视化设计师',
        icon: '📊',
        specialty: '车辆诊断数据可视化、HUD仪表设计',
        scenario: '驾驶数据可视化需要专业设计',
        description: '设计HUD仪表和车辆数据可视化展示'
      }
    ];
  }

  /**
   * 制造与供应链角色
   */
  getManufacturingRoles() {
    return [
      {
        id: 'business-analyst',
        name: '业务分析师',
        icon: '📊',
        specialty: '制造流程优化、供应链流程分析',
        scenario: '汽车是大规模制造业，流程优化价值巨大',
        description: '优化制造和供应链流程，降低成本提升效率'
      },
      {
        id: 'project-manager',
        name: '项目经理',
        icon: '📋',
        specialty: '新车项目管理、跨部门协调',
        scenario: '汽车开发是巨型跨部门工程',
        description: '协调各部门完成新车开发项目'
      },
      {
        id: 'quality-engineer',
        name: '质量工程师',
        icon: '✅',
        specialty: '零部件质量分析、IATF16949质量管理',
        scenario: '汽车行业对质量要求极高',
        description: '保障零部件和整车质量'
      }
    ];
  }

  /**
   * 用户交互与数字化角色
   */
  getDigitalRoles() {
    return [
      {
        id: 'frontend-developer',
        name: '前端开发工程师',
        icon: '🎨',
        specialty: '车机HMI开发、企业官网、数字化营销网站',
        scenario: '智能座舱前端开发需求大',
        description: '开发车机HMI和企业数字化前端'
      },
      {
        id: 'backend-architect',
        name: '后端架构师',
        icon: '🏗️',
        specialty: '车企云服务、用户账号系统、远程控制',
        scenario: '互联汽车需要强大后端支持',
        description: '架构车企云端服务和远程控制平台'
      },
      {
        id: 'ai-engineer',
        name: 'AI工程师',
        icon: '🤖',
        specialty: '自动驾驶模型部署、智能语音、NLP交互',
        scenario: 'AI是现代汽车核心竞争力',
        description: '部署和优化自动驾驶、智能语音AI模型'
      },
      {
        id: 'wechat-miniprogram-developer',
        name: '微信小程序开发者',
        icon: '💬',
        specialty: '车企官方小程序、购车预约、车主服务',
        scenario: '中国用户需要微信生态服务',
        description: '开发车企微信小程序，提供车主服务'
      }
    ];
  }

  /**
   * 测试与验证角色
   */
  getTestingRoles() {
    return [
      {
        id: 'qa-engineer',
        name: 'QA测试工程师',
        icon: '🧪',
        specialty: '车载软件测试、OTA测试、功能测试',
        scenario: '汽车软件必须零缺陷',
        description: '全面测试车载软件，确保质量安全'
      },
      {
        id: 'incident-response-commander',
        name: '事件响应指挥官',
        icon: '🚨',
        specialty: '召回处理、软件缺陷应急响应',
        scenario: '严重缺陷可能导致召回，需要快速响应',
        description: '快速响应处理生产事件，减少损失'
      },
      {
        id: 'threat-detection-engineer',
        name: '威胁检测工程师',
        icon: '🔍',
        specialty: '车载网络安全监控、入侵检测',
        scenario: '智能网联汽车需要持续安全监控',
        description: '监控车载网络安全，及时发现入侵威胁'
      }
    ];
  }

  /**
   * 市场与用户运营角色
   */
  getMarketingRoles() {
    return [
      {
        id: 'copywriter',
        name: '文案策划',
        icon: '📣',
        specialty: '新车上市文案、产品手册、营销内容',
        scenario: '汽车营销需要优质文案',
        description: '创作吸引人的汽车营销文案'
      },
      {
        id: 'growth-marketer',
        name: '增长营销专家',
        icon: '📈',
        specialty: '线索增长、转化率优化、获客',
        scenario: '车企需要持续获客',
        description: '优化获客漏斗，提升转化率'
      },
      {
        id: 'seo-specialist',
        name: 'SEO专家',
        icon: '🧐',
        specialty: '搜索引擎优化、关键词研究',
        scenario: '提升官网搜索排名，获得更多线索',
        description: '优化车企官网SEO，获得更多潜在客户'
      },
      {
        id: 'community-manager',
        name: '社区运营经理',
        icon: '🤝',
        specialty: '车主社区运营、用户互动',
        scenario: '用户运营提升品牌忠诚度',
        description: '运营车主社区，提升品牌忠诚度和口碑'
      },
      {
        id: 'support-specialist',
        name: '用户支持专家',
        icon: '🙏',
        specialty: '车载系统用户问题解答、技术支持',
        scenario: '智能网联汽车需要持续用户支持',
        description: '解答用户问题，提供优质售后服务'
      }
    ];
  }

  /**
   * 战略与创新角色
   */
  getStrategyRoles() {
    return [
      {
        id: 'innovation-consultant',
        name: '创新顾问',
        icon: '💡',
        specialty: '新出行商业模式探索、智能化转型',
        scenario: '汽车行业处于大变革时期，需要创新',
        description: '探索新出行商业模式，推动智能化转型'
      },
      {
        id: 'opportunity-assessor',
        name: '机会评估师',
        icon: '🎯',
        specialty: '新技术投资评估（自动驾驶、电池技术）',
        scenario: '需要评估新技术商业化机会',
        description: '评估新技术投资机会，降低决策风险'
      },
      {
        id: 'devils-advocate',
        name: '反向论证专家',
        icon: '🕵️',
        specialty: '新产品线风险评估、投资决策复核',
        scenario: '重大投资决策需要反向视角',
        description: '挑战假设，发现潜在风险，提升决策质量'
      }
    ];
  }

  /**
   * 获取整车厂完整配置推荐
   */
  getFullOEMRecommendation() {
    return {
      title: '🏢 大型整车厂（智能网联方向）完整配置',
      totalRoles: 20,
      departments: [
        {
          name: '研发部门',
          count: 8,
          roles: [
            '嵌入式固件工程师 × 多团队',
            '软件架构师',
            '前端（车机HMI）',
            '后端（云服务）',
            'AI工程师（自动驾驶/语音）',
            '安全工程师',
            'DevOps自动化',
            'SRE（云服务稳定性）'
          ]
        },
        {
          name: '数据部门',
          count: 3,
          roles: [
            '数据工程师',
            'AI数据修复工程师',
            '数据库优化'
          ]
        },
        {
          name: '质量测试',
          count: 3,
          roles: [
            'QA测试工程师',
            '安全威胁检测',
            '事件响应指挥官'
          ]
        },
        {
          name: '产品项目',
          count: 2,
          roles: [
            '产品战略师',
            '项目经理'
          ]
        },
        {
          name: '数字化营销',
          count: 4,
          roles: [
            'UI/UX设计师（车机）',
            '微信小程序开发',
            '增长营销',
            '社区运营'
          ]
        },
        {
          name: '战略创新',
          count: 2,
          roles: [
            '创新顾问',
            '机会评估'
          ]
        }
      ]
    };
  }

  /**
   * 获取动力电池/零部件供应商推荐
   */
  getSupplierRecommendation() {
    return {
      title: '🔋 动力电池/零部件供应商重点角色',
      roles: [
        '嵌入式固件开发（BMS/电机控制）',
        '数据工程师（电池数据分析）',
        '质量工程师（IATF16949）',
        '安全工程师（功能安全 ISO 26262）',
        '业务分析师（制造流程优化）'
      ]
    };
  }

  /**
   * 生成HTML展示页面
   */
  generateHTML() {
    const allRoles = this.getAllRoles();
    const oemRec = this.getFullOEMRecommendation();
    const supplierRec = this.getSupplierRecommendation();

    let html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🚗 MOSS-AI 汽车企业专属AI角色配置</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/css/font-awesome.min.css" rel="stylesheet">
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            primary: '#2563eb',
            accent: '#dc2626',
            automotive: '#16a34a',
          }
        }
      }
    }
  </script>
  <style>
    body { background: linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%); }
    .role-card:hover { transform: translateY(-2px); box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); }
    .role-card { transition: all 0.2s; }
  </style>
</head>
<body>
  <div class="container mx-auto px-4 py-8 max-w-7xl">
    <!-- Header -->
    <header class="text-center mb-12">
      <h1 class="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
        <i class="fa fa-car text-automotive mr-3"></i>
        汽车企业专属AI角色配置
      </h1>
      <p class="text-xl text-gray-600">MOSS-AI · 为整车厂和零部件供应商量身定制的专业AI角色集合</p>
    </header>

    <!-- Recommendation Card -->
    <section class="mb-10">
      <div class="bg-white rounded-2xl shadow-lg border border-green-100 overflow-hidden p-6">
        <h2 class="text-2xl font-bold text-gray-800 mb-4 flex items-center">
          <i class="fa fa-lightbulb-o text-yellow-500 mr-3"></i>
          快速配置推荐
        </h2>
        <div class="grid md:grid-cols-2 gap-6">
          <!-- OEM Recommendation -->
          <div class="bg-blue-50 rounded-xl p-5">
            <h3 class="text-lg font-semibold text-blue-900 mb-3">🏢 整车厂（智能网联）</h3>
            <p class="text-blue-800 text-sm mb-3"><strong>总计:</strong> ${oemRec.totalRoles} 个专业角色</p>
            <ul class="text-sm text-blue-700 space-y-1">
              ${oemRec.departments.map(dept => `
                <li><strong>${dept.name} (${dept.count}):</strong> ${dept.roles.length} 个角色</li>
              `).join('')}
            </ul>
          </div>
          <!-- Supplier Recommendation -->
          <div class="bg-green-50 rounded-xl p-5">
            <h3 class="text-lg font-semibold text-green-900 mb-3">🔋 零部件/动力电池供应商</h3>
            <ul class="text-sm text-green-700 space-y-1">
              ${supplierRec.roles.map(role => `<li>• ${role}</li>`).join('')}
            </ul>
          </div>
        </div>
      </div>
    </section>
`;

    // Add each department
    const departments = [
      { key: 'coreRND', title: '💻 核心研发部门', icon: 'cogs', color: 'blue' },
      { key: 'design', title: '🎨 设计部门', icon: 'paint-brush', color: 'purple' },
      { key: 'manufacturing', title: '🏭 制造与供应链', icon: 'industry', color: 'orange' },
      { key: 'digital', title: '📱 数字化与用户交互', icon: 'mobile', color: 'teal' },
      { key: 'testing', title: '🔍 测试与验证', icon: 'search', color: 'red' },
      { key: 'marketing', title: '📣 市场与用户运营', icon: 'bullhorn', color: 'pink' },
      { key: 'strategy', title: '🧠 战略与创新', icon: 'lightbulb-o', color: 'yellow' }
    ];

    departments.forEach(dept => {
      const roles = allRoles[dept.key];
      const bgColor = {
        blue: 'bg-blue-50 border-blue-100',
        purple: 'bg-purple-50 border-purple-100',
        orange: 'bg-orange-50 border-orange-100',
        teal: 'bg-teal-50 border-teal-100',
        red: 'bg-red-50 border-red-100',
        pink: 'bg-pink-50 border-pink-100',
        yellow: 'bg-yellow-50 border-yellow-100'
      }[dept.color];

      html += `
    <section class="mb-10">
      <div class="bg-white rounded-xl shadow-sm border ${dept.color !== 'yellow' ? 'border-gray-100' : 'border-yellow-100'} overflow-hidden">
        <div class="px-6 py-4 bg-gradient-to-r from-${dept.color}-50 to-white border-b border-${dept.color}-100">
          <h2 class="text-2xl font-bold text-gray-800 flex items-center">
            <i class="fa fa-${dept.icon} text-${dept.color}-600 mr-3"></i>
            ${dept.title}
          </h2>
        </div>
        <div class="p-6">
          <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
`;

      roles.forEach(role => {
        html += `
            <div class="role-card bg-white border border-gray-200 rounded-xl p-4 hover:border-${dept.color}-300">
              <div class="flex items-start">
                <span class="text-2xl mr-3">${role.icon}</span>
                <div class="flex-1">
                  <h3 class="font-semibold text-gray-900 mb-1">${role.name}</h3>
                  <p class="text-sm text-gray-600 mb-2">${role.specialty}</p>
                  <p class="text-xs text-gray-500">${role.description}</p>
                </div>
              </div>
            </div>
`;
      });

      html += `
          </div>
        </div>
      </div>
    </section>
`;
    });

    // Footer
    html += `
    <footer class="text-center py-8 text-gray-500 border-t border-gray-200 mt-12">
      <p class="mb-2">🚗 MOSS-AI 汽车企业专属AI角色库</p>
      <p class="text-sm">让专业AI干专业活 · 赋能汽车行业智能化转型</p>
    </footer>
  </div>
</body>
</html>
`;

    return html;
  }

  /**
   * 执行技能
   */
  async execute(params, context) {
    const html = this.generateHTML();
    const fs = require('fs');
    const path = require('path');

    const outputPath = path.join(__dirname, 'automotive-roles.html');
    fs.writeFileSync(outputPath, html);

    return {
      success: true,
      message: '已成功创建汽车企业专属AI角色配置页面',
      data: {
        totalRoles: Object.values(this.getAllRoles()).reduce((sum, dept) => sum + dept.length, 0),
        outputPath,
        url: `file://${outputPath}`
      },
      htmlPath: outputPath
    };
  }
}

module.exports = AutomotiveEnterpriseRolesSkill;
