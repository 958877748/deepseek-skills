/**
 * DeepSeek Tools - 极简版
 * 处理 AI 回复中的 ```action 代码块命令
 */

(function() {
  'use strict';

  console.log('[DeepSeek Tools] 已加载');

  // 创建提示词按钮
  function createPromptButton() {
    const button = document.createElement('button');
    button.id = 'ds-prompt-button';
    button.innerHTML = '📋 加载提示词';
    button.style.cssText = `
      position: fixed !important;
      bottom: 0 !important;
      right: 20px !important;
      z-index: 999999999 !important;
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
      pointer-events: auto !important;
    `;

    button.addEventListener('mouseenter', () => {
      button.style.transform = 'translateY(-2px) !important';
      button.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.5) !important';
    });

    button.addEventListener('mouseleave', () => {
      button.style.transform = 'translateY(0) !important';
      button.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4) !important';
    });

    button.addEventListener('click', loadPromptToTextarea);

    document.body.appendChild(button);
    console.log('[DeepSeek Tools] 提示词按钮已创建');
  }

  // 加载提示词到输入框
  async function loadPromptToTextarea() {
    const textarea = document.querySelector('textarea[class*="scroll-area"]');
    if (!textarea) {
      alert('找不到输入框');
      return;
    }

    try {
      // 从扩展内部读取 prompt.md
      const promptUrl = chrome.runtime.getURL('prompt.md');
      const response = await fetch(promptUrl);
      if (!response.ok) {
        throw new Error('无法加载 prompt.md');
      }
      const promptText = await response.text();

      textarea.value = promptText;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      
      // 滚动到输入框
      textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
      textarea.focus();

      console.log('[DeepSeek Tools] 提示词已从 prompt.md 加载到输入框');
    } catch (e) {
      console.error('[DeepSeek Tools] 加载提示词失败:', e);
      alert('加载提示词失败: ' + e.message);
    }
  }

  // 初始化：创建提示词按钮
  createPromptButton();

  // 标记已处理的元素，避免重复处理
  const processedElements = new WeakSet();

  // 工具函数：加法
  function add(a, b) {
    return Number(a) + Number(b);
  }

  // 处理工具命令
  function processToolCommand(jsonStr) {
    try {
      const tool = JSON.parse(jsonStr);
      console.log('[DeepSeek Tools] 执行工具:', tool);

      if (tool.name === 'add') {
        return {
          success: true,
          result: add(tool.params.a, tool.params.b)
        };
      }

      return { success: false, error: '未知工具' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // 把结果写入输入框
  function writeResultToTextarea(result) {
    const textarea = document.querySelector('textarea[class*="scroll-area"]');
    if (!textarea) {
      alert('找不到输入框');
      return false;
    }

    // 构造结果消息（使用代码块格式）
    let resultContent;
    if (typeof result.result === 'object') {
      resultContent = JSON.stringify(result.result, null, 2);
    } else {
      resultContent = result.result;
    }
    
    const resultMessage = `\`\`\`result\n${resultContent}\n\`\`\``;
    
    // 追加结果
    textarea.value = textarea.value + resultMessage;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    
    // 滚动到输入框并聚焦
    textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    textarea.focus();
    
    console.log('[DeepSeek Tools] 结果已写入输入框:', resultMessage);
    return true;
  }

  // 扫描页面中的 action 代码块，添加播放按钮
  function scanForActionBlocks() {
    // 查找所有 .md-code-block 容器
    const codeBlocks = document.querySelectorAll('.md-code-block');
    
    for (const block of codeBlocks) {
      // 跳过已处理的
      if (processedElements.has(block)) continue;
      
      // 检查语言标识是否为 action（遍历 span 找文本内容）
      const spans = block.querySelectorAll('span');
      let isActionBlock = false;
      for (const span of spans) {
        if (span.textContent.trim() === 'action') {
          isActionBlock = true;
          break;
        }
      }
      if (!isActionBlock) continue;
      
      // 获取 pre 中的 JSON 内容
      const pre = block.querySelector('pre');
      if (!pre) continue;
      
      const jsonStr = pre.textContent.trim();
      
      // 验证是否是有效的 action JSON
      try {
        const parsed = JSON.parse(jsonStr);
        if (!parsed.name || !parsed.params) continue;
      } catch (e) {
        continue;
      }
      
      // 标记已处理
      processedElements.add(block);
      
      // 添加播放按钮
      addPlayButton(block, jsonStr);
    }
  }

  // 给代码块添加播放按钮
  function addPlayButton(codeBlock, jsonStr) {
    // 找到已有的按钮（复制/下载等）
    const existingBtns = codeBlock.querySelectorAll('button');
    if (existingBtns.length === 0) {
      console.log('[DeepSeek Tools] 找不到按钮');
      return;
    }
    
    // 检查是否已添加播放按钮
    if (codeBlock.querySelector('.ds-action-play-btn')) return;
    
    // 创建播放按钮
    const playBtn = document.createElement('button');
    playBtn.className = 'ds-action-play-btn';
    playBtn.innerHTML = '▶️ 执行';
    playBtn.style.cssText = `
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
      color: white !important;
      border: none !important;
      padding: 4px 10px !important;
      border-radius: 4px !important;
      font-size: 12px !important;
      cursor: pointer !important;
      margin-right: 4px !important;
      transition: all 0.2s ease !important;
    `;
    
    playBtn.addEventListener('mouseenter', () => {
      playBtn.style.transform = 'scale(1.05)';
      playBtn.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.5)';
    });
    
    playBtn.addEventListener('mouseleave', () => {
      playBtn.style.transform = 'scale(1)';
      playBtn.style.boxShadow = 'none';
    });
    
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const result = processToolCommand(jsonStr);
      if (result.success) {
        writeResultToTextarea(result);
      } else {
        alert('执行失败: ' + result.error);
      }
    });
    
    // 插入到第一个按钮的父元素中，放在最前面
    const firstBtn = existingBtns[0];
    const parentContainer = firstBtn.parentElement;
    parentContainer.insertBefore(playBtn, parentContainer.firstChild);
    console.log('[DeepSeek Tools] 已添加播放按钮');
  }

  // 监听 DOM 变化
  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            // 检查是否包含代码块
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

  // 定期扫描（处理已存在的内容）
  setInterval(scanForActionBlocks, 2000);

  console.log('[DeepSeek Tools] 监控已启动');
})();
