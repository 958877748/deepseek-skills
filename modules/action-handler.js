/**
 * Action Handler Module
 * 处理 action 代码块的扫描和执行
 */

(function() {
  'use strict';

  // 标记已处理的元素
  const processedElements = new WeakSet();
  
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
    console.log(`[Action Handler] 已设置适配器: ${adapter.getName()}`);
  }

  /**
   * 检查适配器是否已设置
   * @returns {boolean}
   */
  function hasAdapter() {
    return adapter !== null;
  }

  /**
   * 扫描页面中的 action 代码块
   */
  function scanForActionBlocks() {
    if (!hasAdapter()) {
      console.error('[Action Handler] 适配器未设置，无法扫描代码块');
      return;
    }

    const codeBlocks = adapter.findCodeBlocks();
    
    for (const block of codeBlocks) {
      if (processedElements.has(block)) continue;
      
      // 使用适配器判断是否是 action 代码块
      if (!adapter.isActionBlock(block)) continue;
      
      const jsonStr = adapter.getActionContent(block);
      if (!jsonStr) continue;
      
      try {
        const parsed = JSON.parse(jsonStr);
        if (!parsed.name || !parsed.params) continue;
      } catch (e) {
        continue;
      }
      
      processedElements.add(block);
      addPlayButton(block, jsonStr);
    }
  }

  /**
   * 给代码块添加播放按钮
   */
  function addPlayButton(codeBlock, jsonStr) {
    if (!hasAdapter()) {
      console.error('[Action Handler] 适配器未设置，无法添加按钮');
      return;
    }

    // 使用适配器获取按钮容器
    const parentContainer = adapter.getActionButtonContainer(codeBlock);
    if (!parentContainer) return;
    
    if (codeBlock.querySelector('.ds-mcp-play-btn')) return;
    
    const isConnected = callbacks.isConnected ? callbacks.isConnected() : false;
    
    const playBtn = document.createElement('button');
    playBtn.className = 'ds-mcp-play-btn';
    playBtn.innerHTML = isConnected ? '▶️ 执行' : '⚠️ 未连接';
    playBtn.style.cssText = `
      background: ${isConnected ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#9ca3af'} !important;
      color: white !important;
      border: none !important;
      padding: 4px 10px !important;
      border-radius: 4px !important;
      font-size: 12px !important;
      cursor: ${isConnected ? 'pointer' : 'not-allowed'} !important;
      margin-right: 4px !important;
      transition: all 0.2s ease !important;
    `;
    
    if (isConnected) {
      playBtn.addEventListener('mouseenter', () => {
        playBtn.style.transform = 'scale(1.05)';
        playBtn.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.5)';
      });
      
      playBtn.addEventListener('mouseleave', () => {
        playBtn.style.transform = 'scale(1)';
        playBtn.style.boxShadow = 'none';
      });
      
      playBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await executeTool(playBtn, jsonStr);
      });
    }
    
    parentContainer.insertBefore(playBtn, parentContainer.firstChild);
    console.log('[Action Handler] 已添加执行按钮');
  }

  /**
   * 执行工具
   */
  async function executeTool(button, jsonStr) {
    button.innerHTML = '⏳ 执行中...';
    button.style.background = '#9ca3af';
    
    try {
      const tool = JSON.parse(jsonStr);
      
      if (callbacks.onExecuteTool) {
        const result = await callbacks.onExecuteTool(tool.name, tool.params);
        
        if (result.success) {
          if (callbacks.onWriteResult) {
            callbacks.onWriteResult(result.result);
          }
          showSuccessState(button);
          
          // 自动点击发送按钮
          setTimeout(() => {
            if (window.UIComponents && window.UIComponents.autoClickSendButton) {
              window.UIComponents.autoClickSendButton();
            }
          }, 100);
        } else {
          alert('执行失败: ' + result.error);
          showErrorState(button);
        }
      }
    } catch (e) {
      alert('解析失败: ' + e.message);
      showErrorState(button);
    }
  }

  /**
   * 显示成功状态
   */
  function showSuccessState(button) {
    button.innerHTML = '✅ 已执行';
    button.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    setTimeout(() => {
      button.innerHTML = '▶️ 执行';
      button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    }, 2000);
  }

  /**
   * 显示错误状态
   */
  function showErrorState(button) {
    button.innerHTML = '❌ 失败';
    button.style.background = '#ef4444';
    setTimeout(() => {
      button.innerHTML = '▶️ 执行';
      button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    }, 2000);
  }

  /**
   * 初始化 DOM 观察器
   */
  function initObserver() {
    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) {
              if (node.classList?.contains('md-code-block') || 
                  node.querySelector?.('.md-code-block')) {
                shouldScan = true;
                break;
              }
            }
          }
        }
        if (shouldScan) break;
      }

      if (shouldScan) {
        setTimeout(scanForActionBlocks, 100);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // 初始扫描
    setTimeout(scanForActionBlocks, 1000);
    
    // 定期扫描
    setInterval(scanForActionBlocks, 2000);

    console.log('[Action Handler] DOM 观察器已启动');
  }

  // 暴露到全局
  window.ActionHandler = {
    setCallbacks,
    setAdapter,
    hasAdapter,
    scanForActionBlocks,
    initObserver
  };

})();
