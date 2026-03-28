(function () {
  'use strict'; 

  const { state, getPlatformConfig } = window.__MCP_SHARED__;
  const processedMessages = new WeakSet();

  function findXmlToolCalls(text) {
    const config = getPlatformConfig();
    const tools = config.allowedTools || [];
    const results = [];

    // 使用栈解析嵌套XML，防止参数中的XML被误解析
    function findToolCallsWithStack(startPos) {
      const stack = [];
      let i = startPos;
      let currentTool = null;
      let currentContent = '';
      let args = {};
      let foundToolTag = false;
      
      while (i < text.length) {
        // 检查是否是工具标签的开始
        let foundTool = false;
        for (const toolName of tools) {
          const openTag = `<${toolName}>`;
          
          if (text.substr(i, openTag.length) === openTag && stack.length === 0) {
            currentTool = toolName;
            currentContent = '';
            args = {};
            stack.push(toolName);
            foundToolTag = true;
            i += openTag.length;
            foundTool = true;
            break;
          }
        }
        
        if (foundTool) continue;
        
        // 检查是否是当前工具标签的结束
        if (stack.length === 1 && foundToolTag && currentTool) {
          const closeTag = `</${currentTool}>`;
          if (text.substr(i, closeTag.length) === closeTag) {
            // 提取参数 - 使用正则匹配参数标签
            const paramRegex = /<([^>]+)>([\s\S]*?)<\/\1>/g;
            let paramMatch;
            while ((paramMatch = paramRegex.exec(currentContent)) !== null) {
              const key = paramMatch[1];
              let value = paramMatch[2].trim();
              
              // 类型转换逻辑保持不变
              if (/^-?\d+$/.test(value)) value = parseInt(value, 10);
              else if (/^-?\d+\.\d+$/.test(value)) value = parseFloat(value);
              else if (value === 'true') value = true;
              else if (value === 'false') value = false;
              
              args[key] = value;
            }
            
            if (Object.keys(args).length > 0) {
              results.push({ toolName: currentTool, args });
            }
            
            stack.pop();
            foundToolTag = false;
            i += closeTag.length;
            return i; // 返回下一个位置
          }
        }
        
        // 添加到当前内容
        if (stack.length > 0) {
          currentContent += text[i];
        }
        i++;
      }
      
      return i;
    }

    // 查找所有工具调用
    let pos = 0;
    while (pos < text.length) {
      const nextPos = findToolCallsWithStack(pos);
      if (nextPos === pos) {
        pos++; // 防止死循环
      } else {
        pos = nextPos;
      }
    }

    return results;
  }

  async function executeToolCalls(toolCalls) {
    return new Promise((resolve) => {
      const handler = (e) => {
        window.removeEventListener('mcp:execute-result', handler);
        resolve(e.detail);
      };
      window.addEventListener('mcp:execute-result', handler);

      window.dispatchEvent(new CustomEvent('mcp:execute-tool', {
        detail: {
          toolCalls,
          callback: 'mcp:execute-result'
        }
      }));
    });
  }

  function getMessageText(msg, config) {
    const content = config.contentSelector ? msg.querySelector(config.contentSelector) : msg;
    return content?.innerText || content?.textContent || msg.innerText || msg.textContent || '';
  }

  async function handleDetectClick(msg, btn) {
    btn.innerHTML = '⏳ 执行中...';
    btn.disabled = true;

    const config = getPlatformConfig();
    const container = msg.parentElement;
    const copyBtn = config.copyButtonSelector
      ? container?.querySelector(config.copyButtonSelector)
      : null;

    if (copyBtn) {
      copyBtn.click();
      await new Promise(r => setTimeout(r, 150));
    }

    let text;
    try {
      text = await navigator.clipboard.readText();
    } catch (e) {
      text = getMessageText(msg, config);
    }

    const toolCalls = findXmlToolCalls(text);

    if (toolCalls.length === 0) {
      btn.innerHTML = '❌ 无工具调用';
      btn.style.background = '#ef4444';
      setTimeout(() => {
        btn.innerHTML = '🔍 执行工具';
        btn.style.background = '#667eea';
        btn.disabled = false;
      }, 2000);
      return;
    }

    const results = await executeToolCalls(toolCalls);

    if (!results?.success) {
      btn.innerHTML = '❌ 执行失败';
      btn.style.background = '#ef4444';
    } else {
      btn.innerHTML = '✅ 已执行';
      btn.style.background = '#10b981';
    }
  }

  function scanForMessages() {
    const config = getPlatformConfig();
    const messageSelector = config.messageSelector || '[class*="ds-message"]';
    const messages = document.querySelectorAll(messageSelector);
    messages.forEach(msg => {
      if (processedMessages.has(msg)) return;

      const container = msg.parentElement;
      if (!container) return;

      const actionContainer = config.actionContainerSelector
        ? container.querySelector(config.actionContainerSelector)
        : container.querySelector('.ds-flex');
      if (!actionContainer) return;

      processedMessages.add(msg);

      const btn = document.createElement('button');
      btn.innerHTML = '🔍 执行工具';
      btn.style.cssText = 'background:#667eea!important;color:white!important;border:none!important;padding:4px 10px!important;border-radius:4px!important;font-size:12px!important;cursor:pointer!important;margin-left:8px;';
      btn.onclick = () => handleDetectClick(msg, btn);
      actionContainer.appendChild(btn);
    });
  }

  function startObserver() {
    state.observer = new MutationObserver(scanForMessages);
    state.observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(scanForMessages, 1000);
    setInterval(scanForMessages, 2000);
  }

  window.__MCP_TOOLCALLS__ = { startObserver };
})();
