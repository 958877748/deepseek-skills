const McpClient = require('./mcp-client');
const PromptGenerator = require('./prompt-generator');  
const {
  setInputValue,
  clickSendButton,
  showAlert,
  updateStatus,
  uploadImage
} = require('./browser-page');

async function connectMcp(page, cwd) {
  await updateStatus(page, 'connecting');
  const connected = await McpClient.initialize(cwd);

  if (!connected) {
    await updateStatus(page, 'error');
    console.log('[Browser] MCP 启动失败，可手动重试');
    return null;
  }

  const tools = await McpClient.fetchTools();
  await updateStatus(page, 'connected');
  console.log(`[Browser] MCP 已连接，${tools.length} 个工具`);
  return tools;
}

function buildToolResultsMessage(results) {
  const formatted = results.map((item) => ({
    tool: item.toolName,
    success: item.success,
    result: item.success ? (item.result ?? null) : null,
    error: item.success ? null : (item.error ?? null)
  }));

  return JSON.stringify(formatted, null, 2);
}

function createMcpManager(page, cwd, platformConfig) {
  const supportsImageUpload = platformConfig?.supportsImageUpload ?? false;
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

      const prompt = PromptGenerator.generate(tools, supportsImageUpload);
      await setInputValue(page, prompt);
      console.log(`[Browser] 提示词已加载，${prompt.length} 字符`);
    },
    async executeToolCalls(toolCalls) {
      const results = [];

      try {
        for (const toolCall of toolCalls) {
          console.log(`[Browser] 执行工具: ${toolCall.toolName}`);

          // 处理 read_image 工具（本地浏览器操作）
          if (toolCall.toolName === 'read_image') {
            if (!supportsImageUpload) {
              results.push({ success: false, toolName: 'read_image', error: '当前平台不支持图片上传' });
              continue;
            }

            const imagePath = toolCall.args?.path;
            if (!imagePath) {
              results.push({ success: false, toolName: 'read_image', error: '缺少 path 参数' });
              continue;
            }

            console.log(`[Browser] 上传图片: ${imagePath}`);
            const uploadResult = await uploadImage(page, imagePath);

            if (uploadResult.success) {
              results.push({
                success: true,
                toolName: 'read_image',
                result: `图片已成功上传: ${imagePath}`
              });
            } else {
              results.push({
                success: false,
                toolName: 'read_image',
                error: uploadResult.error
              });
            }
            continue;
          }

          // 其他工具通过 MCP 调用
          try {
            const result = await McpClient.callTool(toolCall.toolName, toolCall.args || {});
            if (!result.success) {
              results.push({ success: false, toolName: toolCall.toolName, error: result.error });
              continue;
            }

            results.push({ success: true, toolName: toolCall.toolName, result: result.result });
          } catch (e) {
            results.push({ success: false, toolName: toolCall.toolName, error: e.message });
          }
        }

        if (results.length === 0) {
          return {
            success: false,
            error: '没有可发送的工具执行结果',
            results
          };
        }

        const text = buildToolResultsMessage(results);
        const inputSet = await setInputValue(page, text);
        if (inputSet === false) {
          return {
            success: false,
            error: '写入输入框失败',
            results
          };
        }

        const sent = await clickSendButton(page);
        if (sent !== true) {
          return {
            success: false,
            error: '发送失败：发送按钮不可点击或未找到发送按钮',
            results
          };
        }

        return {
          success: true,
          results
        };
      } catch (e) {
        return { success: false, error: e.message, results };
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

  await page.exposeFunction('onExecuteToolCalls', async (toolCalls) => {
    return mcp.executeToolCalls(toolCalls);
  });

  await page.evaluate(() => {
    window.addEventListener('mcp:load-prompt', () => window.onLoadPrompt());
    window.addEventListener('mcp:reconnect', () => window.onReconnect());
    window.addEventListener('mcp:execute-tool', async (e) => {
      const { toolCalls = [], button, callback } = e.detail;
      const result = await window.onExecuteToolCalls(toolCalls);
      if (button) window.__MCP_BRIDGE__.showButtonResult(button, result.success, result.error);
      if (callback) window.dispatchEvent(new CustomEvent(callback, { detail: result }));
    });
  });
}

module.exports = { createMcpManager, setupEventHandlers };
