/**
 * UI Components Module
 * 创建和管理界面元素
 */

(function() {
  'use strict';

  // 回调函数存储
  let callbacks = {};

  // 当前平台适配器
  let adapter = null;

  /**
   * 设置回调函数
   */
  function setCallbacks(callbacksMap) {
    callbacks = { ...callbacks, ...callbacksMap };
  }

  /**
   * 设置平台适配器
   * @param {PlatformAdapter} platformAdapter - 平台适配器实例
   */
  function setAdapter(platformAdapter) {
    adapter = platformAdapter;
    console.log(`[UI Components] 已设置适配器: ${adapter.getName()}`);
  }

  /**
   * 检查适配器是否已设置
   * @returns {boolean}
   */
  function hasAdapter() {
    return adapter !== null;
  }

  // 状态按钮的样式配置
  const statusStyles = {
    connected: {
      bg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      shadow: 'rgba(16, 185, 129, 0.3)',
      hoverShadow: 'rgba(16, 185, 129, 0.5)',
      label: (count) => `🟢 MCP 已连接 (${count}个工具)`
    },
    connecting: {
      bg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      shadow: 'rgba(245, 158, 11, 0.3)',
      hoverShadow: 'rgba(245, 158, 11, 0.5)',
      label: () => '🟡 连接中...'
    },
    error: {
      bg: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
      shadow: 'rgba(239, 68, 68, 0.3)',
      hoverShadow: 'rgba(239, 68, 68, 0.5)',
      label: () => '🔴 MCP 未连接 (点击重试)'
    }
  };

  // 按钮容器
  let buttonContainer = null;

  /**
   * 创建按钮容器
   */
  function createButtonContainer() {
    if (buttonContainer) return buttonContainer;
    
    buttonContainer = document.createElement('div');
    buttonContainer.id = 'ds-mcp-button-container';
    buttonContainer.style.cssText = `
      position: fixed !important;
      bottom: 0 !important;
      right: 20px !important;
      z-index: 999999999 !important;
      display: flex !important;
      flex-direction: row !important;
      gap: 10px !important;
      align-items: center !important;
      pointer-events: auto !important;
    `;
    
    document.body.appendChild(buttonContainer);
    return buttonContainer;
  }

  /**
   * 创建 MCP 状态指示器
   */
  function createStatusIndicator(connectionStatus, toolCount) {
    // 确保容器已创建
    const container = createButtonContainer();
    
    const indicator = document.createElement('button');
    indicator.id = 'ds-mcp-status';
    
    // 基础样式
    indicator.style.cssText = `
      border: none !important;
      padding: 8px 14px !important;
      border-radius: 18px !important;
      font-size: 12px !important;
      font-weight: 500 !important;
      cursor: pointer !important;
      transition: all 0.2s ease !important;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
      white-space: nowrap !important;
    `;
    
    updateStatusIndicator(indicator, connectionStatus, toolCount);
    
    // 添加 hover 效果（和提示词按钮一样）
    indicator.addEventListener('mouseenter', () => {
      indicator.style.transform = 'translateY(-2px) !important';
      const status = indicator.dataset.status || 'error';
      const style = statusStyles[status] || statusStyles.error;
      indicator.style.boxShadow = `0 6px 16px ${style.hoverShadow} !important`;
    });

    indicator.addEventListener('mouseleave', () => {
      indicator.style.transform = 'translateY(0) !important';
      const status = indicator.dataset.status || 'error';
      const style = statusStyles[status] || statusStyles.error;
      indicator.style.boxShadow = `0 2px 8px ${style.shadow} !important`;
    });
    
    indicator.addEventListener('click', async () => {
      if (callbacks.onStatusClick) {
        await callbacks.onStatusClick();
      }
    });

    container.appendChild(indicator);
    return indicator;
  }

  /**
   * 更新状态指示器样式
   */
  function updateStatusIndicator(indicator, status, toolCount) {
    const style = statusStyles[status] || statusStyles.error;
    
    // 保存当前状态用于 hover 效果
    indicator.dataset.status = status;
    
    // 应用样式
    indicator.style.background = style.bg + ' !important';
    indicator.style.color = 'white !important';
    indicator.style.boxShadow = `0 2px 8px ${style.shadow} !important`;
    indicator.innerHTML = style.label(toolCount);
  }

  /**
   * 创建复制启动命令按钮
   */
  function createCopyCommandButton() {
    const STARTUP_COMMAND = 'mcp-proxy --port=3000 --allow-origin "*" --stateless -- npx @wonderwhy-er/desktop-commander@latest';
    
    // 确保容器已创建
    const container = createButtonContainer();
    
    const button = document.createElement('button');
    button.id = 'ds-mcp-copy-cmd-btn';
    button.innerHTML = '🚀 复制启动命令';
    button.style.cssText = `
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%) !important;
      color: white !important;
      border: none !important;
      padding: 8px 14px !important;
      border-radius: 18px !important;
      font-size: 12px !important;
      font-weight: 500 !important;
      cursor: pointer !important;
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3) !important;
      transition: all 0.2s ease !important;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
      white-space: nowrap !important;
    `;

    button.addEventListener('mouseenter', () => {
      button.style.transform = 'translateY(-2px) !important';
      button.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.5) !important';
    });

    button.addEventListener('mouseleave', () => {
      button.style.transform = 'translateY(0) !important';
      button.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.3) !important';
    });

    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(STARTUP_COMMAND);
        button.innerHTML = '✅ 已复制';
        button.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%) !important';
        
        setTimeout(() => {
          button.innerHTML = '🚀 复制启动命令';
          button.style.background = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%) !important';
        }, 2000);
        
        console.log('[UI Components] 启动命令已复制到剪贴板');
      } catch (err) {
        console.error('[UI Components] 复制失败:', err);
        alert('复制失败，请手动复制');
      }
    });

    container.appendChild(button);
    console.log('[UI Components] 复制命令按钮已创建');
    return button;
  }

  /**
   * 创建加载提示词按钮
   */
  function createPromptButton() {
    // 确保容器已创建
    const container = createButtonContainer();
    
    const button = document.createElement('button');
    button.id = 'ds-mcp-prompt-btn';
    button.innerHTML = '📋 加载 MCP 提示词';
    button.style.cssText = `
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
      color: white !important;
      border: none !important;
      padding: 8px 14px !important;
      border-radius: 18px !important;
      font-size: 12px !important;
      font-weight: 500 !important;
      cursor: pointer !important;
      box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3) !important;
      transition: all 0.2s ease !important;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
      white-space: nowrap !important;
    `;

    button.addEventListener('mouseenter', () => {
      button.style.transform = 'translateY(-2px) !important';
      button.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.5) !important';
    });

    button.addEventListener('mouseleave', () => {
      button.style.transform = 'translateY(0) !important';
      button.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4) !important';
    });

    button.addEventListener('click', () => {
      if (callbacks.onLoadPrompt) {
        callbacks.onLoadPrompt();
      }
    });

    container.appendChild(button);
    console.log('[UI Components] 提示词按钮已创建');
    return button;
  }

  /**
   * 获取输入框元素
   */
  function getTextarea() {
    if (!hasAdapter()) {
      console.error('[UI Components] 适配器未设置');
      return null;
    }
    return adapter.getInputField();
  }

  /**
   * 自动点击发送按钮
   * 使用轮询方式等待按钮可用
   */
  function autoClickSendButton() {
    if (!hasAdapter()) {
      console.error('[UI Components] 适配器未设置，无法点击发送按钮');
      return;
    }
    
    adapter.clickSendButton();
  }

  /**
   * 加载文本到输入框（不自动发送）
   */
  function loadTextToTextarea(text) {
    if (!hasAdapter()) {
      console.error('[UI Components] 适配器未设置');
      alert('系统错误：适配器未初始化');
      return false;
    }

    const textarea = getTextarea();
    if (!textarea) {
      alert('找不到输入框');
      return false;
    }

    adapter.setInputValue(textarea, text);
    console.log('[UI Components] 已加载文本到输入框');
    
    return true;
  }

  /**
   * 设置文本到输入框（用于写入工具执行结果）
   */
  function setToTextarea(text) {
    if (!hasAdapter()) {
      console.error('[UI Components] 适配器未设置');
      alert('系统错误：适配器未初始化');
      return false;
    }

    const textarea = getTextarea();
    if (!textarea) {
      alert('找不到输入框');
      return false;
    }

    adapter.setInputValue(textarea, text);
    return true;
  }

  // 暴露到全局
  window.UIComponents = {
    setCallbacks,
    setAdapter,
    hasAdapter,
    createStatusIndicator,
    updateStatusIndicator,
    createCopyCommandButton,
    createPromptButton,
    getTextarea,
    loadTextToTextarea,
    setToTextarea,
    autoClickSendButton
  };

})();
