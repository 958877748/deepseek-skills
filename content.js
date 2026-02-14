/**
 * DeepSeek MCP Tools - 主入口
 * 通过 MCP 协议动态获取工具并生成系统提示词
 */

(function() {
  'use strict';

  console.log('[DeepSeek MCP] 正在加载...');

  // 全局状态
  let availableTools = [];
  let statusIndicator = null;

  // ============ 初始化 ============

  async function init() {
    console.log('[DeepSeek MCP] 开始初始化');
    
    // 1. 设置 UI 回调
    setupUICallbacks();
    
    // 2. 设置 Action Handler 回调
    setupActionCallbacks();
    
    // 3. 创建 UI
    statusIndicator = UIComponents.createStatusIndicator('connecting', 0);
    UIComponents.createPromptButton();
    
    // 4. 初始化 Action Handler
    ActionHandler.initObserver();
    
    // 5. 连接 MCP Server
    await connectToMcp();
    
    console.log('[DeepSeek MCP] 初始化完成');
  }

  // ============ 设置回调 ============

  function setupUICallbacks() {
    UIComponents.setCallbacks({
      onStatusClick: async () => {
        console.log('[DeepSeek MCP] 点击状态指示器，尝试重连');
        UIComponents.updateStatusIndicator(statusIndicator, 'connecting', 0);
        await connectToMcp();
      },
      
      onLoadPrompt: async () => {
        console.log('[DeepSeek MCP] 加载提示词');
        await loadPromptToTextarea();
      }
    });
  }

  function setupActionCallbacks() {
    ActionHandler.setCallbacks({
      isConnected: () => {
        const status = McpClient.getConnectionStatus();
        return status.isConnected;
      },
      
      onExecuteTool: async (toolName, params) => {
        return await McpClient.callTool(toolName, params);
      },
      
      onWriteResult: (result) => {
        const resultMessage = `\n\`\`\`action-result\n${result}\n\`\`\``;
        UIComponents.appendToTextarea(resultMessage);
      }
    });
  }

  // ============ MCP 连接 ============

  async function connectToMcp() {
    const connected = await McpClient.initialize();
    
    if (connected) {
      await refreshTools();
    } else {
      const status = McpClient.getConnectionStatus();
      UIComponents.updateStatusIndicator(statusIndicator, 'error', 0);
      console.error('[DeepSeek MCP] 连接失败:', status.error);
    }
  }

  async function refreshTools() {
    availableTools = await McpClient.fetchTools();
    const status = McpClient.getConnectionStatus();
    
    UIComponents.updateStatusIndicator(
      statusIndicator, 
      status.isConnected ? 'connected' : 'error', 
      availableTools.length
    );
    
    console.log(`[DeepSeek MCP] 已刷新工具列表: ${availableTools.length} 个工具`);
    return availableTools;
  }

  // ============ 加载提示词 ============

  async function loadPromptToTextarea() {
    // 确保已连接
    const status = McpClient.getConnectionStatus();
    if (!status.isConnected || availableTools.length === 0) {
      UIComponents.updateStatusIndicator(statusIndicator, 'connecting', 0);
      await connectToMcp();
    }

    // 生成动态提示词
    const promptText = PromptGenerator.generate(availableTools, McpClient.config);
    
    // 加载到输入框
    const success = UIComponents.loadTextToTextarea(promptText);
    
    if (success) {
      console.log(`[DeepSeek MCP] 已加载动态提示词（${availableTools.length} 个工具）`);
    }
  }

  // ============ 启动 ============

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
