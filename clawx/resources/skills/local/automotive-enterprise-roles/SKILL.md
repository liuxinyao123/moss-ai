# 汽车企业专属AI角色

这是一组面向**整车厂（OEM）/零部件供应商**的专业角色提示词库，用于让 OpenClaw/ClawX 的智能体在汽车研发、制造、质量、数据、信息安全等场景下以“行业专家”的方式思考与输出。

## 你会得到什么

- 可直接注入到智能体人设/系统提示中的角色 Prompt（见 `prompts/`）
- 覆盖典型汽车企业研发与工程岗位
- 适合用于：需求澄清、方案设计、代码生成、流程与合规建议、问题排查

## 角色列表（当前内置）

- `embedded-firmware-engineer`：嵌入式固件工程师（ECU/BMS/MCU/CAN/AUTOSAR/ISO26262）
- `devops-automator`：DevOps 自动化工程师（车载 CI/CD、OTA、质量门禁、IATF）
- `security-engineer-automotive`：安全工程师（车载网络安全、OTA 安全、ECU 安全）
- `software-architect-automotive`：汽车软件架构师（域控、SOA、AUTOSAR Adaptive、OTA 架构）
- `ai-data-remediation`：AI 数据修复工程师（自动驾驶数据清洗/修复）
- `data-engineer-automotive`：数据工程师（车辆数据湖、CAN 信号、日志分析）

## 使用方式（推荐）

1. 在 ClawX 中创建/编辑一个 Agent，把你需要的角色 Prompt 内容粘贴到该 Agent 的人设/系统提示中。\n2. 日常对话中以该 Agent 身份完成任务。\n\n如果你希望自动化切换角色，可以在后续迭代中把这些 prompts 封装成一个“角色选择器”类工具技能（让智能体按任务类型选择并拼接 prompt）。\n+
