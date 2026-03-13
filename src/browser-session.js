const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const McpClient = require('./mcp-client');

function getAuthPath(platform) {
  return path.join(os.homedir(), '.mcpb', `${platform}.auth.json`);
}

function ensureAuthDir(authPath) {
  const dir = path.dirname(authPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function saveAuthState(context, authPath) {
  try {
    ensureAuthDir(authPath);
    await context.storageState({ path: authPath });
    console.log(`[Browser] 登录态已保存到: ${authPath}`);
  } catch (e) {
    console.warn('[Browser] 保存登录态失败:', e.message);
  }
}

async function createSession(platform, url) {
  const browser = await chromium.launch({ headless: false, channel: 'msedge' });
  const authPath = getAuthPath(platform);
  const context = await browser.newContext({
    viewport: null,
    ...(fs.existsSync(authPath) ? { storageState: authPath } : {})
  });
  const page = await context.newPage();
  if (url) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  }
  let closing = null;

  if (fs.existsSync(authPath)) {
    console.log(`[Browser] 使用已保存的登录态: ${authPath}`);
  }

  const shutdown = async (reason, exitCode = 0) => {
    if (closing) {
      return closing;
    }

    closing = (async () => {
      console.log(`[Browser] 正在关闭会话: ${reason}`);
      await saveAuthState(context, authPath);
      await McpClient.reset();

      if (browser.isConnected()) {
        try {
          await browser.close();
        } catch (e) {
          console.warn('[Browser] 关闭浏览器失败:', e.message);
        }
      }

      process.exit(exitCode);
    })();

    return closing;
  };

  page.on('close', () => void shutdown('页面已关闭'));
  browser.on('disconnected', () => void shutdown('浏览器已断开'));

  return { browser, context, page, shutdown };
}

module.exports = { createSession };
