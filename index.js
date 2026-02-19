const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// MCP Server 配置
const MCP_CONFIG = {
  host: 'localhost',
  port: 3000,
  path: '/mcp'
};

// 目标平台配置
const TARGET_PLATFORM = process.env.PLATFORM || 'qwen'; // 'qwen' 或 'deepseek'

const PLATFORM_URLS = {
  qwen: 'https://chat.qwen.ai/',
  deepseek: 'https://chat.deepseek.com/'
};

/**
 * 初始化浏览器
 */
async function initBrowser() {
  const browser = await chromium.launch({
    headless: false,
  });

  // 检查 auth.json 是否存在
  const authPath = path.resolve(__dirname, 'auth.json');
  const authExists = fs.existsSync(authPath);

  const contextOptions = {
    viewport: null
  };

  if (authExists) {
    contextOptions.storageState = authPath;
    console.log('[Playwright MCP] 使用 auth.json 登录态');
  } else {
    console.log('[Playwright MCP] auth.json 不存在，需要手动登录');
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  
  return { page, browser, context };
}

/**
 * 注入所有脚本到页面
 */
async function injectScripts(page) {
  console.log('[Playwright MCP] 正在注入脚本...');

  // 按顺序注入脚本（依赖关系：base-adapter -> adapter-registry -> 具体适配器 -> 其他模块）
  const scripts = [
    'injected/adapters/base-adapter.js',
    'injected/adapters/adapter-registry.js',
    'injected/adapters/qwen-adapter.js',
    'injected/adapters/deepseek-adapter.js',
    'injected/mcp-client.js',
    'injected/prompt-generator.js',
    'injected/ui-components.js',
    'injected/action-handler.js',
  ];

  for (const script of scripts) {
    await page.addScriptTag({ path: path.resolve(__dirname, script) });
    console.log(`[Playwright MCP] 已注入: ${script}`);
  }
}

/**
 * 注入初始化脚本（原 content.js 的核心逻辑）
 */
async function injectInitScript(page) {
  await page.evaluate(() => {
    console.log('[MCP Bridge] 正在初始化...');

    // 全局状态
    let availableTools = [];
    let statusIndicator = null;
    let currentAdapter = null;

    // ============ 适配器注册 ============

    function registerAdapters() {
      AdapterRegistry.register(DeepSeekAdapter);
      AdapterRegistry.register(QwenAdapter);
      console.log('[MCP Bridge] 适配器注册完成');
    }

    function detectAndLoadAdapter() {
      const hostname = window.location.hostname;
      currentAdapter = AdapterRegistry.findAdapter(hostname);
      
      if (!currentAdapter) {
        console.log(`[MCP Bridge] 不支持当前网站: ${hostname}`);
        return false;
      }
      
      console.log(`[MCP Bridge] 已加载适配器: ${currentAdapter.getName()}`);
      
      // 将适配器设置到各个模块
      if (window.UIComponents) {
        UIComponents.setAdapter(currentAdapter);
      }
      if (window.ActionHandler) {
        ActionHandler.setAdapter(currentAdapter);
      }
      
      return true;
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
      statusIndicator = UIComponents.createStatusIndicator('connecting', 0);
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

    // ============ 设置回调 ============

    function setupUICallbacks() {
      UIComponents.setCallbacks({
        onStatusClick: async () => {
          console.log('[MCP Bridge] 点击状态指示器，尝试重连');
          UIComponents.updateStatusIndicator(statusIndicator, 'connecting', 0);
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
        isConnected: () => {
          const status = McpClient.getConnectionStatus();
          return status.isConnected;
        },
        
        onExecuteTool: async (toolName, params) => {
          return await McpClient.callTool(toolName, params);
        },
        
        onWriteResult: (result, toolName) => {
          const resultMessage = `\n\`\`\`${toolName}-result\n${result}\n\`\`\``;
          UIComponents.setToTextarea(resultMessage);
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
        console.error('[MCP Bridge] 连接失败:', status.error);
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
      
      console.log(`[MCP Bridge] 已刷新工具列表: ${availableTools.length} 个工具`);
      return availableTools;
    }

    // ============ 加载提示词 ============

    async function loadPromptToTextarea() {
      console.log('[MCP Bridge] 开始加载提示词...');
      
      // 检查连接状态
      const status = McpClient.getConnectionStatus();
      console.log('[MCP Bridge] 当前连接状态:', status);
      
      // 如果未连接或没有工具，尝试连接
      if (!status.isConnected || availableTools.length === 0) {
        console.log('[MCP Bridge] 未连接或无工具，尝试连接 MCP...');
        UIComponents.updateStatusIndicator(statusIndicator, 'connecting', 0);
        await connectToMcp();
      }

      // 再次检查
      const newStatus = McpClient.getConnectionStatus();
      if (!newStatus.isConnected) {
        alert('❌ MCP 未连接！\n\n请先启动 MCP Server:\nmcp-proxy --port=3000 --allow-origin "*" --stateless -- npx @wonderwhy-er/desktop-commander@latest');
        return;
      }

      if (availableTools.length === 0) {
        alert('⚠️ 未获取到工具列表，请检查 MCP Server 是否正常运行');
        return;
      }

      // 生成动态提示词
      const promptText = PromptGenerator.generate(availableTools, McpClient.config);
      console.log(`[MCP Bridge] 生成的提示词长度: ${promptText.length} 字符`);
      
      // 加载到输入框（不自动发送）
      const success = UIComponents.loadTextToTextarea(promptText);
      
      if (success) {
        console.log(`[MCP Bridge] ✅ 已加载动态提示词（${availableTools.length} 个工具）`);
      } else {
        alert('❌ 无法加载提示词到输入框');
      }
    }

    // 启动初始化
    init();
  });
}

/**
 * 主函数
 */
(async () => {
  try {
    console.log('[Playwright MCP] 启动中...');
    
    // 1. 初始化浏览器
    const { page, browser, context } = await initBrowser();
    console.log('[Playwright MCP] 浏览器已启动');

    // 2. 导航到目标页面
    const targetUrl = PLATFORM_URLS[TARGET_PLATFORM];
    console.log(`[Playwright MCP] 正在导航到: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    console.log('[Playwright MCP] 页面已加载');
    
    // 4. 注入所有脚本
    await injectScripts(page);
    
    // 5. 注入初始化逻辑
    await injectInitScript(page);
    
    console.log('[Playwright MCP] ✅ 初始化完成，等待用户操作...');
    console.log('[Playwright MCP] 提示：确保 MCP Server 已启动 (mcp-proxy --port=3000 --allow-origin "*" --stateless -- npx @wonderwhy-er/desktop-commander@latest)');
    
    // 保持浏览器打开
    // browser.close() 会在脚本结束时自动调用
    
  } catch (error) {
    console.error('[Playwright MCP] 启动失败:', error);
    process.exit(1);
  }
})();
