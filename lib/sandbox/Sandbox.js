/**
 * Sandbox - 两层安全沙箱
 * 
 * 第一层：PathGuard 应用级路径访问控制
 * 第二层：OS级沙箱（macOS Seatbelt / Linux Bubblewrap）
 */

const { spawn } = require('child_process');
const { PathGuard } = require('./PathGuard');
const { AccessTier } = require('./AccessTier');

class Sandbox {
  constructor(options = {}) {
    this.pathGuard = new PathGuard(options);
    this.enableOsSandbox = options.enableOsSandbox !== false;
    this.platform = process.platform;
  }

  /**
   * 检查读取权限
   */
  checkRead(filePath) {
    return this.pathGuard.canRead(filePath);
  }

  /**
   * 检查写入权限
   */
  checkWrite(filePath) {
    return this.pathGuard.canWrite(filePath);
  }

  /**
   * 安全读取文件
   */
  readFile(filePath, encoding = 'utf8') {
    return this.pathGuard.readFileSync(filePath, encoding);
  }

  /**
   * 安全写入文件
   */
  writeFile(filePath, content, encoding = 'utf8') {
    return this.pathGuard.writeFileSync(filePath, content, encoding);
  }

  /**
   * 在沙箱中执行命令
   * 会根据平台启用OS级沙箱
   */
  async executeCommand(cmd, args, options = {}) {
    // 首先检查工作目录权限
    const cwd = options.cwd || process.cwd();
    if (!this.pathGuard.canExecute(cwd)) {
      throw new Error(`[Sandbox] Execution blocked: CWD ${cwd} not allowed`);
    }

    // 构建命令
    let sandboxCmd = cmd;
    let sandboxArgs = [...args];

    // macOS: 使用seatbelt (sandbox-exec)
    if (this.platform === 'darwin' && this.enableOsSandbox) {
      sandboxCmd = 'sandbox-exec';
      sandboxArgs = [
        '-f', this.getDefaultSandboxProfile(),
        cmd,
        ...args
      ];
    }

    // Linux: 使用bubblewrap
    if (this.platform === 'linux' && this.enableOsSandbox) {
      sandboxCmd = 'bwrap';
      sandboxArgs = this.getBubblewrapArgs(cmd, args, cwd);
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(sandboxCmd, sandboxArgs, {
        cwd,
        timeout: options.timeout || 30000,
        maxBuffer: options.maxBuffer || 1024 * 1024
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({
          code,
          stdout,
          stderr,
          sandboxed: this.enableOsSandbox
        });
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * 获取默认macOS沙箱配置
   * 允许基本操作，禁止访问敏感区域
   */
  getDefaultSandboxProfile() {
    // 返回内建配置路径，或者生成临时配置
    const defaultProfile = `
(version 1)
(deny default)
(allow process*)
(allow file*)
(deny file-read-metadata (/etc/passwd))
(deny file-read-metadata (/etc/shadow))
(deny file-write-create (/Users/*/.ssh))
(deny file-write-create (/root))
`;
    // 实际使用时会写入临时文件
    return require('os').tmpdir() + '/moss-sandbox.sb';
  }

  /**
   * 获取bubblewrap参数（Linux）
   */
  getBubblewrapArgs(cmd, args, cwd) {
    // 基本的bubblewrap隔离参数
    return [
      '--unshare-all',
      '--ro-bind', '/', '/',
      '--bind', cwd, cwd,
      '--tmpfs', '/tmp',
      '--die-with-parent',
      cmd,
      ...args
    ];
  }

  /**
   * 添加允许路径
   */
  allowPath(filePath, tier) {
    this.pathGuard.allow(filePath, tier);
  }

  /**
   * 阻止路径
   */
  blockPath(filePath) {
    this.pathGuard.block(filePath);
  }

  /**
   * 获取当前规则
   */
  getRules() {
    return this.pathGuard.listRules();
  }

  /**
   * 检查OS沙箱是否可用
   */
  isOsSandboxAvailable() {
    if (this.platform === 'darwin') {
      // 检查sandbox-exec是否存在
      try {
        require('child_process').execSync('which sandbox-exec', { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    }
    if (this.platform === 'linux') {
      try {
        require('child_process').execSync('which bwrap', { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

module.exports = { Sandbox };
