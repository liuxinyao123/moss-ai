/**
 * Desk - Agent 文件协作空间
 * 
 * 每个Agent有独立的Desk空间
 * 支持拖放上传、文件预览、异步协作
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class Desk {
  constructor(agentId, basePath) {
    this.agentId = agentId;
    this.basePath = basePath || path.join(
      process.env.HOME,
      '.openclaw',
      'workspace',
      'moss-ai',
      'agents',
      agentId,
      'desk'
    );
    this.allowedPreviewTypes = [
      'text/plain',
      'text/markdown',
      'text/html',
      'text/css',
      'text/javascript',
      'application/json',
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'audio/mpeg',
      'audio/wav'
    ];
    this.fileTypes = {
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json',
      '.js': 'text/javascript',
      '.html': 'text/html',
      '.css': 'text/css',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav'
    };
  }

  /**
   * 初始化Desk目录
   */
  initialize() {
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }

    // 创建子目录
    const subdirs = ['uploads', 'notes', 'exports'];
    for (const dir of subdirs) {
      const fullPath = path.join(this.basePath, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    }

    console.log(`[Desk] Initialized desk for agent ${this.agentId}`);
  }

  /**
   * 获取文件完整路径
   */
  getFullPath(relativePath) {
    // 防止路径遍历
    const normalized = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
    return path.join(this.basePath, normalized);
  }

  /**
   * 获取相对路径
   */
  getRelativePath(fullPath) {
    return path.relative(this.basePath, fullPath);
  }

  /**
   * 保存上传文件
   */
  saveFile(fileName, content, subdir = 'uploads') {
    const extension = path.extname(fileName).toLowerCase();
    const safeName = `${uuidv4().slice(0, 8)}_${fileName.replace(/\s+/g, '-')}`;
    const relativePath = path.join(subdir, safeName);
    const fullPath = this.getFullPath(relativePath);

    // 确保目录存在
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 写入文件
    if (Buffer.isBuffer(content)) {
      fs.writeFileSync(fullPath, content);
    } else {
      fs.writeFileSync(fullPath, content, 'utf8');
    }

    const stats = fs.statSync(fullPath);
    const contentType = this.getContentType(extension);

    return {
      fileName: safeName,
      relativePath,
      fullPath,
      size: stats.size,
      contentType,
      canPreview: this.canPreview(contentType),
      uploadedAt: Date.now()
    };
  }

  /**
   * 获取内容类型
   */
  getContentType(extension) {
    return this.fileTypes[extension] || 'application/octet-stream';
  }

  /**
   * 是否可以预览
   */
  canPreview(contentType) {
    return this.allowedPreviewTypes.includes(contentType);
  }

  /**
   * 读取文件
   */
  readFile(relativePath, encoding = 'utf8') {
    const fullPath = this.getFullPath(relativePath);
    if (!fs.existsSync(fullPath)) {
      return null;
    }

    const contentType = this.getContentType(path.extname(relativePath));
    if (contentType.startsWith('image/') || contentType.startsWith('audio/')) {
      return fs.readFileSync(fullPath); // 返回Buffer
    }

    return fs.readFileSync(fullPath, encoding);
  }

  /**
   * 删除文件
   */
  deleteFile(relativePath) {
    const fullPath = this.getFullPath(relativePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      return true;
    }
    return false;
  }

  /**
   * 列出目录内容
   */
  listFiles(subdir = '') {
    const fullPath = this.getFullPath(subdir);
    if (!fs.existsSync(fullPath)) {
      return [];
    }

    const items = fs.readdirSync(fullPath);
    const result = [];

    for (const item of items) {
      const itemPath = path.join(fullPath, item);
      const stat = fs.statSync(itemPath);
      const relativePath = path.join(subdir, item);
      const extension = path.extname(item).toLowerCase();
      const contentType = this.getContentType(extension);

      result.push({
        name: item,
        relativePath,
        isDirectory: stat.isDirectory(),
        size: stat.size,
        modifiedAt: stat.mtimeMs,
        contentType: stat.isDirectory() ? null : contentType,
        canPreview: stat.isDirectory() ? false : this.canPreview(contentType)
      });
    }

    return result.sort((a, b) => b.modifiedAt - a.modifiedAt);
  }

  /**
   * 创建笔记
   */
  createNote(title, content) {
    const safeTitle = title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase();
    const fileName = `${Date.now()}_${safeTitle}.md`;
    return this.saveFile(fileName, content, 'notes');
  }

  /**
   * 搜索文件
   */
  searchFiles(keyword) {
    const results = [];
    const search = (dir) => {
      const items = this.listFiles(dir);
      for (const item of items) {
        if (item.isDirectory) {
          search(item.relativePath);
        } else {
          if (item.name.toLowerCase().includes(keyword.toLowerCase())) {
            results.push(item);
          }
        }
      }
    };
    search('');
    return results;
  }

  /**
   * 获取磁盘使用统计
   */
  getStats() {
    const calculateSize = (dir) => {
      let totalSize = 0;
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
          totalSize += calculateSize(itemPath);
        } else {
          totalSize += stat.size;
        }
      }
      return totalSize;
    };

    const files = this.listFiles('');
    const totalSize = calculateSize(this.basePath);

    return {
      agentId: this.agentId,
      basePath: this.basePath,
      totalFiles: files.filter(f => !f.isDirectory).length,
      totalDirectories: files.filter(f => f.isDirectory).length,
      totalSizeBytes: totalSize,
      totalSizeKB: (totalSize / 1024).toFixed(2),
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2)
    };
  }
}

module.exports = { Desk };
