const path = require('path');
const PromptGenerator = require('./prompt-generator'); 

const AGENT_SCRIPTS = [
  '../browser/page-agent-base.js',
  '../browser/page-agent-ui.js',
  '../browser/page-agent-toolcalls.js',
  '../browser/page-agent.js'
];

function isPageUnavailableError(error) {
  const message = error?.message || '';
  return message.includes('Target page, context or browser has been closed')
    || message.includes('Execution context was destroyed');
}

async function runPage(page, handler, fallbackMessage) {
  if (page.isClosed()) {
    return;
  }

  try {
    return await handler();
  } catch (e) {
    if (!isPageUnavailableError(e) && fallbackMessage) {
      console.warn(fallbackMessage, e.message);
    }
  }
}

async function injectPageAgent(page, platformConfig) {
  for (const script of AGENT_SCRIPTS) {
    await page.addScriptTag({ path: path.resolve(__dirname, script) });
  }

  const config = {
    ...platformConfig,
    allowedTools: PromptGenerator.ALLOWED_TOOLS
  };

  await runPage(
    page,
    () => page.evaluate((value) => window.__MCP_BRIDGE__.init(value), config),
    '[Browser] page-agent 初始化失败:'
  );

  console.log('[Browser] page-agent 已注入');
}

function setInputValue(page, text) {
  return runPage(
    page,
    () => page.evaluate((value) => window.__MCP_BRIDGE__.setInputValue(value), text),
    '[Browser] 设置输入框失败:'
  );
}

function clickSendButton(page) {
  return runPage(
    page,
    () => page.evaluate(() => window.__MCP_BRIDGE__.clickSendButton()),
    '[Browser] 点击发送按钮失败:'
  );
}

function showAlert(page, message) {
  return runPage(
    page,
    () => page.evaluate((text) => alert(text), message),
    '[Browser] 显示提示失败:'
  );
}

function updateStatus(page, status, count) {
  return runPage(
    page,
    () => page.evaluate(([s, c]) => window.__MCP_BRIDGE__.updateStatus(s, c), [status, count]),
    '[Browser] 状态更新失败:'
  );
}

module.exports = {
  injectPageAgent,
  setInputValue,
  clickSendButton,
  showAlert,
  updateStatus
};
