/**
 * MCP Client - stdio 模式  
 * 直接通过 stdin/stdout 与 desktop-commander 子进程通信
 */

const McpServer = require('./mcp-server');

// 状态
let mcpProcess = null;
let isConnected = false;
let isResetting = false;
let initializePromise = null;
let requestIdCounter = 0;

// 等待中的请求 Map：id -> { resolve, reject }
const pendingRequests = new Map();

// 未处理完整的数据缓冲
let buffer = '';

function rejectPendingRequests(message) {
  for (const [, { reject }] of pendingRequests) {
    reject(new Error(message));
  }

  pendingRequests.clear();
}

function bindProcessEvents(processRef) {
  processRef.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const msg = JSON.parse(trimmed);
        handleMessage(msg);
      } catch (e) {
        // 非 JSON 行忽略
      }
    }
  });

  processRef.once('exit', () => {
    if (mcpProcess === processRef) {
      mcpProcess = null;
    }

    isConnected = false;
    initializePromise = null;
    rejectPendingRequests('desktop-commander 进程已退出');
  });
}

/**
 * 启动子进程并建立 stdio 通信
 */
async function initialize(cwd) {
  if (isConnected && mcpProcess) {
    return true;
  }

  if (initializePromise) {
    return initializePromise;
  }

  initializePromise = (async () => {
    try {
      if (isResetting) {
        throw new Error('MCP 正在重置中');
      }

      console.log('[MCP Client] 正在启动 desktop-commander...');

      mcpProcess = await McpServer.start(cwd);
      bindProcessEvents(mcpProcess);

      const result = await sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'mcpb', version: '1.0.0' }
      });

      console.log('[MCP Client] 已连接:', result?.serverInfo);

      sendNotification('notifications/initialized');

      isConnected = true;
      return true;
    } catch (error) {
      console.error('[MCP Client] 初始化失败:', error.message);
      isConnected = false;
      await McpServer.stop();
      mcpProcess = null;
      return false;
    } finally {
      initializePromise = null;
    }
  })();

  return initializePromise;
}

/**
 * 处理收到的 JSON-RPC 消息
 */
function handleMessage(msg) {
  if (msg.id !== undefined && pendingRequests.has(msg.id)) {
    const { resolve, reject } = pendingRequests.get(msg.id);
    pendingRequests.delete(msg.id);
    if (msg.error) {
      reject(new Error(msg.error.message));
    } else {
      resolve(msg.result);
    }
  }
}

/**
 * 发送 JSON-RPC 请求，返回 Promise
 */
function sendRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!mcpProcess || !mcpProcess.stdin || mcpProcess.killed) {
      reject(new Error('desktop-commander 进程不可用'));
      return;
    }

    const id = ++requestIdCounter;
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });

    pendingRequests.set(id, { resolve, reject });
    mcpProcess.stdin.write(msg + '\n');
  });
}

/**
 * 发送 JSON-RPC 通知（无需响应）
 */
function sendNotification(method, params = {}) {
  if (!mcpProcess || !mcpProcess.stdin || mcpProcess.killed) {
    return;
  }

  const msg = JSON.stringify({ jsonrpc: '2.0', method, params });
  mcpProcess.stdin.write(msg + '\n');
}

/**
 * 获取工具列表
 */
async function fetchTools() {
  try {
    console.log('[MCP Client] 正在获取工具列表...');
    const result = await sendRequest('tools/list');
    const tools = result?.tools || [];
    console.log(`[MCP Client] 发现 ${tools.length} 个工具`);
    return tools;
  } catch (error) {
    console.error('[MCP Client] 获取工具列表失败:', error.message);
    return [];
  }
}

/**
 * 调用工具
 */
async function callTool(toolName, args) {
  if (!isConnected) {
    throw new Error('MCP 未连接');
  }

  try {
    console.log(`[MCP Client] 调用工具: ${toolName}`);
    const result = await sendRequest('tools/call', {
      name: toolName,
      arguments: args
    });

    const content = result?.content?.[0]?.text;
    return { success: true, result: content, raw: result };
  } catch (error) {
    console.error(`[MCP Client] 调用工具 ${toolName} 失败:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 获取连接状态
 */
function getConnectionStatus() {
  return { isConnected };
}

/**
 * 重置连接
 */
async function reset() {
  if (isResetting) {
    return;
  }

  isResetting = true;

  try {
    rejectPendingRequests('MCP 会话已关闭');
    initializePromise = null;
    isConnected = false;
    buffer = '';

    await McpServer.stop();
    mcpProcess = null;
  } finally {
    isResetting = false;
  }
}

module.exports = {
  initialize,
  fetchTools,
  callTool,
  getConnectionStatus,
  reset
};
