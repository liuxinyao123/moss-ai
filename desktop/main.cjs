// 防止 ELECTRON_RUN_AS_NODE 环境变量导致 Electron 以 Node.js 模式运行
if (process.env.ELECTRON_RUN_AS_NODE) {
  delete process.env.ELECTRON_RUN_AS_NODE;
}

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

let mainWindow;
const LOCAL_PROXY_BYPASS = '<-loopback>;localhost;127.0.0.1;::1';

function ensureLocalNoProxyEnv() {
  const extras = ['localhost', '127.0.0.1', '::1'];
  const current = String(process.env.NO_PROXY || process.env.no_proxy || '').trim();
  const merged = current
    ? Array.from(new Set(current.split(',').map(v => v.trim()).filter(Boolean).concat(extras))).join(',')
    : extras.join(',');
  process.env.NO_PROXY = merged;
  process.env.no_proxy = merged;
}

ensureLocalNoProxyEnv();
app.commandLine.appendSwitch('proxy-bypass-list', LOCAL_PROXY_BYPASS);
app.on('certificate-error', (event, _webContents, url, _error, _certificate, callback) => {
  try {
    const parsed = new URL(String(url || ''));
    const host = String(parsed.hostname || '').toLowerCase();
    if ((host === '127.0.0.1' || host === 'localhost' || host === '::1') && parsed.protocol === 'https:') {
      event.preventDefault();
      callback(true);
      return;
    }
  } catch {}
  callback(false);
});

function migrateLegacyUserData() {
  try {
    const appDataDir = app.getPath('appData');
    const currentDir = app.getPath('userData');
    const legacyDir = path.join(appDataDir, 'dclaw');
    const currentHasData = fs.existsSync(currentDir) && fs.readdirSync(currentDir).length > 0;
    if (!fs.existsSync(legacyDir) || currentHasData) return;
    fs.cpSync(legacyDir, currentDir, { recursive: true });
  } catch (e) {
    console.warn('Failed to migrate legacy Dclaw data:', e);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#050b12',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Allow self-signed certs only for local embedded services (Kasm/noVNC on localhost).
  mainWindow.webContents.session.setCertificateVerifyProc((request, callback) => {
    const host = String(request?.hostname || '').toLowerCase();
    if (host === '127.0.0.1' || host === 'localhost' || host === '::1') {
      callback(0);
      return;
    }
    callback(-3);
  });

  mainWindow.loadFile('index.html');

  // Open DevTools in development
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  app.setName('DSclaw');
  migrateLegacyUserData();
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('read-gateway-token', async () => {
  try {
    const configPath = path.join(require('os').homedir(), '.openclaw', 'openclaw.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return {
      token: config.gateway.auth.token,
      port: config.gateway.port || 18789
    };
  } catch (e) {
    console.error('Failed to read gateway token:', e);
    return { error: '无法读取 AI 服务配置，请确保 AI Gateway 已正确配置' };
  }
});

ipcMain.handle('set-demo-scene-window-state', async (_event, action) => {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { success: false, error: '主窗口不可用' };
    }

    const nextAction = String(action || '').trim();
    if (nextAction === 'hide-for-cad') {
      if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
      mainWindow.setAlwaysOnTop(false);
      mainWindow.minimize();
      mainWindow.blur();
      if (process.platform === 'darwin') app.hide();
      return { success: true };
    }

    if (nextAction === 'restore-after-cad') {
      if (process.platform === 'darwin') app.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      return { success: true };
    }

    return { success: false, error: `未知窗口动作: ${nextAction}` };
  } catch (e) {
    console.error('Failed to change demo scene window state:', e);
    return { success: false, error: e.message || '窗口状态切换失败' };
  }
});

