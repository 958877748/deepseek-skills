/**
 * MCP Server 管理器 
 * 直接 spawn desktop-commander，通过 stdio 与其通信
 */

const { spawn } = require('child_process');

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
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    });

    mcpProcess.on('error', (e) => {
      reject(new Error(`desktop-commander 启动失败: ${e.message}`));
    });

    mcpProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`desktop-commander 异常退出，退出码: ${code}`));
      }
    });

    console.log('[MCP Server] desktop-commander 已启动');
    resolve(mcpProcess);

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
