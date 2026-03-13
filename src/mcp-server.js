/**
 * MCP Server 管理器 
 * 直接 spawn desktop-commander，通过 stdio 与其通信
 */

const { spawn } = require('child_process');

let mcpProcess = null;
let stopPromise = null;
let exitHookRegistered = false;

/**
 * 启动 desktop-commander 子进程
 * @param {string} cwd 工作目录
 * @returns {ChildProcess} 子进程实例
 */
function start(cwd) {
  return new Promise((resolve, reject) => {
    console.log('[MCP Server] 正在启动 desktop-commander...');

    let settled = false;
    stopPromise = null;

    mcpProcess = spawn('npx', ['@wonderwhy-er/desktop-commander@latest'], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    });

    const currentProcess = mcpProcess;

    currentProcess.once('error', (e) => {
      if (settled) {
        return;
      }

      settled = true;
      reject(new Error(`desktop-commander 启动失败: ${e.message}`));
    });

    currentProcess.once('spawn', () => {
      if (settled) {
        return;
      }

      settled = true;
      console.log('[MCP Server] desktop-commander 已启动');
      resolve(currentProcess);
    });

    currentProcess.once('exit', (code) => {
      if (mcpProcess === currentProcess) {
        mcpProcess = null;
      }

      stopPromise = null;

      if (!settled && code !== 0 && code !== null) {
        settled = true;
        reject(new Error(`desktop-commander 异常退出，退出码: ${code}`));
      }
    });

    registerExitHook();
  });
}

/**
 * 停止子进程
 */
function stop() {
  if (!mcpProcess) {
    return Promise.resolve();
  }

  if (stopPromise) {
    return stopPromise;
  }

  console.log('[MCP Server] 正在关闭...');

  const currentProcess = mcpProcess;
  const pid = currentProcess.pid;

  stopPromise = new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      if (mcpProcess === currentProcess) {
        mcpProcess = null;
      }
      stopPromise = null;
      resolve();
    };

    currentProcess.once('exit', finish);
    currentProcess.once('error', finish);

    try {
      if (process.platform === 'win32' && pid) {
        const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
          stdio: 'ignore',
          shell: true,
          detached: false
        });

        killer.once('error', finish);
        killer.once('exit', () => {
          setTimeout(finish, 200);
        });
      } else {
        currentProcess.kill('SIGTERM');
        setTimeout(finish, 1000);
      }
    } catch (e) {
      console.warn('[MCP Server] 关闭子进程失败:', e.message);
      finish();
    }
  });

  return stopPromise;
}

/**
 * 主进程退出时自动清理子进程
 */
function registerExitHook() {
  if (exitHookRegistered) {
    return;
  }

  exitHookRegistered = true;

  const cleanup = () => {
    void stop();
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });
}

module.exports = { start, stop };
