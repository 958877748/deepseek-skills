/**
 * MCP Bridge Controller
 * 主控制器 - 整合所有模块，处理业务逻辑
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 模块导入
const McpClient = require('./src/mcp-client');
const PromptGenerator = require('./src/prompt-generator');
const { findAdapter } = require('./src/adapters');

// 配置
const TARGET_PLATFORM = process.env.PLATFORM || 'qwen';

const PLATFORM_URLS = {
  qwen: 'https://chat.qwen.ai/',
  deepseek: 'https://chat.deepseek.com/'
};

// 状态
let tools = [];
let currentPage = null;

// ============ 浏览器初始化 ============

async function initBrowser() {
  const browser = await chromium.launch({ headless: false });

  const authPath = path.resolve(__dirname, 'auth.json');
  const authExists = fs.existsSync(authPath);

  const contextOptions = { viewport: null };
  if (authExists) {
    contextOptions.storageState = authPath;
    console.log('[Bridge] 使用 auth.json 登录态');
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  
  return { page, browser, context };
}

// ============ 脚本注入 ============

async function injectDomBridge(page, platformConfig) {
  // 注入 DOM Bridge 脚本
  const bridgePath = path.resolve(__dirname, 'injected/dom-bridge.js');
  await page.addScriptTag({ path: bridgePath });
  
  // 初始化 DOM Bridge
  await page.evaluate((config) => {
    window.__MCP_BRIDGE__.init(config);
  }, platformConfig);
  
  console.log('[Bridge] DOM Bridge 已注入');
}

// ============ MCP 连接 ============

async function connectMcp(page) {
  updateStatus(page, 'connecting', 0);
  
  const connected = await McpClient.initialize();
  
  if (connected) {
    tools = await McpClient.fetchTools();
    updateStatus(page, 'connected', tools.length);
    console.log(`[Bridge] MCP 已连接，${tools.length} 个工具`);
    return true;
  } else {
    updateStatus(page, 'error', 0);
    console.log('[Bridge] MCP 连接失败');
    return false;
  }
}

function updateStatus(page, status, count) {
  page.evaluate(([s, c]) => {
    window.__MCP_BRIDGE__.updateStatus(s, c);
  }, [status, count]);
}

// ============ 事件处理 ============

async function setupEventHandlers(page) {
  // 监听加载提示词事件
  await page.exposeFunction('onLoadPrompt', async () => {
    console.log('[Bridge] 加载提示词');
    
    // 如果未连接，先连接
    if (tools.length === 0) {
      await connectMcp(page);
    }
    
    if (tools.length === 0) {
      page.evaluate(() => alert('❌ MCP 未连接！请启动 MCP Server'));
      return;
    }
    
    // 生成提示词
    const prompt = PromptGenerator.generate(tools);
    
    // 写入输入框
    await page.evaluate((text) => {
      window.__MCP_BRIDGE__.setInputValue(text);
    }, prompt);
    
    console.log(`[Bridge] 提示词已加载，${prompt.length} 字符`);
  });

  // 监听重连事件
  await page.exposeFunction('onReconnect', async () => {
    console.log('[Bridge] 重连 MCP');
    McpClient.reset();
    await connectMcp(page);
  });

  // 监听工具执行事件
  await page.exposeFunction('onExecuteTool', async (toolName, content) => {
    console.log(`[Bridge] 执行工具: ${toolName}`);
    
    try {
      const params = JSON.parse(content);
      const result = await McpClient.callTool(toolName, params);
      
      if (result.success) {
        // 写入结果到输入框
        const resultText = `\n\`\`\`${toolName}-result\n${result.result}\n\`\`\``;
        await page.evaluate((text) => {
          window.__MCP_BRIDGE__.setInputValue(text);
        }, resultText);
        
        // 自动发送
        await page.evaluate(() => {
          window.__MCP_BRIDGE__.clickSendButton();
        });
        
        return { success: true };
      } else {
        return { success: false, error: result.error };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // 绑定浏览器事件到暴露的函数
  await page.evaluate(() => {
    window.addEventListener('mcp:load-prompt', () => window.onLoadPrompt());
    window.addEventListener('mcp:reconnect', () => window.onReconnect());
    window.addEventListener('mcp:execute-tool', async (e) => {
      const { toolName, content } = e.detail;
      const result = await window.onExecuteTool(toolName, content);
      
      // 更新按钮状态
      const btn = e.detail.button;
      if (btn) {
        window.__MCP_BRIDGE__.showButtonResult(btn, result.success, result.error);
      }
    });
  });
}

// ============ 主函数 ============

(async () => {
  try {
    console.log('[Bridge] 启动中...');
    
    // 1. 初始化浏览器
    const { page, browser } = await initBrowser();
    currentPage = page;
    console.log('[Bridge] 浏览器已启动');

    // 2. 导航到目标页面
    const targetUrl = PLATFORM_URLS[TARGET_PLATFORM];
    console.log(`[Bridge] 导航到: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    console.log('[Bridge] 页面已加载');
    
    // 3. 检测平台并获取配置
    const hostname = new URL(targetUrl).hostname;
    const platformConfig = findAdapter(hostname);
    
    if (!platformConfig) {
      console.error(`[Bridge] 不支持的平台: ${hostname}`);
      process.exit(1);
    }
    
    console.log(`[Bridge] 检测到平台: ${platformConfig.name}`);
    
    // 4. 注入 DOM Bridge
    await injectDomBridge(page, platformConfig);
    
    // 5. 设置事件处理
    await setupEventHandlers(page);
    
    // 6. 连接 MCP（后台执行，不阻塞）
    connectMcp(page).then(() => {
      console.log('[Bridge] ✅ 初始化完成');
    });
    
    console.log('[Bridge] 等待用户操作...');
    console.log('[Bridge] 提示：确保 MCP Server 已启动');
    console.log('[Bridge] mcp-proxy --port=3000 --allow-origin "*" --stateless -- npx @wonderwhy-er/desktop-commander@latest');
    
  } catch (error) {
    console.error('[Bridge] 启动失败:', error);
    process.exit(1);
  }
})();