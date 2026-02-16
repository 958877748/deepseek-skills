/**
 * DeepSeek Platform Adapter
 * DeepSeek Chat 平台适配器实现
 */

class DeepSeekAdapter extends PlatformAdapter {
  constructor() {
    super('DeepSeek');
  }

  // ========== 平台识别 ==========

  matches(hostname) {
    return hostname.includes('deepseek.com');
  }

  // ========== 输入框操作 ==========

  getInputField() {
    return document.querySelector('textarea[class*="scroll-area"]');
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
      const parent = document.querySelector('[style*="width: fit-content"]');
      if (!parent) {
        attempts++;
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          console.log('[DeepSeekAdapter] 未找到输入框父容器');
        }
        return;
      }
      
      const sendButton = parent.querySelector('[role="button"]:not([aria-disabled="true"])');
      
      if (sendButton) {
        sendButton.click();
        clearInterval(interval);
        console.log('[DeepSeekAdapter] 已自动点击发送按钮');
      }
      
      attempts++;
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        console.log('[DeepSeekAdapter] 等待发送按钮超时');
      }
    }, 200);
  }

  // ========== Action 代码块 ==========

  getCodeBlockSelector() {
    return '.md-code-block';
  }

  findCodeBlocks() {
    return document.querySelectorAll('.md-code-block');
  }

  getToolName(block) {
    const spans = block.querySelectorAll('span');
    for (const span of spans) {
      const text = span.textContent.trim();
      if (this.isAllowedTool(text)) {
        return text;
      }
    }
    return null;
  }

  async getActionContent(block) {
    const pre = block.querySelector('pre');
    return pre ? pre.textContent.trim() : '';
  }

  getActionButtonContainer(block) {
    const existingBtns = block.querySelectorAll('button');
    if (existingBtns.length === 0) return null;
    return existingBtns[0].parentElement;
  }

  // ========== UI 位置 ==========

  getControlContainer() {
    return document.body;
  }
}

// 暴露到全局
window.DeepSeekAdapter = DeepSeekAdapter;