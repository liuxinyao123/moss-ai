import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useSettingsStore } from '@/stores/settings';
import { getMossHealth, listMossAgents, startMossBytebot, type MossAgent } from '@/lib/moss-client';

interface MossStatus {
  loading: boolean;
  ok: boolean;
  message: string;
}

export function Moss() {
  const mossEnabled = useSettingsStore((s) => s.mossEnabled);
  const mossApiBaseUrl = useSettingsStore((s) => s.mossApiBaseUrl);

  const [status, setStatus] = useState<MossStatus>({
    loading: true,
    ok: false,
    message: '正在检测 moss-ai 服务…',
  });
  const [agents, setAgents] = useState<MossAgent[]>([]);
  const [busyAgentId, setBusyAgentId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const health = await getMossHealth();
        if (cancelled) return;
        if (health.success) {
          setStatus({
            loading: false,
            ok: true,
            message: `已连接到 moss-ai (${mossApiBaseUrl || '默认地址'})`,
          });
          const list = await listMossAgents();
          if (!cancelled) setAgents(list);
        } else {
          setStatus({
            loading: false,
            ok: false,
            message: health.error || 'moss-ai 健康检查失败',
          });
        }
      } catch (error) {
        if (cancelled) return;
        setStatus({
          loading: false,
          ok: false,
          message: String(error),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mossApiBaseUrl]);

  const handleStartBytebot = async (agentId: string) => {
    try {
      setBusyAgentId(agentId);
      const url = await startMossBytebot(agentId);
      if (url) {
        // Prefer opening in external browser for now.
        window.electron.openExternal(url);
      }
    } catch (error) {
       
      alert(`启动 Bytebot 会话失败：${String(error)}`);
    } finally {
      setBusyAgentId((prev) => (prev === agentId ? null : prev));
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6 h-full overflow-auto">
      <div>
        <h1 className="text-xl font-semibold tracking-tight mb-1">Moss Workbench</h1>
        <p className="text-sm text-muted-foreground">
          通过 ClawX 使用 moss-ai 的本地工作台与 Bytebot 桌面能力。
        </p>
      </div>

      <div className="rounded-lg border bg-background/60 p-4 space-y-2">
        <div className="text-sm font-medium">连接状态</div>
        {!mossEnabled && (
          <p className="text-sm text-red-500">
            moss-ai 集成已在设置中关闭。请在设置中启用后再使用本页面。
          </p>
        )}
        {mossEnabled && (
          <p className="text-sm text-muted-foreground">
            {status.loading ? '正在检测 moss-ai 服务…' : status.message}
          </p>
        )}
      </div>

      <div className="rounded-lg border bg-background/60 p-4 flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-medium">moss-ai 智能体</div>
            <p className="text-xs text-muted-foreground">
              从 moss-ai 后端读取智能体列表，为每个智能体打开对应的 Bytebot 桌面会话。
            </p>
          </div>
        </div>

        {!status.ok && !status.loading && (
          <div className="text-sm text-red-500">
            无法连接 moss-ai，请确认 moss-ai 已在本机 {mossApiBaseUrl || 'http://127.0.0.1:3001'} 运行。
          </div>
        )}

        {status.ok && agents.length === 0 && (
          <div className="text-sm text-muted-foreground">
            当前未从 moss-ai 读取到智能体。你可以在 moss-ai 中创建智能体后刷新本页面。
          </div>
        )}

        {status.ok && agents.length > 0 && (
          <div className="mt-2 space-y-2">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{agent.name || agent.id}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    ID: {agent.id}{agent.model ? ` · 模型: ${agent.model}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyAgentId === agent.id}
                    onClick={() => handleStartBytebot(agent.id)}
                  >
                    {busyAgentId === agent.id ? '启动中…' : '打开 Bytebot 桌面'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

