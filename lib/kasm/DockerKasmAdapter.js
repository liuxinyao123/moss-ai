/**
 * DockerKasmAdapter - Direct Docker Adapter for Kasm
 * 
 * 直接通过 Docker API 管理 Kasm 工作区容器
 * 不需要完整的 Kasm Workspaces Manager，就能用
 * 适合嵌入 MOSS-AI 使用
 */

const https = require('https');
const Docker = require('dockerode');

class DockerKasmAdapter {
  constructor(options = {}) {
    this.docker = new Docker({
      socketPath: '/var/run/docker.sock',
      ...options.dockerConfig
    });
    this.portStart = options.portStart || 7000;
    this.workspaces = new Map(); // agentId → containerInfo
  }

  /**
   * 检查 Docker 是否可用
   */
  async ping() {
    try {
      await this.docker.ping();
      return true;
    } catch (error) {
      console.error('[DockerKasmAdapter] Docker not available:', error.message);
      return false;
    }
  }

  /**
   * 为 Agent 创建 Chrome 工作区
   */
  async createChromeWorkspace(agentId) {
    const port = this._getNextPort();
    const containerName = `moss-kasm-chrome-${agentId.replace(/[^a-zA-Z0-9]/g, '-')}`;
    
    // 检查是否已存在
    const existing = this.workspaces.get(agentId);
    if (existing) {
      try {
        const container = this.docker.getContainer(existing.containerId);
        const info = await container.inspect();
        if (info.State.Running) {
          // Reuse existing mapped port; do not allocate a new one.
          return this._getConnectionInfo(agentId, existing, existing.port);
        }
      } catch (error) {
        // 容器不存在或查询失败，清理旧映射后继续创建
        this.workspaces.delete(agentId);
      }
    }

    // 进程重启后内存映射会丢失，尝试按容器名接管现有容器
    const adopted = await this._adoptContainerByName(agentId, containerName, 'kasmweb/chrome:1.14.0');
    if (adopted) return adopted;

    // 创建新容器
    const createOptions = {
      Image: 'kasmweb/chrome:1.14.0',
      name: containerName,
      ExposedPorts: {
        '6901/tcp': {}
      },
      HostConfig: {
        PortBindings: {
          // Bind to localhost only to avoid exposing VNC/noVNC to LAN
          '6901/tcp': [{ HostIp: '127.0.0.1', HostPort: port.toString() }]
        }
      },
      Env: [
        'VNC_PW=vncpassword',
        'VNC_RESOLUTION=1280x720'
      ]
    };

    try {
      const container = await this.docker.createContainer(createOptions);
      await container.start();
      // Port is listening before nginx/noVNC is ready; wait so clients don't get ERR_EMPTY_RESPONSE
      await this._waitForHttpReady(port);

      const info = {
        containerId: container.id,
        containerName,
        port,
        image: 'kasmweb/chrome:1.14.0',
        createdAt: Date.now(),
        agentId
      };

      this.workspaces.set(agentId, info);
      return this._getConnectionInfo(agentId, info, port);
    } catch (error) {
      throw new Error(`Failed to create Chrome workspace: ${error.message}`);
    }
  }

  /**
   * 创建 Ubuntu 桌面工作区
   */
  async createDesktopWorkspace(agentId) {
    const port = this._getNextPort();
    const containerName = `moss-kasm-desktop-${agentId.replace(/[^a-zA-Z0-9]/g, '-')}`;

    // 检查是否已存在
    const existing = this.workspaces.get(agentId);
    if (existing) {
      try {
        const container = this.docker.getContainer(existing.containerId);
        const info = await container.inspect();
        if (info.State.Running) {
          return this._getConnectionInfo(agentId, existing, existing.port);
        }
      } catch (error) {
        // 容器不存在或查询失败，清理旧映射后继续创建
        this.workspaces.delete(agentId);
      }
    }

    // 进程重启后内存映射会丢失，尝试按容器名接管现有容器
    const adopted = await this._adoptContainerByName(agentId, containerName, 'kasmweb/desktop:1.14.0');
    if (adopted) return adopted;
    
    // 拉取镜像如果不存在
    try {
      await this.docker.pull('kasmweb/desktop:1.14.0', {});
    } catch (error) {
      console.warn('[DockerKasmAdapter] Pull warning:', error.message);
    }

    const createOptions = {
      Image: 'kasmweb/desktop:1.14.0',
      name: containerName,
      ExposedPorts: {
        '6901/tcp': {}
      },
      HostConfig: {
        PortBindings: {
          // Bind to localhost only to avoid exposing VNC/noVNC to LAN
          '6901/tcp': [{ HostIp: '127.0.0.1', HostPort: port.toString() }]
        }
      },
      Env: [
        'VNC_PW=vncpassword',
        'VNC_RESOLUTION=1280x720'
      ]
    };

    try {
      const container = await this.docker.createContainer(createOptions);
      await container.start();
      await this._waitForHttpReady(port);

      const info = {
        containerId: container.id,
        containerName,
        port,
        image: 'kasmweb/desktop:1.14.0',
        createdAt: Date.now(),
        agentId
      };

      this.workspaces.set(agentId, info);
      return this._getConnectionInfo(agentId, info, port);
    } catch (error) {
      throw new Error(`Failed to create desktop workspace: ${error.message}`);
    }
  }

