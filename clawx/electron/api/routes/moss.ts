import type { IncomingMessage, ServerResponse } from 'http';
import { request as httpRequest } from 'http';
import { URL } from 'url';
import type { HostApiContext } from '../context';
import { getSetting } from '../../utils/store';
import { parseJsonBody, sendJson } from '../route-utils';

async function getMossConfig() {
  const [enabled, baseUrl] = await Promise.all([
    getSetting('mossEnabled'),
    getSetting('mossApiBaseUrl'),
  ]);
  const normalizedBase = String(baseUrl || '').trim() || 'http://127.0.0.1:3001';
  return { enabled: !!enabled, baseUrl: normalizedBase.replace(/\/+$/, '') };
}

function forwardJson(
  targetUrl: string,
  method: string,
  body: unknown,
): Promise<{ status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(targetUrl);
    const payload = body ? Buffer.from(JSON.stringify(body)) : Buffer.alloc(0);
    const req = httpRequest(
      {
        protocol: urlObj.protocol,
        hostname: urlObj.hostname,
        port: urlObj.port || '80',
        path: urlObj.pathname + urlObj.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': payload.length,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c as Buffer));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          try {
            const json = raw ? JSON.parse(raw) : null;
            resolve({ status: res.statusCode || 500, json });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on('error', reject);
    if (payload.length > 0) req.write(payload);
    req.end();
  });
}

export async function handleMossRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  _ctx: HostApiContext,
): Promise<boolean> {
  if (!url.pathname.startsWith('/api/moss')) {
    return false;
  }

  try {
    const { enabled, baseUrl } = await getMossConfig();
    if (!enabled) {
      sendJson(res, 503, { success: false, error: 'moss-ai integration is disabled in settings' });
      return true;
    }

    // Health check: lightweight GET to moss-ai
    if (url.pathname === '/api/moss/health' && req.method === 'GET') {
      const healthUrl = `${baseUrl}/api/openclaw/models`;
      try {
        const result = await forwardJson(healthUrl, 'GET', null);
        const ok = result.status >= 200 && result.status < 300;
        sendJson(res, ok ? 200 : result.status, {
          success: ok,
          status: result.status,
          data: result.json,
        });
      } catch (error) {
        sendJson(res, 500, { success: false, error: String(error) });
      }
      return true;
    }

    // List moss-ai agents
    if (url.pathname === '/api/moss/agents' && req.method === 'GET') {
      const agentsUrl = `${baseUrl}/api/agents`;
      try {
        const result = await forwardJson(agentsUrl, 'GET', null);
        const ok = result.status >= 200 && result.status < 300;
        sendJson(res, ok ? 200 : result.status, {
          success: ok,
          status: result.status,
          data: result.json,
        });
      } catch (error) {
        sendJson(res, 500, { success: false, error: String(error) });
      }
      return true;
    }

    // Start Bytebot desktop for given agentId via moss-ai /api/kasm/:agentId/chrome/start
    if (url.pathname === '/api/moss/bytebot/start' && req.method === 'POST') {
      const body = await parseJsonBody<{ agentId: string }>(req);
      const agentId = String(body?.agentId || '').trim();
      if (!agentId) {
        sendJson(res, 400, { success: false, error: 'agentId is required' });
        return true;
      }

      const startUrl = `${baseUrl}/api/kasm/${encodeURIComponent(agentId)}/chrome/start`;
      try {
        const result = await forwardJson(startUrl, 'POST', {});
        const ok = result.status >= 200 && result.status < 300;
        sendJson(res, ok ? 200 : result.status, {
          success: ok,
          status: result.status,
          data: result.json,
        });
      } catch (error) {
        sendJson(res, 500, { success: false, error: String(error) });
      }
      return true;
    }

    // No matching moss route
    return false;
  } catch (error) {
    sendJson(res, 500, { success: false, error: String(error) });
    return true;
  }
}

