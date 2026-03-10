/**
 * DOM Bridge - 浏览器端最小注入  
 * 只负责 DOM 操作代理，业务逻辑在 Node.js 端
 * 
 * 通过 window.__MCP_BRIDGE__ 暴露 API 供 Playwright 调用
 */

(function() {
  'use strict';

  // 当前平台配置（由 Node.js 端注入）
  let platformConfig = null;

  // UI 容器
  let uiContainer = null;

  // 代码块观察器
  let codeBlockObserver = null;
  
  // 已处理的代码块
  const processedBlocks = new WeakSet();

  // 允许的工具列表
  const ALLOWED_TOOLS = [
    'read_file', 'read_multiple_files', 'write_file', 'write_pdf',
    'create_directory', 'list_directory', 'move_file', 'get_file_info', 'edit_block',
    'start_process', 'read_process_output', 'interact_with_process', 'force_terminate',
    'list_sessions', 'list_processes', 'kill_process'
  ];

  // ============ 初始化 ============

  function init(config) {
    platformConfig = config;
    console.log(`[DOM Bridge] 已初始化平台: ${config.name}`);
    
    // 创建 UI
    createUI();
    
    // 启动代码块监听
    startCodeBlockObserver();
  }

  // ============ 输入框操作 ============

  function getInputField() {
    return document.querySelector(platformConfig.inputSelector);
  }

  function setInputValue(text) {
    const element = getInputField();
    if (!element) return false;

    if (platformConfig.useReactSetter) {
      // React 框架需要使用原生 setter
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      ).set;
      nativeSetter.call(element, text);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.focus();
    return true;
  }

  function getInputValue() {
    const element = getInputField();
    return element ? element.value : '';
  }

  // ============ 发送按钮 ============

  function clickSendButton() {
    if (platformConfig.sendButtonSelector) {
      // 直接选择器方式
      const btn = document.querySelector(platformConfig.sendButtonSelector);
      if (btn) {
        btn.click();
        return true;
      }
    } else if (platformConfig.sendButtonContainerSelector) {
      // 容器 + 角色方式（DeepSeek）
      const container = document.querySelector(platformConfig.sendButtonContainerSelector);
      if (container) {
        const btn = container.querySelector(`[role="${platformConfig.sendButtonRole}"]:not([aria-disabled="true"])`);
        if (btn) {
          btn.click();
          return true;
        }
      }
    }
    return false;
  }

  // ============ UI 创建 ============

  function createUI() {
    // 创建容器
    uiContainer = document.createElement('div');
    uiContainer.id = 'mcp-bridge-ui';
    uiContainer.style.cssText = `
      position: fixed !important;
      bottom: 0 !important;
      right: 20px !important;
      z-index: 999999999 !important;
      display: flex !important;
      gap: 10px !important;
      align-items: center !important;
    `;
    document.body.appendChild(uiContainer);

    // 创建状态按钮
    createStatusButton();
    
    // 创建提示词按钮
    createPromptButton();
    
    // 创建复制命令按钮
    createCopyCommandButton();
  }

  function createStatusButton() {
    const btn = document.createElement('button');
    btn.id = 'mcp-status-btn';
    btn.style.cssText = `
      border: none !important;
      padding: 8px 14px !important;
      border-radius: 18px !important;
      font-size: 12px !important;
      cursor: pointer !important;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
    `;
    updateStatus(btn, 'connecting', 0);
    uiContainer.appendChild(btn);
  }

  function createPromptButton() {
    const btn = document.createElement('button');
    btn.id = 'mcp-prompt-btn';
    btn.innerHTML = '📋 加载提示词';
    btn.style.cssText = `
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
      color: white !important;
      border: none !important;
      padding: 8px 14px !important;
      border-radius: 18px !important;
      font-size: 12px !important;
      cursor: pointer !important;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
    `;
    btn.onclick = () => {
      // 触发自定义事件，Node.js 端监听
      window.dispatchEvent(new CustomEvent('mcp:load-prompt'));
    };
    uiContainer.appendChild(btn);
  }

  function createCopyCommandButton() {
    const btn = document.createElement('button');
    btn.id = 'mcp-copy-cmd-btn';
    btn.innerHTML = '🚀 复制启动命令';
    btn.style.cssText = `
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%) !important;
      color: white !important;
      border: none !important;
      padding: 8px 14px !important;
      border-radius: 18px !important;
      font-size: 12px !important;
      cursor: pointer !important;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
    `;
    btn.onclick = async () => {
      const cmd = 'mcp-proxy --port=3000 --allow-origin "*" --stateless -- npx @wonderwhy-er/desktop-commander@latest';
      await navigator.clipboard.writeText(cmd);
      btn.innerHTML = '✅ 已复制';
      setTimeout(() => btn.innerHTML = '🚀 复制启动命令', 2000);
    };
    uiContainer.appendChild(btn);
  }

  function updateStatus(btn, status, toolCount) {
    const styles = {
      connected: {
        bg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        label: `🟢 MCP 已连接 (${toolCount}个工具)`
      },
      connecting: {
        bg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        label: '🟡 连接中...'
      },
      error: {
        bg: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        label: '🔴 MCP 未连接'
      }
    };
    
    const style = styles[status] || styles.error;
    btn.style.background = style.bg + ' !important';
    btn.style.color = 'white !important';
    btn.innerHTML = style.label;
    btn.dataset.status = status;
    btn.dataset.toolCount = toolCount;
    
    btn.onclick = () => {
      if (status === 'error') {
        window.dispatchEvent(new CustomEvent('mcp:reconnect'));
      }
    };
  }

  // ============ 代码块监听 ============

  function startCodeBlockObserver() {
    codeBlockObserver = new MutationObserver(() => {
      scanCodeBlocks();
    });
    
    codeBlockObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    // 初始扫描
    setTimeout(scanCodeBlocks, 1000);
    // 定期扫描（备用）
    setInterval(scanCodeBlocks, 3000);
  }

  function scanCodeBlocks() {
    const blocks = document.querySelectorAll(platformConfig.codeBlockSelector);
    
    blocks.forEach(block => {
      if (processedBlocks.has(block)) return;
      
      const toolName = getToolName(block);
      if (toolName && ALLOWED_TOOLS.includes(toolName)) {
        processedBlocks.add(block);
        addExecuteButton(block, toolName);
      }
    });
  }

  function getToolName(block) {
    if (platformConfig.codeBlockLangBySpan) {
      // DeepSeek 方式：遍历 span
      const spans = block.querySelectorAll('span');
      for (const span of spans) {
        const text = span.textContent.trim();
        if (ALLOWED_TOOLS.includes(text)) return text;
      }
    } else if (platformConfig.codeBlockLangSelector) {
      // Qwen 方式：选择器
      const langEl = block.querySelector(platformConfig.codeBlockLangSelector);
      const text = langEl?.textContent.trim();
      if (ALLOWED_TOOLS.includes(text)) return text;
    }
    return null;
  }

  function addExecuteButton(block, toolName) {
    // 找到容器
    let container;
    if (platformConfig.actionButtonContainerSelector) {
      container = block.querySelector(platformConfig.actionButtonContainerSelector);
    } else {
      const btns = block.querySelectorAll('button');
      container = btns.length > 0 ? btns[0].parentElement : null;
    }
    
    if (!container) return;
    
    // 创建执行按钮
    const btn = document.createElement('button');
    btn.className = 'mcp-execute-btn';
    btn.innerHTML = '▶️ 执行';
    btn.style.cssText = `
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
      color: white !important;
      border: none !important;
      padding: 4px 10px !important;
      border-radius: 4px !important;
      font-size: 12px !important;
      cursor: pointer !important;
      margin-right: 4px !important;
    `;
    
    btn.onclick = async (e) => {
      e.stopPropagation();
      
      btn.innerHTML = '⏳ 执行中...';
      btn.style.background = '#9ca3af';
      
      // 获取代码块内容
      const content = await getCodeBlockContent(block);
      
      // 触发事件，传递数据
      window.dispatchEvent(new CustomEvent('mcp:execute-tool', {
        detail: { toolName, content, button: btn }
      }));
    };
    
    container.insertBefore(btn, container.firstChild);
  }

  async function waitClipboardChange(original, timeout = 3000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      await new Promise(r => setTimeout(r, 50));
      const current = await navigator.clipboard.readText();
      if (current !== original) return current;
    }
    return null; // 超时未变化
  }

  async function getCodeBlockContent(block) {
    if (platformConfig.copyButtonSelector) {
      // Qwen 方式：通过剪贴板
      const copyBtn = block.querySelector(platformConfig.copyButtonSelector);
      if (copyBtn) {
        // 先记录当前剪贴板内容
        let original = '';
        try { original = await navigator.clipboard.readText(); } catch (e) {}
        
        copyBtn.click();

        // 轮询等待剪贴板内容变化，最多等 3 秒
        const content = await waitClipboardChange(original, 3000);

        // 恢复原始剪贴板内容
        if (original) navigator.clipboard.writeText(original).catch(() => {});

        return content || '';
      }
    } else if (platformConfig.codeBlockContentSelector) {
      // DeepSeek 方式：直接读取 pre
      const pre = block.querySelector(platformConfig.codeBlockContentSelector);
      return pre ? pre.textContent.trim() : '';
    }
    return '';
  }

  // ============ 辅助函数 ============

  function showButtonResult(btn, success, message) {
    if (success) {
      btn.innerHTML = '✅ 已执行';
      btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    } else {
      btn.innerHTML = '❌ 失败';
      btn.style.background = '#ef4444';
      btn.title = message || '未知错误'; // 鼠标悬停展示错误详情
      console.error('[DOM Bridge] 工具执行失败:', message);
    }
    
    setTimeout(() => {
      btn.innerHTML = '▶️ 执行';
      btn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      btn.title = '';
    }, 3000);
  }

  // ============ 暴露 API ============

  window.__MCP_BRIDGE__ = {
    init,
    getInputField,
    setInputValue,
    getInputValue,
    clickSendButton,
    updateStatus: (status, count) => {
      const btn = document.getElementById('mcp-status-btn');
      if (btn) updateStatus(btn, status, count);
    },
    showButtonResult
  };

  console.log('[DOM Bridge] 模块已加载');

})();