ipcMain.handle('send-to-ai', async (event, payload) => {
  try {
    // 兼容旧调用：sendToAI("hello")
    const req = (typeof payload === 'string' || payload == null)
      ? { message: String(payload || '') }
      : payload;
    const agentId = String(req?.agentId || '').trim();
    const sessionId = String(req?.conversationId || req?.sessionId || '').trim();
    const messages = Array.isArray(req?.messages) ? req.messages : [];
    const latestUserMessage = [...messages].reverse().find(m => m?.role === 'user' && m?.content)?.content
      || String(req?.message || '');
    if (!agentId || !sessionId || !latestUserMessage) {
      return {
        success: false,
        error: '缺少 agentId / conversationId / user message',
        actualModel: req?.model || null,
        source: 'electron-openclaw-session'
      };
    }

    const extractJsonFromMixedOutput = (raw) => {
      const text = String(raw || '').trim();
      for (let i = 0; i < text.length; i++) {
        if (text[i] !== '{') continue;
        try {
          return JSON.parse(text.slice(i));
        } catch (_) {}
      }
      return null;
    };
    const unwrapOpenClawAgentResult = (data) => {
      if (!data || typeof data !== 'object') return {};
      return (data.result && typeof data.result === 'object') ? data.result : data;
    };
    const buildFullModelId = (provider, model) => {
      const p = String(provider || '').trim();
      const m = String(model || '').trim();
      if (!m) return req?.model || null;
      if (m.includes('/')) return m;
      return p ? `${p}/${m}` : m;
    };
    const buildSafeExecutionTrace = (actualModel, sessionId, data) => {
      const meta = data?.meta || {};
      const promptFiles = Array.isArray(meta?.systemPromptReport?.injectedWorkspaceFiles)
        ? meta.systemPromptReport.injectedWorkspaceFiles.map(f => f?.name).filter(Boolean)
        : [];
      const payloadCount = Array.isArray(data?.payloads) ? data.payloads.length : 0;
      const durationMs = Number(meta?.durationMs || 0);
      const stopReason = meta?.stopReason || null;
      return {
        sessionId,
        source: 'electron-openclaw-session',
        actualModel,
        durationMs,
        stopReason,
        payloadCount,
        promptFiles,
        stages: [
          { key: 'session', label: `绑定会话 ${sessionId}`, status: 'completed' },
          { key: 'invoke', label: '调用 AI 智能体', status: 'completed' },
          { key: 'response', label: `收到 ${payloadCount} 段回复`, status: 'completed' }
        ],
        summary: `本轮请求复用了会话 ${sessionId}，由 ${actualModel} 完成，耗时 ${durationMs}ms。`
      };
    };

    const rawData = await new Promise((resolve, reject) => {
      const args = [
        'agent',
        '--agent', agentId,
        '--session-id', sessionId,
        '--message', String(latestUserMessage),
        '--json'
      ];
      execFile('openclaw', args, { timeout: 180000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error((stderr || stdout || err.message || 'AI 执行失败').toString()));
          return;
        }
        const parsed = extractJsonFromMixedOutput(stdout);
        if (!parsed) {
          reject(new Error('AI 返回结果无法解析为 JSON'));
          return;
        }
        resolve(parsed);
      });
    });
    const data = unwrapOpenClawAgentResult(rawData);

    const actualModel = buildFullModelId(data?.meta?.agentMeta?.provider, data?.meta?.agentMeta?.model);
    return {
      success: true,
      response: Array.isArray(data?.payloads)
        ? data.payloads.map(p => p?.text || '').filter(Boolean).join('\n\n')
        : '',
      actualModel,
      sessionId: data?.meta?.agentMeta?.sessionId || sessionId,
      source: 'electron-openclaw-session',
      trace: buildSafeExecutionTrace(actualModel, data?.meta?.agentMeta?.sessionId || sessionId, data)
    };
  } catch (e) {
    console.error('Connection error:', e);
    return { 
      success: false, 
      error: `连接错误: ${e.message}`,
      actualModel: (typeof payload === 'object' && payload && payload.model) ? String(payload.model) : null,
      source: 'electron-openclaw-session',
      trace: {
        sessionId: (typeof payload === 'object' && payload && (payload.conversationId || payload.sessionId)) ? String(payload.conversationId || payload.sessionId) : null,
        source: 'electron-openclaw-session',
        actualModel: (typeof payload === 'object' && payload && payload.model) ? String(payload.model) : null,
        durationMs: 0,
        stopReason: 'error',
        payloadCount: 0,
        promptFiles: [],
        stages: [
          { key: 'invoke', label: '调用 AI 智能体', status: 'error' }
        ],
        summary: `请求执行失败：${e.message}`
      }
    };
  }
});
