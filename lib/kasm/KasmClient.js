/**
 * KasmWorkspaces API Client
 * DSClaw Kasm 集成
 * 
 * 对接 Kasm Workspaces REST API
 * 文档：https://www.kasmweb.com/docs/latest/api.html
 */

class KasmClient {
  constructor(options = {}) {
    this.apiUrl = options.apiUrl || 'http://localhost:6901';
    this.apiKey = options.apiKey;
    this.apiSecret = options.apiSecret;
    this.token = null;
    this.tokenExpiry = null;
  }

  /**
   * 认证获取 token
   */
  async authenticate() {
    try {
      const response = await fetch(`${this.apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          api_key: this.apiKey,
          api_secret: this.apiSecret
        })
      });

      const data = await response.json();
      
      if (data.token) {
        this.token = data.token;
        this.tokenExpiry = Date.now() + (data.expires_in || 86400) * 1000;
        return this.token;
      }

      throw new Error(`Authentication failed: ${JSON.stringify(data)}`);
    } catch (error) {
      throw new Error(`Kasm authentication error: ${error.message}`);
    }
  }

  /**
   * 获取有效 token，如果过期重新认证
   */
  async getToken() {
    if (!this.token || !this.tokenExpiry || Date.now() >= this.tokenExpiry - 60000) {
      await this.authenticate();
    }
    return this.token;
  }

  /**
   * 发起 API 请求
   */
  async request(endpoint, method = 'GET', body = null) {
    const token = await this.getToken();
    
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.apiUrl}${endpoint}`, options);
    return response.json();
  }

  /**
   * 获取可用镜像列表
   */
  async getImages() {
    return this.request('/api/images/get_images', 'POST');
  }

  /**
   * 创建工作区（启动容器）
   * @param {string} imageId - 镜像 ID
   * @param {string} userId - 用户 ID
   * @param {object} options - 额外选项
   */
  async createWorkspace(imageId, userId, options = {}) {
    const body = {
      image_id: imageId,
      user_id: userId,
      idle_timeout: options.idleTimeout || 3600,
      ...options
    };

    const result = await this.request('/api/workspaces/create', 'POST', body);
    return result;
  }

  /**
   * 删除工作区
   * @param {string} workspaceId - 工作区 ID
   */
  async deleteWorkspace(workspaceId) {
    return this.request('/api/workspaces/delete', 'POST', {
      workspace_id: workspaceId
    });
  }

  /**
   * 获取工作区信息
   */
  async getWorkspace(workspaceId) {
    return this.request('/api/workspaces/get', 'POST', {
      workspace_id: workspaceId
    });
  }

  /**
   * 列表所有工作区
   */
  async listWorkspaces(userId = null) {
    const body = userId ? { user_id: userId } : {};
    return this.request('/api/workspaces/list', 'POST', body);
  }

  /**
   * 获取工作区连接信息（返回 VNC URL）
   */
  async getConnectionUrl(workspaceId) {
    const result = await this.request('/api/workspaces/connection', 'POST', {
      workspace_id: workspaceId
    });
    
    if (result.connection_url) {
      return result.connection_url;
    }
    return null;
  }

  /**
   * 获取截图
   */
  async getScreenshot(workspaceId) {
    const result = await this.request('/api/workspaces/screenshot', 'POST', {
      workspace_id: workspaceId
    });
    return result.image_data; // base64
  }

  /**
   * 检测服务是否可用
   */
  async healthCheck() {
    try {
      const response = await fetch(`${this.apiUrl}/api/health`, {
        method: 'GET'
      });
      const data = await response.json();
      return {
        available: response.ok && data.status === 'ok',
        data
      };
    } catch (error) {
      return {
        available: false,
        error: error.message
      };
    }
  }

  /**
   * 获取用户信息
   */
  async getUser(userId) {
    return this.request('/api/users/get', 'POST', { user_id: userId });
  }

  /**
   * 创建用户
   */
  async createUser(username, email, password) {
    return this.request('/api/users/create', 'POST', {
      username,
      email,
      password
    });
  }
}

module.exports = { KasmClient };
