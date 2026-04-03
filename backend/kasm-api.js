const express = require('express');
const { BytebotClient } = require('../lib/bytebot');

/**
 * 兼容旧路径的 Bytebot 路由
 *
 * 为了不改动桌面端 JS，这里继续挂载在 `/api/kasm/*`，
 * 但内部已经完全改为调度 Bytebot，自此不再依赖 Kasm/Docker。
 */
function createKasmRouter({ bytebotConfig }) {
  const router = express.Router();
  const client = new BytebotClient(bytebotConfig || {});

  const normalizeAgentId = (req) => String(req.params.agentId || '').trim();

  const buildResponse = () => {
    const url = client.getUiUrl();
    return {
      // 为了兼容桌面端结构，这里模拟 chrome/desktop 两个会话都指向同一个 Bytebot UI
      chrome: url
        ? {
            containerId: null,
            containerName: 'bytebot-session',
            port: null,
            connectionUrl: url,
          }
        : null,
      desktop: url
        ? {
            containerId: null,
            containerName: 'bytebot-session',
            port: null,
            connectionUrl: url,
          }
        : null,
    };
  };

  router.get('/:agentId/status', async (req, res) => {
    try {
      const agentId = normalizeAgentId(req);
      if (!agentId) return res.status(400).json({ success: false, error: 'agentId is required' });

      const ok = await client.ping();
      if (!ok) {
        return res.status(503).json({
          success: false,
          error: 'Bytebot 未就绪，请确认 Bytebot 已按照文档启动（端口 9992/9991/9990）',
        });
      }

      return res.json({
        success: true,
        data: {
          agentId,
          ...buildResponse(),
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // 旧的 chrome/desktop/start 现在统一视为“打开 Bytebot 桌面”
  router.post('/:agentId/chrome/start', async (req, res) => {
    try {
      const agentId = normalizeAgentId(req);
      if (!agentId) return res.status(400).json({ success: false, error: 'agentId is required' });

      const ok = await client.ping();
      if (!ok) {
        return res.status(503).json({
          success: false,
          error: 'Bytebot 未就绪，请确认 Bytebot 已按照文档启动（端口 9992/9991/9990）',
        });
      }

      // 可选：在 Bytebot 内创建一个任务，方便追踪
      try {
        await client.createTask('Open desktop for agent', {
          metadata: { agentId, source: 'moss-ai-kasm-compat' },
        });
      } catch {
        // 创建任务失败不影响前端打开 UI，只记录在控制台
      }

      return res.json({
        success: true,
        data: {
          connectionUrl: client.getUiUrl(),
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post('/:agentId/desktop/start', async (req, res) => {
    // 行为同 chrome/start，仅为兼容
    return router.handle(req, res);
  });

  router.post('/:agentId/stop', async (req, res) => {
    try {
      const agentId = normalizeAgentId(req);
      if (!agentId) return res.status(400).json({ success: false, error: 'agentId is required' });

      // Bytebot 会话由 Bytebot 自己管理，这里只返回成功，前端会清空 webview。
      return res.json({
        success: true,
        data: { agentId, chromeStopped: true, desktopStopped: true },
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = { createKasmRouter };

