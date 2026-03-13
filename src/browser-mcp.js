const McpClient = require('./mcp-client');
const PromptGenerator = require('./prompt-generator');
const {
  setInputValue,
  clickSendButton,
  showAlert,
  updateStatus
} = require('./browser-page');

async function connectMcp(page, cwd) {
  await updateStatus(page, 'connecting', 0);
  const connected = await McpClient.initialize(cwd);

  if (!connected) {
    await updateStatus(page, 'error', 0);
    console.log('[Browser] MCP 启动失败，可手动重试');
    return null;
  }

  const tools = await McpClient.fetchTools();
  await updateStatus(page, 'connected', tools.length);
  console.log(`[Browser] MCP 已连接，${tools.length} 个工具`);
  return tools;
}

function createMcpManager(page, cwd) {
  let connecting = null;

  const ensureConnected = async () => {
    if (McpClient.getConnectionStatus().isConnected) {
      return McpClient.fetchTools();
    }

    if (!connecting) {
      connecting = connectMcp(page, cwd).finally(() => {
        connecting = null;
      });
    }

    return connecting;
  };

  return {
    ensureConnected,
    async reconnect() {
      await McpClient.reset();
      connecting = null;
      return ensureConnected();
    },
    async loadPrompt() {
      const tools = await ensureConnected();
      if (!tools || !McpClient.getConnectionStatus().isConnected) {
        await showAlert(page, '❌ MCP 未连接！');
        return;
      }

      const prompt = PromptGenerator.generate(tools);
      await setInputValue(page, prompt);
      console.log(`[Browser] 提示词已加载，${prompt.length} 字符`);
    },
    async executeTool(toolName, content) {
      try {
        const result = await McpClient.callTool(toolName, JSON.parse(content));
        if (!result.success) {
          return { success: false, error: result.error };
        }

        const text = `\n\`\`\`${toolName}-result\n${result.result}\n\`\`\``;
        await setInputValue(page, text);
        await clickSendButton(page);
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
  };
}

async function setupEventHandlers(page, mcp) {
  await page.exposeFunction('onLoadPrompt', async () => {
    console.log('[Browser] 加载提示词');
    await mcp.loadPrompt();
  });

  await page.exposeFunction('onReconnect', async () => {
    console.log('[Browser] 重连 MCP');
    await mcp.reconnect();
  });

  await page.exposeFunction('onExecuteTool', async (toolName, content) => {
    console.log(`[Browser] 执行工具: ${toolName}`);
    return mcp.executeTool(toolName, content);
  });

  await page.evaluate(() => {
    window.addEventListener('mcp:load-prompt', () => window.onLoadPrompt());
    window.addEventListener('mcp:reconnect', () => window.onReconnect());
    window.addEventListener('mcp:execute-tool', async (e) => {
      const { toolName, content, button } = e.detail;
      const result = await window.onExecuteTool(toolName, content);
      if (button) window.__MCP_BRIDGE__.showButtonResult(button, result.success, result.error);
    });
  });
}

module.exports = { createMcpManager, setupEventHandlers };
