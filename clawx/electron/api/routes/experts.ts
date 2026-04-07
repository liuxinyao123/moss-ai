import type { IncomingMessage, ServerResponse } from 'http';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HostApiContext } from '../context';
import { parseJsonBody, sendJson } from '../route-utils';
import { getResourcesDir, expandPath } from '../../utils/paths';
import { createAgent, listAgentsSnapshot } from '../../utils/agent-config';

type ExpertTemplate = {
  key: string;
  name: string;
  category: string;
  title: string;
  description: string;
  tags: string[];
  promptRelPath: string;
};

const automotiveExperts: ExpertTemplate[] = [
  {
    key: 'embedded-firmware-engineer',
    name: '汽车专家：嵌入式固件工程师',
    category: '工程技术',
    title: 'ECU/BMS/MCU/CAN/AUTOSAR/ISO26262',
    description: '面向车载嵌入式与功能安全场景，擅长驱动、协议栈、诊断与量产落地。',
    tags: ['嵌入式', 'AUTOSAR', 'CAN', '功能安全'],
    promptRelPath: 'skills/local/automotive-enterprise-roles/prompts/embedded-firmware-engineer.md',
  },
  {
    key: 'devops-automator',
    name: '汽车专家：DevOps自动化工程师',
    category: '工程技术',
    title: '车载 CI/CD / OTA / 质量门禁 / IATF',
    description: '聚焦车载软件交付与工程效率，擅长流水线、发布策略、质量度量与合规流程。',
    tags: ['CI/CD', 'OTA', '质量门禁', 'IATF'],
    promptRelPath: 'skills/local/automotive-enterprise-roles/prompts/devops-automator.md',
  },
  {
    key: 'security-engineer-automotive',
    name: '汽车专家：安全工程师',
    category: '质量测试',
    title: '车载网络安全 / ECU 安全 / OTA 安全',
    description: '关注威胁建模、漏洞治理与安全架构，覆盖车云链路与 ECU 端到端安全。',
    tags: ['网络安全', 'ECU', 'OTA', '威胁建模'],
    promptRelPath: 'skills/local/automotive-enterprise-roles/prompts/security-engineer-automotive.md',
  },
  {
    key: 'software-architect-automotive',
    name: '汽车专家：软件架构师',
    category: '产品',
    title: '域控 / SOA / Adaptive AUTOSAR / OTA 架构',
    description: '面向整车软件平台与域控演进，擅长架构拆分、接口治理与可演进交付。',
    tags: ['架构', 'SOA', '域控', 'OTA'],
    promptRelPath: 'skills/local/automotive-enterprise-roles/prompts/software-architect-automotive.md',
  },
  {
    key: 'ai-data-remediation',
    name: '汽车专家：AI数据修复工程师',
    category: '工程技术',
    title: '自动驾驶数据清洗 / 修复 / 质量提升',
    description: '聚焦数据集质量与可用性，擅长缺陷定位、规则/模型修复与闭环迭代。',
    tags: ['自动驾驶', '数据修复', '标注', '质量'],
    promptRelPath: 'skills/local/automotive-enterprise-roles/prompts/ai-data-remediation.md',
  },
  {
    key: 'data-engineer-automotive',
    name: '汽车专家：数据工程师',
    category: '项目管理',
    title: '车辆数据湖 / CAN 信号 / 日志分析',
    description: '覆盖采集、治理、分析与指标体系，擅长信号字典、埋点与故障诊断数据链路。',
    tags: ['数据湖', 'CAN信号', '日志', '治理'],
    promptRelPath: 'skills/local/automotive-enterprise-roles/prompts/data-engineer-automotive.md',
  },
];

function loadExpertPrompt(relPath: string): string {
  const abs = join(getResourcesDir(), relPath);
  if (!existsSync(abs)) {
    throw new Error(`Missing expert prompt file: ${abs}`);
  }
  return readFileSync(abs, 'utf-8');
}

