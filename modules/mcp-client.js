/**
 * MCP Client Module
 * 处理与 MCP Server 的所有通信
 */

(function() {
  'use strict';

  // MCP Server 配置
  const MCP_CONFIG = {
    host: 'localhost',
    port: 3000,
    path: '/mcp'
  };

  // 全局状态
  let mcpSessionId = null;
  let isConnected = false;
  let connectionError = null;

  /**
   * 发送 JSON-RPC 请求到 MCP Server
   */
  async function sendRequest(method, params = {}) {
    const requestBody = JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: method,
      params: params
    });

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    };

    if (mcpSessionId) {
      headers['Mcp-Session-Id'] = mcpSessionId;
    }

    try {
      const response = await fetch(`http://${MCP_CONFIG.host}:${MCP_CONFIG.port}${MCP_CONFIG.path}`, {
        method: 'POST',
        headers: headers,
        body: requestBody
      });

      // 获取新的 Session ID
      const newSessionId = response.headers.get('mcp-session-id');
      if (newSessionId) {
        mcpSessionId = newSessionId;
      }

      const text = await response.text();
      
      // 解析 SSE 格式
      let jsonData = text;
      if (text.includes('event:') || text.includes('data:')) {
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith('data:')) {
            jsonData = line.substring(5).trim();
            break;
          }
        }
      }

      return JSON.parse(jsonData);
    } catch (error) {
      console.error('[MCP Client] 请求失败:', error);
      throw error;
    }
  }

  /**
   * 初始化 MCP 会话
   */
  async function initialize() {
    try {
      console.log('[MCP Client] 正在初始化会话...');
      
      const initResponse = await sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'deepseek-mcp-extension',
          version: '2.0.0'
        }
      });

      if (initResponse.error) {
        throw new Error(initResponse.error.message);
      }

      console.log('[MCP Client] 会话已初始化:', initResponse.result?.serverInfo);
      
      // 发送 initialized 通知
      await sendRequest('notifications/initialized');
      
      isConnected = true;
      connectionError = null;
      return true;
    } catch (error) {
      console.error('[MCP Client] 初始化失败:', error);
      isConnected = false;
      connectionError = error.message;
      return false;
    }
  }

  /**
   * 获取工具列表
   */
  async function fetchTools() {
    if (!isConnected) {
      const initialized = await initialize();
      if (!initialized) return [];
    }

    try {
      console.log('[MCP Client] 正在获取工具列表...');
      const response = await sendRequest('tools/list');
      
      if (response.error) {
        throw new Error(response.error.message);
      }

      const tools = response.result?.tools || [];
      console.log(`[MCP Client] 发现 ${tools.length} 个工具:`, tools.map(t => t.name));
      
      return tools;
    } catch (error) {
      console.error('[MCP Client] 获取工具列表失败:', error);
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
      console.log(`[MCP Client] 调用工具: ${toolName}`, args);
      const response = await sendRequest('tools/call', {
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
      console.error(`[MCP Client] 调用工具 ${toolName} 失败:`, error);
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
    return {
      isConnected,
      error: connectionError,
      sessionId: mcpSessionId
    };
  }

  /**
   * 重新连接
   */
  async function reconnect() {
    mcpSessionId = null;
    isConnected = false;
    return await initialize();
  }

  // 暴露到全局
  window.McpClient = {
    initialize,
    fetchTools,
    callTool,
    getConnectionStatus,
    reconnect,
    config: MCP_CONFIG
  };

})();
