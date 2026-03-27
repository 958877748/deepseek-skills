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

  async function handleDetectClick(msg, btn) {
    btn.innerHTML = '⏳ 执行中...';
    btn.disabled = true;

    const container = msg.parentElement;
    const flexContainer = container?.querySelector('.ds-flex');
    const copyBtn = flexContainer?.querySelector('[role="button"]');

    if (copyBtn) {
      copyBtn.click();
      await new Promise(r => setTimeout(r, 150));
    }

    let text;
    try {
      text = await navigator.clipboard.readText();
    } catch (e) {
      text = msg.innerText || msg.textContent || '';
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

    const resultsArea = document.createElement('div');
    resultsArea.style.cssText = 'margin-top:8px;';
    btn.parentElement.insertBefore(resultsArea, btn.nextSibling);

    const results = await executeToolCalls(toolCalls);
    const items = Array.isArray(results?.results) ? results.results : [];

    if (!results?.success) {
      btn.innerHTML = '❌ 执行失败';
      btn.style.background = '#ef4444';
    } else {
      btn.innerHTML = '✅ 已执行';
      btn.style.background = '#10b981';
    }

    items.forEach((item) => {
      const card = document.createElement('div');
      const isSuccess = !!item.success;
      card.style.cssText = `padding:8px 12px;background:${isSuccess ? '#f0fdf4' : '#fef2f2'};border-radius:6px;border:1px solid ${isSuccess ? '#86efac' : '#fca5a5'};margin-bottom:6px;`;

      const header = document.createElement('div');
      header.style.cssText = `font-weight:500;font-size:12px;color:${isSuccess ? '#166534' : '#991b1b'};margin-bottom:4px;`;
      header.textContent = `${isSuccess ? '✅' : '❌'} ${item.toolName}`;
      card.appendChild(header);

      const content = document.createElement('pre');
      content.style.cssText = 'margin:0;font-size:11px;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow:auto;';
      content.textContent = isSuccess
        ? (item.result ?? '')
        : (item.error || '未知错误');
      card.appendChild(content);

      resultsArea.appendChild(card);
    });
  }

  function scanForMessages() {
    const messages = document.querySelectorAll('[class*="ds-message"]');
    messages.forEach(msg => {
      if (processedMessages.has(msg)) return;

      const container = msg.parentElement;
      if (!container || container.children.length < 3) return;

      const flexContainer = container.querySelector('.ds-flex');
      if (!flexContainer) return;

      processedMessages.add(msg);

      const btn = document.createElement('button');
      btn.innerHTML = '🔍 执行工具';
      btn.style.cssText = 'background:#667eea!important;color:white!important;border:none!important;padding:4px 10px!important;border-radius:4px!important;font-size:12px!important;cursor:pointer!important;margin-left:8px;';
      btn.onclick = () => handleDetectClick(msg, btn);
      flexContainer.appendChild(btn);
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