function upsertPersonaSection(identityText: string, personaMarkdown: string): string {
  const marker = '## 专家人设';
  const nextBlock = `${marker}\n${personaMarkdown.trim()}\n`;

  if (!identityText || !identityText.trim()) {
    return `${nextBlock}\n`;
  }

  if (identityText.includes(marker)) {
    // Replace existing expert persona section (best-effort).
    const parts = identityText.split(marker);
    // Keep everything before first marker, then overwrite marker section.
    return `${parts[0].trimEnd()}\n\n${nextBlock}\n`;
  }

  return `${identityText.trimEnd()}\n\n${nextBlock}\n`;
}

type SkillExpertAgent = {
  agentId: string;
  name: string;
  workspace?: string;
  headline?: string;
};

const SKILL_EXPERT_MARKER = '## 技能专家人设';

function extractSkillExpertHeadline(identityText: string): string | undefined {
  if (!identityText || !identityText.includes(SKILL_EXPERT_MARKER)) return undefined;
  const idx = identityText.indexOf(SKILL_EXPERT_MARKER);
  const after = identityText.slice(idx + SKILL_EXPERT_MARKER.length);
  const lines = after.split('\n').map((l) => l.trim()).filter(Boolean);
  // Best-effort: first non-empty line after the marker.
  return lines[0];
}

export async function handleExpertsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  _ctx: HostApiContext,
): Promise<boolean> {
  if (url.pathname === '/api/experts/automotive' && req.method === 'GET') {
    sendJson(res, 200, { success: true, experts: automotiveExperts });
    return true;
  }

  if (url.pathname === '/api/experts/skill-experts' && req.method === 'GET') {
    try {
      const snapshot = await listAgentsSnapshot();
      const results: SkillExpertAgent[] = [];

      for (const agent of snapshot.agents) {
        const workspaceIdentityPath = expandPath(join(agent.workspace || '', 'IDENTITY.md'));
        const legacyIdentityPath = expandPath(join('~/.openclaw', `workspace-${agent.id}`, 'IDENTITY.md'));
        const identityPath = (agent.workspace && existsSync(expandPath(agent.workspace)))
          ? workspaceIdentityPath
          : legacyIdentityPath;

        const identityText = existsSync(identityPath) ? readFileSync(identityPath, 'utf-8') : '';
        if (!identityText.includes(SKILL_EXPERT_MARKER)) continue;

        results.push({
          agentId: agent.id,
          name: agent.name,
          workspace: agent.workspace,
          headline: extractSkillExpertHeadline(identityText),
        });
      }

      sendJson(res, 200, { success: true, experts: results });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/experts/automotive/create' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{ key: string }>(req);
      const key = String(body?.key || '').trim();
      const tmpl = automotiveExperts.find((x) => x.key === key);
      if (!tmpl) {
        sendJson(res, 400, { success: false, error: 'Unknown expert key' });
        return true;
      }

      const before = await listAgentsSnapshot();
      await createAgent(tmpl.name, { inheritWorkspace: true });
      const after = await listAgentsSnapshot();

      const beforeIds = new Set(before.agents.map((a) => a.id));
      const created = after.agents.find((a) => !beforeIds.has(a.id) && a.name === tmpl.name)
        ?? after.agents.find((a) => !beforeIds.has(a.id));
      if (!created) {
        sendJson(res, 500, { success: false, error: 'Failed to resolve created agent' });
        return true;
      }

      const prompt = loadExpertPrompt(tmpl.promptRelPath);
      const workspaceIdentityPath = expandPath(join(created.workspace || '', 'IDENTITY.md'));
      const legacyIdentityPath = expandPath(join('~/.openclaw', `workspace-${created.id}`, 'IDENTITY.md'));
      const identityPath = (created.workspace && existsSync(expandPath(created.workspace))) ? workspaceIdentityPath : legacyIdentityPath;
      const existing = existsSync(identityPath) ? readFileSync(identityPath, 'utf-8') : '';
      const next = upsertPersonaSection(existing, prompt);
      writeFileSync(identityPath, next, 'utf-8');

      sendJson(res, 200, { success: true, agentId: created.id, name: created.name });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  return false;
}

