/**
 * Qwen Platform Adapter
 * Qwen Chat 平台适配器实现
 */

class QwenAdapter extends PlatformAdapter {
  constructor() {
    super('Qwen');
  }

  // ========== 平台识别 ==========

  matches(hostname) {
    return hostname.includes('qwen.ai');
  }

  // ========== 输入框操作 ==========

  getInputField() {
    return document.querySelector('.message-input-textarea');
  }

  setInputValue(element, text) {
    element.value = text;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.focus();
  }

  clickSendButton() {
    const maxAttempts = 20;
    let attempts = 0;
    
    const interval = setInterval(() => {
      const sendButton = document.querySelector('.send-button:not(.disabled)');
      
      if (sendButton) {
        sendButton.click();
        clearInterval(interval);
        console.log('[QwenAdapter] 已自动点击发送按钮');
      }
      
      attempts++;
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        console.log('[QwenAdapter] 等待发送按钮超时');
      }
    }, 200);
  }

  // ========== Action 代码块 ==========

  getCodeBlockSelector() {
    return '.qwen-markdown-code';
  }

  findCodeBlocks() {
    return document.querySelectorAll('.qwen-markdown-code');
  }

  getToolName(block) {
    const header = block.querySelector('.qwen-markdown-code-header');
    if (!header) return null;
    
    const langDiv = header.querySelector(':scope > div:not(.qwen-markdown-code-header-actions)');
    if (!langDiv) return null;
    
    const langText = langDiv.textContent.trim();
    return this.isAllowedTool(langText) ? langText : null;
  }

  /**
   * 异步获取代码块内容（通过模拟点击复制按钮）
   * @param {HTMLElement} block - 代码块元素
   * @returns {Promise<string>} 代码块内容
   */
  async getActionContent(block) {
    const copyBtn = block.querySelector('.qwen-markdown-code-header-action-item');
    if (!copyBtn) {
      console.error('[QwenAdapter] 找不到复制按钮');
      return '';
    }

    try {
      // 保存当前剪贴板内容
      let originalClipboard = '';
      try {
        originalClipboard = await navigator.clipboard.readText();
      } catch (e) {
        // 忽略读取失败
      }

      // 点击复制按钮
      copyBtn.click();

      // 等待复制完成
      await new Promise(resolve => setTimeout(resolve, 100));

      // 读取剪贴板内容
      const content = await navigator.clipboard.readText();

      // 恢复原剪贴板内容
      if (originalClipboard) {
        navigator.clipboard.writeText(originalClipboard).catch(() => {});
      }

      return content;
    } catch (e) {
      console.error('[QwenAdapter] 获取内容失败:', e);
      return '';
    }
  }

  getActionButtonContainer(block) {
    return block.querySelector('.qwen-markdown-code-header-actions');
  }

  // ========== UI 位置 ==========

  getControlContainer() {
    return document.body;
  }
}

// 暴露到全局
window.QwenAdapter = QwenAdapter;