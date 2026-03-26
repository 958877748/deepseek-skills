(function () {
  'use strict';

  const { state, getPlatformConfig } = window.__MCP_SHARED__;
  const processedMessages = new WeakSet();

  function parseXmlToolCall(xmlString) {
    // 先转义 & 字符（但不要重复转义 &amp;）
    const escaped = xmlString.replace(/&(?!(?:amp|lt|gt|quot|apos);)/g, '&amp;');
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(escaped, 'text/xml');
    const errorNode = doc.querySelector('parsererror');
    if (errorNode) return null;

    const root = doc.documentElement;
    const toolName = root.tagName;
    const args = {};

    for (const child of root.children) {
      const key = child.tagName;
      const value = child.textContent.trim();
      
      if (/^\d+$/.test(value)) {
        args[key] = parseInt(value, 10);
      } else if (/^\d+\.\d+$/.test(value)) {
        args[key] = parseFloat(value);
      } else if (value === 'true') {
        args[key] = true;
      } else if (value === 'false') {
        args[key] = false;
      } else {
        args[key] = value;
      }
    }

    return { toolName, args };
  }

  function findXmlToolCalls(text) {
    const config = getPlatformConfig();
    const tools = config.allowedTools || [];
    const results = [];

    const regex = /<(\w+)>\s*([\s\S]*?)<\/\1>/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const toolName = match[1];
      if (tools.includes(toolName)) {
        const parsed = parseXmlToolCall(match[0]);
        if (parsed) results.push(parsed);
      }
    }

    return results;
  }

  async function executeTool(toolCall) {
    return new Promise((resolve) => {
      const handler = (e) => {
        window.removeEventListener('mcp:execute-result', handler);
        resolve(e.detail);
      };
      window.addEventListener('mcp:execute-result', handler);

      window.dispatchEvent(new CustomEvent('mcp:execute-tool', { 
        detail: { 
          toolName: toolCall.toolName, 
          content: JSON.stringify(toolCall.args),
          callback: 'mcp:execute-result'
        } 
      }));
    });
  }

  async function handleDetectClick(msg, btn) {
    btn.innerHTML = '⏳ 执行中...';
    btn.disabled = true;

    const container = msg.parentElement;
    const copyBtn = container?.querySelector('[role="button"]');

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

    // 直接执行所有工具并显示结果
    const resultsArea = document.createElement('div');
    resultsArea.style.cssText = 'margin-top:8px;';
    btn.parentElement.insertBefore(resultsArea, btn.nextSibling);

    for (const toolCall of toolCalls) {
      const result = await executeTool(toolCall);
      
      const card = document.createElement('div');
      card.style.cssText = 'padding:8px 12px;background:#f0fdf4;border-radius:6px;border:1px solid #86efac;margin-bottom:6px;';
      
      const header = document.createElement('div');
      header.style.cssText = 'font-weight:500;font-size:12px;color:#166534;margin-bottom:4px;';
      header.textContent = `✅ ${toolCall.toolName}`;
      card.appendChild(header);

      const content = document.createElement('pre');
      content.style.cssText = 'margin:0;font-size:11px;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow:auto;';
      content.textContent = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      card.appendChild(content);

      resultsArea.appendChild(card);
    }

    btn.innerHTML = '✅ 已执行';
    btn.style.background = '#10b981';
  }

  function addButtonToMessage(msg) {
    if (processedMessages.has(msg)) return;
    processedMessages.add(msg);

    const btn = document.createElement('button');
    btn.innerHTML = '🔍 执行工具';
    btn.style.cssText = 'margin-top:8px;background:#667eea!important;color:white!important;border:none!important;padding:6px 12px!important;border-radius:6px!important;font-size:12px!important;cursor:pointer!important;';
    btn.onclick = () => handleDetectClick(msg, btn);
    msg.appendChild(btn);
  }

  function scanForMessages() {
    const messages = document.querySelectorAll('[class*="ds-message"]');
    messages.forEach(msg => {
      if (msg.innerText && msg.innerText.length > 50) {
        addButtonToMessage(msg);
      }
    });
  }

  function startObserver() {
    state.observer = new MutationObserver(scanForMessages);
    state.observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(scanForMessages, 1000);
    setInterval(scanForMessages, 2000);
  }

  window.__MCP_CODEBLOCKS__ = { startObserver };
})();
