(function () {
  'use strict'; 

  const { state, getPlatformConfig } = window.__MCP_SHARED__;
  const processedMessages = new WeakSet();

  function findXmlToolCalls(text) {
    const config = getPlatformConfig();
    const tools = config.allowedTools || [];
    const results = [];

    const escaped = text.replace(/&(?!(?:amp|lt|gt|quot|apos);)/g, '&amp;');
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<root>${escaped}</root>`, 'text/xml');
    
    if (doc.querySelector('parsererror')) return results;
    
    const root = doc.documentElement;
    for (const child of root.children) {
      const toolName = child.tagName;
      if (tools.includes(toolName)) {
        const args = {};
        for (const param of child.children) {
          const key = param.tagName;
          let value = param.textContent.trim();
          
          if (/^-?\d+$/.test(value)) {
            value = parseInt(value, 10);
          } else if (/^-?\d+\.\d+$/.test(value)) {
            value = parseFloat(value);
          } else if (value === 'true') {
            value = true;
          } else if (value === 'false') {
            value = false;
          }
          
          args[key] = value;
        }
        results.push({ toolName, args });
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
