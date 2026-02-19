/**
 * App Module - 应用主入口
 * 统一管理初始化流程和回调
 */

(function() {
  'use strict';

  // ============ 适配器注册 ============

  function registerAdapters() {
    AdapterRegistry.register(DeepSeekAdapter);
    AdapterRegistry.register(QwenAdapter);
    console.log('[MCP Bridge] 适配器注册完成');
  }

  function detectAndLoadAdapter() {
    const hostname = window.location.hostname;
    const adapter = AdapterRegistry.findAdapter(hostname);
    
    if (!adapter) {
      console.log(`[MCP Bridge] 不支持当前网站: ${hostname}`);
      return false;
    }
    
    console.log(`[MCP Bridge] 已加载适配器: ${adapter.getName()}`);
    Store.setAdapter(adapter);
    
    return true;
  }

  // ============ MCP 连接 ============

  async function connectToMcp() {
    const connected = await McpClient.initialize();
    
    if (connected) {
      await refreshTools();
    } else {
      const status = Store.getMcpStatus();
      UIComponents.updateStatusIndicator(Store.getUI().statusIndicator, 'error', 0);
      console.error('[MCP Bridge] 连接失败:', status.error);
    }
  }

  async function refreshTools() {
    const tools = await McpClient.fetchTools();
    const status = Store.getMcpStatus();
    
    UIComponents.updateStatusIndicator(
      Store.getUI().statusIndicator, 
      status.isConnected ? 'connected' : 'error', 
      tools.length
    );
    
    console.log(`[MCP Bridge] 已刷新工具列表: ${tools.length} 个工具`);
    return tools;
  }

  // ============ 加载提示词 ============

  async function loadPromptToTextarea() {
    console.log('[MCP Bridge] 开始加载提示词...');
    
    // 检查连接状态
    const status = Store.getMcpStatus();
    console.log('[MCP Bridge] 当前连接状态:', status);
    
    const tools = Store.getTools();
    
    // 如果未连接或没有工具，尝试连接
    if (!status.isConnected || tools.length === 0) {
      console.log('[MCP Bridge] 未连接或无工具，尝试连接 MCP...');
      UIComponents.updateStatusIndicator(Store.getUI().statusIndicator, 'connecting', 0);
      await connectToMcp();
    }

    // 再次检查
    const newStatus = Store.getMcpStatus();
    if (!newStatus.isConnected) {
      alert('❌ MCP 未连接！\n\n请先启动 MCP Server:\nmcp-proxy --port=3000 --allow-origin "*" --stateless -- npx @wonderwhy-er/desktop-commander@latest');
      return;
    }

    const newTools = Store.getTools();
    if (newTools.length === 0) {
      alert('⚠️ 未获取到工具列表，请检查 MCP Server 是否正常运行');
      return;
    }

    // 生成动态提示词
    const promptText = PromptGenerator.generate(newTools, McpClient.config);
    console.log(`[MCP Bridge] 生成的提示词长度: ${promptText.length} 字符`);
    
    // 加载到输入框（不自动发送）
    const success = UIComponents.loadTextToTextarea(promptText);
    
    if (success) {
      console.log(`[MCP Bridge] ✅ 已加载动态提示词（${newTools.length} 个工具）`);
    } else {
      alert('❌ 无法加载提示词到输入框');
    }
  }

  // ============ 设置回调 ============

  function setupUICallbacks() {
    UIComponents.setCallbacks({
      onStatusClick: async () => {
        console.log('[MCP Bridge] 点击状态指示器，尝试重连');
        UIComponents.updateStatusIndicator(Store.getUI().statusIndicator, 'connecting', 0);
        await connectToMcp();
      },
      
      onLoadPrompt: async () => {
        console.log('[MCP Bridge] 加载提示词');
        await loadPromptToTextarea();
      }
    });
  }

  function setupActionCallbacks() {
    ActionHandler.setCallbacks({
      onExecuteTool: async (toolName, params) => {
        return await McpClient.callTool(toolName, params);
      },
      
      onWriteResult: (result, toolName) => {
        const resultMessage = `\n\`\`\`${toolName}-result\n${result}\n\`\`\``;
        UIComponents.setToTextarea(resultMessage);
      }
    });
  }

  // ============ 初始化 ============

  async function init() {
    console.log('[MCP Bridge] 开始初始化');
    
    // 1. 注册所有适配器
    registerAdapters();
    
    // 2. 检测并加载当前平台适配器
    const adapterLoaded = detectAndLoadAdapter();
    if (!adapterLoaded) {
      console.log('[MCP Bridge] 当前平台不支持，扩展未启动');
      return;
    }
    
    // 3. 设置 UI 回调
    setupUICallbacks();
    
    // 4. 设置 Action Handler 回调
    setupActionCallbacks();
    
    // 5. 创建 UI（先显示，让用户立即看到按钮）
    UIComponents.createStatusIndicator('connecting', 0);
    UIComponents.createCopyCommandButton();
    UIComponents.createPromptButton();
    
    // 6. 初始化 Action Handler
    ActionHandler.initObserver();
    
    console.log('[MCP Bridge] UI 已创建，正在后台连接 MCP...');
    
    // 7. 异步连接 MCP Server（不阻塞 UI 显示）
    connectToMcp().then(() => {
      console.log('[MCP Bridge] 初始化完成');
    });
  }

  // ============ 暴露 API ============

  window.McpBridge = {
    init,
    connectToMcp,
    refreshTools,
    loadPromptToTextarea
  };

})();
