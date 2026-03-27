const fs = require('fs');
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

/**
 * 上传图片到聊天平台
 * @param {Page} page - Playwright 页面对象
 * @param {string} imagePath - 图片文件路径
 */
async function uploadImage(page, imagePath) {
  console.log(`[Browser] 开始上传图片: ${imagePath}`);

  // 检查文件是否存在
  if (!fs.existsSync(imagePath)) {
    console.error(`[Browser] 文件不存在: ${imagePath}`);
    return { success: false, error: `文件不存在: ${imagePath}` };
  }
  console.log(`[Browser] 文件存在，大小: ${fs.statSync(imagePath).size} bytes`);

  // 检查是否是支持的图片格式
  const ext = path.extname(imagePath).toLowerCase();
  const supportedFormats = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];
  if (!supportedFormats.includes(ext)) {
    console.error(`[Browser] 不支持的图片格式: ${ext}`);
    return { success: false, error: `不支持的图片格式: ${ext}` };
  }
  console.log(`[Browser] 图片格式: ${ext}`);

  try {
    console.log('[Browser] 开始上传流程...');
    
    // Step 1: 点击 + 号按钮
    const openButtonClicked = await page.evaluate(() => {
      const btn = document.querySelector('.mode-select-open');
      if (!btn) return false;
      btn.click();
      return true;
    });
    
    if (!openButtonClicked) {
      return { success: false, error: '未找到 + 号按钮' };
    }
    
    await page.waitForTimeout(500);
    
    // Step 2: 点击上传选项
    let fileSelected = false;
    page.once('filechooser', async (fileChooser) => {
      await fileChooser.setFiles(imagePath);
      fileSelected = true;
    });
    
    const uploadOptionClicked = await page.evaluate(() => {
      const items = document.querySelectorAll('.mode-select-dropdown-item');
      for (const item of items) {
        const text = item.textContent || item.innerText || '';
        if (text.includes('上传') || text.includes('附件') || text.includes('Upload') || text.includes('File')) {
          item.click();
          return true;
        }
      }
      if (items.length > 0) {
        items[0].click();
        return true;
      }
      return false;
    });
    
    if (!uploadOptionClicked) {
      return { success: false, error: '未找到上传选项' };
    }
    
    // 等待文件选择器
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(500);
      if (fileSelected) break;
    }
    
    // 检测上传是否完成
    const fileName = path.basename(imagePath);
    let uploadSuccess = false;
    
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(1000);
      
      const result = await page.evaluate((fileName) => {
        const container = document.querySelector('.message-input-container');
        if (!container) return { found: false };
        
        const images = container.querySelectorAll('img');
        for (const img of images) {
          const alt = img.getAttribute('alt') || '';
          if (alt.includes(fileName)) {
            return { found: true, alt: alt };
          }
        }
        return { found: false };
      }, fileName);
      
      if (result.found) {
        uploadSuccess = true;
        break;
      }
    }
    
    if (!uploadSuccess) {
      return { success: false, error: '上传超时' };
    }

    return { success: true, message: '图片上传成功' };

  } catch (error) {
    console.error('[Browser] 上传图片失败:', error.message);
    console.error('[Browser] 错误堆栈:', error.stack);
    return { success: false, error: error.message };
  }
}

module.exports = {
  injectPageAgent,
  setInputValue,
  clickSendButton,
  showAlert,
  updateStatus,
  uploadImage
};