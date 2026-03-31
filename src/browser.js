/**
 * Browser 模块     
 * 负责浏览器启动、页面注入、事件处理
 */

const { findAdapter } = require('./adapters');
const { createSession } = require('./browser-session');
const { injectPageAgent } = require('./browser-page');
const { createMcpManager, setupEventHandlers } = require('./browser-mcp');

const PLATFORM_URLS = {
  qwen: 'https://chat.qwen.ai/',
  deepseek: 'https://chat.deepseek.com/'
};

// ============ 主入口 ============

async function start({ platform, cwd }) {
  console.log('[Browser] 启动中...');

  const targetUrl = PLATFORM_URLS[platform];
  if (!targetUrl) {
    throw new Error(`不支持的平台: ${platform}`);
  }

  let session = null;

  try {
    // 1. 初始化浏览器并直接打开目标页面
    session = await createSession(platform, targetUrl);
    const { page, shutdown } = session;
    console.log(`[Browser] 已启动并打开: ${targetUrl}`);

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
    const mcpManager = createMcpManager(page, cwd, platformConfig);
    await setupEventHandlers(page, mcpManager);

    // 6. 连接 MCP（后台，不阻塞）
    void mcpManager.ensureConnected().then((tools) => {
      if (tools) {
        console.log('[Browser] ✅ 初始化完成');
      }
    }).catch(e => {
      console.error('[Browser] MCP 连接失败:', e.message);
    });

    console.log('[Browser] 等待用户操作...');

    return { shutdown };
  } catch (e) {
    if (session) {
      await session.shutdown(`启动失败: ${e.message}`, 1);
      return;
    }

    throw e;
  }
}

module.exports = { start };
