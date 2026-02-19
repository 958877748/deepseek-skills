/**
 * MCP Client - Node.js 端
 * 直接与 MCP Server 通信，不经过浏览器
 */

const http = require('http');

// MCP Server 配置
const DEFAULT_CONFIG = {
  host: 'localhost',
  port: 3000,
  path: '/mcp'
};

// 会话状态
let sessionId = null;
let isConnected = false;

/**
 * 发送 JSON-RPC 请求
 */
function sendRequest(config, method, params = {}) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: method,
      params: params
    });

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Content-Length': Buffer.byteLength(requestBody)
    };

    if (sessionId) {
      headers['Mcp-Session-Id'] = sessionId;
    }

    const req = http.request({
      hostname: config.host,
      port: config.port,
      path: config.path,
      method: 'POST',
      headers: headers
    }, (res) => {
      // 获取新的 Session ID
      const newSessionId = res.headers['mcp-session-id'];
      if (newSessionId) {
        sessionId = newSessionId;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          // 解析 SSE 格式
          let jsonData = data;
          if (data.includes('event:') || data.includes('data:')) {
            const lines = data.split('\n');
            for (const line of lines) {
              if (line.startsWith('data:')) {
                jsonData = line.substring(5).trim();
                break;
              }
            }
          }
          resolve(JSON.parse(jsonData));
        } catch (e) {
          reject(new Error(`JSON 解析失败: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

/**
 * 初始化 MCP 会话
 */
async function initialize(config = DEFAULT_CONFIG) {
  try {
    console.log('[MCP Client] 正在初始化会话...');
    
    const response = await sendRequest(config, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'deepseek-mcp-bridge',
        version: '3.0.0'
      }
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    console.log('[MCP Client] 会话已初始化:', response.result?.serverInfo);
    
    // 发送 initialized 通知
    await sendRequest(config, 'notifications/initialized');
    
    isConnected = true;
    return true;
  } catch (error) {
    console.error('[MCP Client] 初始化失败:', error.message);
    isConnected = false;
    return false;
  }
}

/**
 * 获取工具列表
 */
async function fetchTools(config = DEFAULT_CONFIG) {
  if (!isConnected) {
    const initialized = await initialize(config);
    if (!initialized) return [];
  }

  try {
    console.log('[MCP Client] 正在获取工具列表...');
    const response = await sendRequest(config, 'tools/list');
    
    if (response.error) {
      throw new Error(response.error.message);
    }

    const tools = response.result?.tools || [];
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
async function callTool(toolName, args, config = DEFAULT_CONFIG) {
  if (!isConnected) {
    throw new Error('MCP 未连接');
  }

  try {
    console.log(`[MCP Client] 调用工具: ${toolName}`);
    const response = await sendRequest(config, 'tools/call', {
      name: toolName,
      arguments: args
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    const content = response.result?.content?.[0]?.text;
    return {
      success: true,
      result: content,
      raw: response.result
    };
  } catch (error) {
    console.error(`[MCP Client] 调用工具 ${toolName} 失败:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 获取连接状态
 */
function getConnectionStatus() {
  return { isConnected, sessionId };
}

/**
 * 重置连接
 */
function reset() {
  sessionId = null;
  isConnected = false;
}

module.exports = {
  initialize,
  fetchTools,
  callTool,
  getConnectionStatus,
  reset,
  DEFAULT_CONFIG
};
