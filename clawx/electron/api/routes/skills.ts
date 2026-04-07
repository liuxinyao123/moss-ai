import type { IncomingMessage, ServerResponse } from 'http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAllSkillConfigs, updateSkillConfig } from '../../utils/skill-config';
import { listAgentsSnapshot } from '../../utils/agent-config';
import type { HostApiContext } from '../context';
import { parseJsonBody, sendJson } from '../route-utils';
import { expandPath } from '../../utils/paths';

type SkillToExpertPayload = {
  id: string;
  slug?: string;
  name: string;
  description?: string;
  version?: string;
  author?: string;
  source?: string;
};

function upsertSkillPersonaSection(identityText: string, personaMarkdown: string): string {
  const marker = '## 技能专家人设';
  const nextBlock = `${marker}\n${personaMarkdown.trim()}\n`;

  if (!identityText || !identityText.trim()) {
    return `${nextBlock}\n`;
  }

  if (identityText.includes(marker)) {
    const parts = identityText.split(marker);
    return `${parts[0].trimEnd()}\n\n${nextBlock}\n`;
  }

  return `${identityText.trimEnd()}\n\n${nextBlock}\n`;
}

function buildSkillExpertPersonaMarkdown(skill: SkillToExpertPayload): string {
  const lines: string[] = [];
  const name = (skill.name || skill.id || skill.slug || '').trim();
  const desc = (skill.description || '').trim();
  const key = (skill.slug || skill.id || '').trim();

  lines.push(`你现在是「${name}」技能的资深专家。`);
  if (key) lines.push(`- 技能标识：\`${key}\``);
  if (skill.version) lines.push(`- 技能版本：\`${String(skill.version).trim()}\``);
  if (skill.source) lines.push(`- 技能来源：\`${String(skill.source).trim()}\``);
  if (skill.author) lines.push(`- 作者：${String(skill.author).trim()}`);
  if (desc) {
    lines.push('');
    lines.push(`### 背景与边界`);
    lines.push(desc);
  }

  lines.push('');
  lines.push('### 工作方式（强约束）');
  lines.push('- 先用 3-6 个澄清问题锁定目标、输入、输出、约束与验收标准。');
  lines.push('- 给出可执行步骤与最小可行方案（MVP），再给增强项。');
  lines.push('- 优先复用现有系统能力（已有接口/现有技能/现有配置），避免大改架构。');
  lines.push('- 输出时始终包含：结论、关键依据、下一步行动清单。');

  lines.push('');
  lines.push('### 失败与风险处理');
  lines.push('- 如果技能缺少权限/依赖/环境，明确指出缺口并给替代方案或降级路径。');
  lines.push('- 不编造不可验证的细节；对不确定信息用“需要确认/建议验证”的方式表达。');

  return lines.join('\n');
}

async function resolveIdentityPathForAgent(agentId: string): Promise<string | null> {
  const snapshot = await listAgentsSnapshot();
  const agent = snapshot.agents.find((a) => a.id === agentId);
  if (!agent) return null;

  const workspaceIdentityPath = expandPath(join(agent.workspace || '', 'IDENTITY.md'));
  const legacyIdentityPath = expandPath(join('~/.openclaw', `workspace-${agent.id}`, 'IDENTITY.md'));
  const identityPath = (agent.workspace && existsSync(expandPath(agent.workspace)))
    ? workspaceIdentityPath
    : legacyIdentityPath;
  return identityPath;
}

export async function handleSkillRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  ctx: HostApiContext,
): Promise<boolean> {
  if (url.pathname === '/api/skills/configs' && req.method === 'GET') {
    sendJson(res, 200, await getAllSkillConfigs());
    return true;
  }

  if (url.pathname === '/api/skills/config' && req.method === 'PUT') {
    try {
      const body = await parseJsonBody<{
        skillKey: string;
        apiKey?: string;
        env?: Record<string, string>;
      }>(req);
      sendJson(res, 200, await updateSkillConfig(body.skillKey, {
        apiKey: body.apiKey,
        env: body.env,
      }));
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/skills/skill-to-expert' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{ agentId: string; skill: SkillToExpertPayload }>(req);
      const agentId = String(body?.agentId || '').trim();
      const skill = body?.skill;
      if (!agentId) {
        sendJson(res, 400, { success: false, error: 'Missing agentId' });
        return true;
      }
      if (!skill || typeof skill !== 'object' || !String(skill.id || '').trim()) {
        sendJson(res, 400, { success: false, error: 'Missing skill payload' });
        return true;
      }

      const identityPath = await resolveIdentityPathForAgent(agentId);
      if (!identityPath) {
        sendJson(res, 404, { success: false, error: `Unknown agentId: ${agentId}` });
        return true;
      }

      const existing = existsSync(identityPath) ? readFileSync(identityPath, 'utf-8') : '';
      const persona = buildSkillExpertPersonaMarkdown(skill);
      const next = upsertSkillPersonaSection(existing, persona);
      writeFileSync(identityPath, next, 'utf-8');

      // Reload gateway so new identity prompt is picked up by runtime.
      // Best-effort: don't fail the request if gateway is currently stopped.
      if (ctx.gatewayManager.getStatus().state !== 'stopped') {
        ctx.gatewayManager.debouncedReload();
      }

      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/clawhub/search' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<Record<string, unknown>>(req);
      sendJson(res, 200, {
        success: true,
        results: await ctx.clawHubService.search(body),
      });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/clawhub/install' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<Record<string, unknown>>(req);
      await ctx.clawHubService.install(body);
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/clawhub/uninstall' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<Record<string, unknown>>(req);
      await ctx.clawHubService.uninstall(body);
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/clawhub/list' && req.method === 'GET') {
    try {
      sendJson(res, 200, { success: true, results: await ctx.clawHubService.listInstalled() });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/clawhub/open-readme' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{ slug?: string; skillKey?: string; baseDir?: string }>(req);
      await ctx.clawHubService.openSkillReadme(body.skillKey || body.slug || '', body.slug, body.baseDir);
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/clawhub/open-path' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{ slug?: string; skillKey?: string; baseDir?: string }>(req);
      await ctx.clawHubService.openSkillPath(body.skillKey || body.slug || '', body.slug, body.baseDir);
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  return false;
}
