/**
 * Browser 模块   
 * 负责浏览器启动、页面注入、事件处理
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');

const McpClient = require('./mcp-client');
const PromptGenerator = require('./prompt-generator');
const { findAdapter } = require('./adapters');

const PLATFORM_URLS = {
  qwen: 'https://chat.qwen.ai/',
  deepseek: 'https://chat.deepseek.com/'
};

// 工具列表状态
let tools = [];
let workingCwd = null;

// ============ auth 路径 ============

function getAuthPath(platform) {
  return path.join(os.homedir(), '.mcpb', `${platform}.auth.json`);
}

// ============ 浏览器初始化 ============

async function initBrowser(platform, saveAuth) {
  const browser = await chromium.launch({
    headless: false,
    channel: "msedge"
  });

  const authPath = getAuthPath(platform);
  const authExists = fs.existsSync(authPath);

  const contextOptions = { viewport: null };
  if (authExists) {
    contextOptions.storageState = authPath;
    console.log(`[Browser] 使用已保存的登录态: ${authPath}`);
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  // 清理状态标志，防止重复清理
  let isCleaningUp = false;

  // 页面关闭时的清理函数
  const cleanup = () => {
    if (isCleaningUp) return;
    isCleaningUp = true;
    
    console.log('[Browser] 正在清理进程...');
    McpClient.reset();
    // 不等待 browser.close()，直接退出
  };

  // 页面关闭前保存登录态
  const authDir = path.dirname(authPath);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  page.on('close', async () => {
    try {
      await context.storageState({ path: authPath });
      console.log(`[Browser] 登录态已保存到: ${authPath}`);
    } catch (e) {
      console.warn('[Browser] 保存登录态失败:', e.message);
    }
    cleanup();
    process.exit(0);
  });

  browser.on('disconnected', () => {
    cleanup();
    process.exit(0);
  });

  return { page, browser, context };
}

// ============ 脚本注入 ============

async function injectPageAgent(page, platformConfig) {
  const agentPath = path.resolve(__dirname, '../browser/page-agent.js');
  await page.addScriptTag({ path: agentPath });

  // 统一注入允许的工具列表
  const config = {
    ...platformConfig,
    allowedTools: PromptGenerator.ALLOWED_TOOLS
  };

  await page.evaluate((config) => {
    window.__MCP_BRIDGE__.init(config);
  }, config);

  console.log('[Browser] page-agent 已注入');
}

// ============ MCP 连接 ============

async function connectMcp(page) {
  await updateStatus(page, 'connecting', 0);

  const connected = await McpClient.initialize(workingCwd);

  if (connected) {
    tools = await McpClient.fetchTools();
    await updateStatus(page, 'connected', tools.length);
    console.log(`[Browser] MCP 已连接，${tools.length} 个工具`);
    return true;
  } else {
    await updateStatus(page, 'error', 0);
    console.log('[Browser] MCP 连接失败');
    return false;
  }
}

async function updateStatus(page, status, count) {
  await page.evaluate(([s, c]) => {
    window.__MCP_BRIDGE__.updateStatus(s, c);
  }, [status, count]).catch(e => console.warn('[Browser] 状态更新失败:', e.message));
}

// ============ 事件处理 ============

async function setupEventHandlers(page) {
  // 监听加载提示词事件
  await page.exposeFunction('onLoadPrompt', async () => {
    console.log('[Browser] 加载提示词');

    if (!McpClient.getConnectionStatus().isConnected) {
      await connectMcp(page);
    }

    if (!McpClient.getConnectionStatus().isConnected) {
      page.evaluate(() => alert('❌ MCP 未连接！'));
      return;
    }

    const prompt = PromptGenerator.generate(tools);
    await page.evaluate((text) => {
      window.__MCP_BRIDGE__.setInputValue(text);
    }, prompt);

    console.log(`[Browser] 提示词已加载，${prompt.length} 字符`);
  });

  // 监听重连事件
  await page.exposeFunction('onReconnect', async () => {
    console.log('[Browser] 重连 MCP');
    McpClient.reset();
    await connectMcp(page);
  });

  // 监听工具执行事件
  await page.exposeFunction('onExecuteTool', async (toolName, content) => {
    console.log(`[Browser] 执行工具: ${toolName}`);

    try {
      const params = JSON.parse(content);
      const result = await McpClient.callTool(toolName, params);

      if (result.success) {
        const resultText = `\n\`\`\`${toolName}-result\n${result.result}\n\`\`\``;
        await page.evaluate((text) => {
          window.__MCP_BRIDGE__.setInputValue(text);
        }, resultText);

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
      const btn = e.detail.button;
      if (btn) {
        window.__MCP_BRIDGE__.showButtonResult(btn, result.success, result.error);
      }
    });
  });
}

// ============ 主入口 ============

async function start({ platform, saveAuth, cwd }) {
  workingCwd = cwd;
  console.log('[Browser] 启动中...');

  const targetUrl = PLATFORM_URLS[platform];
  if (!targetUrl) {
    throw new Error(`不支持的平台: ${platform}`);
  }

  // 1. 初始化浏览器
  const { page, browser } = await initBrowser(platform, saveAuth);
  console.log('[Browser] 浏览器已启动');

  // 2. 导航到目标页面
  console.log(`[Browser] 导航到: ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  console.log('[Browser] 页面已加载');

  // 3. 获取平台适配器配置
  const hostname = new URL(targetUrl).hostname;
  const platformConfig = findAdapter(hostname);
  if (!platformConfig) {
    throw new Error(`找不到平台适配器: ${hostname}`);
  }
  console.log(`[Browser] 平台: ${platformConfig.name}`);

  // 4. 注入 page-agent
  await injectPageAgent(page, platformConfig);

  // 5. 设置事件处理
  await setupEventHandlers(page);

  // 6. 连接 MCP（后台，不阻塞）
  connectMcp(page).then(() => {
    console.log('[Browser] ✅ 初始化完成');
  }).catch(e => {
    console.error('[Browser] MCP 连接失败:', e.message);
  });

  console.log('[Browser] 等待用户操作...');
}

module.exports = { start };
