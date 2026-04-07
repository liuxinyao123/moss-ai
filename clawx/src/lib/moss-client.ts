import { hostApiFetch } from './host-api';

export interface MossHealthResponse {
  success: boolean;
  status?: number;
  data?: unknown;
  error?: string;
}

export interface MossAgent {
  id: string;
  name: string;
  model?: string;
  [key: string]: unknown;
}

export interface MossAgentsResponse {
  success: boolean;
  status?: number;
  data?: {
    agents?: MossAgent[];
    [key: string]: unknown;
  } | MossAgent[] | unknown;
  error?: string;
}

export interface MossBytebotStartResponse {
  success: boolean;
  status?: number;
  data?: {
    data?: {
      connectionUrl?: string;
      [key: string]: unknown;
    };
    connectionUrl?: string;
    [key: string]: unknown;
  } | {
    connectionUrl?: string;
    [key: string]: unknown;
  } | unknown;
  error?: string;
}

export async function getMossHealth(): Promise<MossHealthResponse> {
  return await hostApiFetch<MossHealthResponse>('/api/moss/health');
}

export async function listMossAgents(): Promise<MossAgent[]> {
  const resp = await hostApiFetch<MossAgentsResponse>('/api/moss/agents');
  if (!resp.success) {
    throw new Error(resp.error || '无法获取 moss-ai agents 列表');
  }
  const raw = resp.data;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as MossAgent[];
  if (Array.isArray((raw as any).agents)) return (raw as any).agents as MossAgent[];
  return [];
}

export async function startMossBytebot(agentId: string): Promise<string> {
  const resp = await hostApiFetch<MossBytebotStartResponse>('/api/moss/bytebot/start', {
    method: 'POST',
    body: JSON.stringify({ agentId }),
  });
  if (!resp.success) {
    throw new Error(resp.error || '启动 Bytebot 会话失败');
  }
  const data = resp.data as any;
  const nested = data?.data;
  const url: string | undefined =
    nested?.connectionUrl ||
    data?.connectionUrl;
  if (!url) {
    throw new Error('moss-ai 未返回可用的 connectionUrl');
  }
  return url;
}