  /**
   * 销毁工作区
   */
  async destroyWorkspace(agentId) {
    const info = this.workspaces.get(agentId);
    if (!info) {
      return true;
    }

    try {
      const container = this.docker.getContainer(info.containerId);
      await container.stop();
      await container.remove();
      this.workspaces.delete(agentId);
      return true;
    } catch (error) {
      console.warn('[DockerKasmAdapter] Failed to remove container:', error.message);
      this.workspaces.delete(agentId);
      return false;
    }
  }

  /**
   * Poll until KasmVNC HTTPS endpoint accepts connections.
   */
  _waitForHttpReady(port, options = {}) {
    const host = '127.0.0.1';
    const path = options.path || '/';
    const timeoutMs = options.timeoutMs ?? 120000;
    const intervalMs = options.intervalMs ?? 750;
    const requestTimeoutMs = options.requestTimeoutMs ?? 4000;
    const username = options.username || 'kasm_user';
    const password = options.password || 'vncpassword';
    const deadline = Date.now() + timeoutMs;

    return new Promise((resolve, reject) => {
      const scheduleRetry = () => {
        if (Date.now() >= deadline) {
          reject(
            new Error(
              `Kasm HTTP not ready on ${host}:${port}${path} after ${timeoutMs}ms (noVNC still starting?)`
            )
          );
          return;
        }
        setTimeout(tryOnce, intervalMs);
      };

      const tryOnce = () => {
        if (Date.now() >= deadline) {
          reject(
            new Error(
              `Kasm HTTP not ready on ${host}:${port}${path} after ${timeoutMs}ms (noVNC still starting?)`
            )
          );
          return;
        }

        const req = https.request(
          {
            hostname: host,
            port,
            path,
            method: 'GET',
            timeout: requestTimeoutMs,
            rejectUnauthorized: false,
            headers: {
              Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
            }
          },
          (res) => {
            res.resume();
            // 2xx/3xx = page OK; 401 can appear before auth is accepted during startup.
            if (res.statusCode >= 200 && res.statusCode < 400) {
              resolve();
              return;
            }
            if (res.statusCode === 401) {
              resolve();
              return;
            }
            scheduleRetry();
          }
        );

        req.on('error', scheduleRetry);
        req.on('timeout', () => {
          req.destroy();
          scheduleRetry();
        });
        req.end();
      };

      tryOnce();
    });
  }

  /**
   * 获取连接信息
   */
  _getConnectionInfo(agentId, info, port) {
    // Force localhost for embedded desktop use
    const host = '127.0.0.1';
    const username = 'kasm_user';
    const password = 'vncpassword';
    return {
      success: true,
      agentId,
      containerId: info.containerId,
      containerName: info.containerName,
      port,
      password,
      username,
      connectionUrl: `https://${username}:${password}@${host}:${port}/?password=${encodeURIComponent(password)}&autoconnect=true`,
      vncUrl: `wss://${username}:${password}@${host}:${port}/websockify`,
      image: info.image
    };
  }

  /**
   * 获取下一个可用端口
   */
  _getNextPort() {
    let port = this.portStart;
    for (const [_, info] of this.workspaces) {
      if (info.port >= port) {
        port = info.port + 1;
      }
    }
    return port;
  }

  /**
   * 列出所有工作区
   */
  listWorkspaces() {
    return Array.from(this.workspaces.values());
  }

  /**
   * 获取工作区信息
   */
  getWorkspace(agentId) {
    return this.workspaces.get(agentId);
  }

  async _adoptContainerByName(agentId, containerName, fallbackImage) {
    try {
      const containers = await this.docker.listContainers({ all: true });
      const row = containers.find((c) =>
        Array.isArray(c.Names) && c.Names.some((n) => n === `/${containerName}`)
      );
      if (!row?.Id) return null;

      const container = this.docker.getContainer(row.Id);
      const inspect = await container.inspect();
      if (!inspect?.Id) return null;

      if (!inspect?.State?.Running) {
        // 旧容器存在但未运行，直接清理让后续创建新容器
        try {
          await container.remove({ force: true });
        } catch {}
        return null;
      }

      const binding = inspect?.NetworkSettings?.Ports?.['6901/tcp']?.[0];
      const hostPort = Number(binding?.HostPort || 0);
      if (!hostPort) {
        // 旧容器未发布宿主端口，清理并由调用方重建
        try {
          await container.remove({ force: true });
        } catch {}
        return null;
      }

      // 容器可能“在运行”但 noVNC/nginx 已异常；先做 HTTP 探活，不健康就重建
      try {
        await this._waitForHttpReady(hostPort, { timeoutMs: 15000, intervalMs: 800 });
      } catch {
        try {
          await container.remove({ force: true });
        } catch {}
        return null;
      }

      const info = {
        containerId: inspect.Id,
        containerName,
        port: hostPort,
        image: inspect?.Config?.Image || fallbackImage,
        createdAt: Date.now(),
        agentId
      };
      this.workspaces.set(agentId, info);
      return this._getConnectionInfo(agentId, info, info.port);
    } catch {
      return null;
    }
  }

  /**
   * 清理过期工作区
   */
  async cleanupExpired(maxAgeMs = 3600000) {
    const now = Date.now();
    let cleaned = 0;

    for (const [agentId, info] of this.workspaces.entries()) {
      if (now - info.createdAt > maxAgeMs) {
        await this.destroyWorkspace(agentId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * 检查是否可用
   */
  isAvailable() {
    return this.ping();
  }
}

module.exports = { DockerKasmAdapter };
