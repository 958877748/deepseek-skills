const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

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

  // 按顺序注入脚本（依赖关系：store -> base-adapter -> adapter-registry -> 具体适配器 -> 其他模块 -> app）
  const scripts = [
    'injected/store.js',
    'injected/adapters/base-adapter.js',
    'injected/adapters/adapter-registry.js',
    'injected/adapters/qwen-adapter.js',
    'injected/adapters/deepseek-adapter.js',
    'injected/mcp-client.js',
    'injected/prompt-generator.js',
    'injected/ui-components.js',
    'injected/action-handler.js',
    'injected/app.js',
  ];

  for (const script of scripts) {
    await page.addScriptTag({ path: path.resolve(__dirname, script) });
    console.log(`[Playwright MCP] 已注入: ${script}`);
  }
}

/**
 * 注入初始化脚本
 */
async function injectInitScript(page) {
  await page.evaluate(() => {
    McpBridge.init();
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
