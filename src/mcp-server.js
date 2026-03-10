/**
 * MCP Server 管理器 
 * 直接 spawn desktop-commander，通过 stdio 与其通信
 */

const { spawn } = require('child_process');

const READY_TIMEOUT = 30000; // 首次 npx 需要下载，等久一点

let mcpProcess = null;

/**
 * 启动 desktop-commander 子进程
 * @param {string} cwd 工作目录
 * @returns {ChildProcess} 子进程实例
 */
function start(cwd) {
  return new Promise((resolve, reject) => {
    console.log('[MCP Server] 正在启动 desktop-commander...');

    mcpProcess = spawn('npx', ['@wonderwhy-er/desktop-commander@latest'], {
      cwd,
      // stdin/stdout 用于 JSON-RPC 通信，stderr 用于日志
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    });

    const timer = setTimeout(() => {
      reject(new Error(`desktop-commander 启动超时 (${READY_TIMEOUT / 1000}s)`));
    }, READY_TIMEOUT);

    // stderr 是日志输出，desktop-commander 就绪后会输出相关信息
    mcpProcess.stderr.on('data', (data) => {
      const output = data.toString();
      process.stderr.write(`[MCP Server] ${output}`);

      // desktop-commander 启动就绪的标志
      if (output.includes('Desktop Commander MCP') || output.includes('running') || output.includes('started')) {
        clearTimeout(timer);
        console.log('[MCP Server] desktop-commander 已就绪');
        resolve(mcpProcess);
      }
    });

    mcpProcess.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`desktop-commander 启动失败: ${e.message}`));
    });

    mcpProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timer);
        reject(new Error(`desktop-commander 异常退出，退出码: ${code}`));
      }
    });

    // stdout 有数据说明进程已经在运行了（JSON-RPC 响应），直接 resolve
    mcpProcess.stdout.once('data', () => {
      clearTimeout(timer);
      resolve(mcpProcess);
    });

    // 注册退出钩子
    registerExitHook();
  });
}

/**
 * 停止子进程
 */
function stop() {
  if (mcpProcess) {
    console.log('[MCP Server] 正在关闭...');
    mcpProcess.kill();
    mcpProcess = null;
  }
}

/**
 * 主进程退出时自动清理子进程
 */
function registerExitHook() {
  const cleanup = () => stop();
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
}

module.exports = { start, stop };
