(function () {
  'use strict';

  const { state, getPlatformConfig } = window.__MCP_SHARED__;

  function parseXmlToolCall(xmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');
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
        const xmlContent = match[0];
        const parsed = parseXmlToolCall(xmlContent);
        if (parsed) {
          results.push({
            toolName: parsed.toolName,
            args: parsed.args,
            xmlContent: xmlContent
          });
        }
      }
    }

    return results;
  }

  function createToolCard(toolCall) {
    const card = document.createElement('div');
    card.className = 'mcp-tool-card';
    card.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fff;border-radius:6px;border:1px solid #e5e7eb;';

    const label = document.createElement('span');
    label.textContent = `🔧 ${toolCall.toolName}`;
    label.style.cssText = 'font-weight:500;flex:1;';
    card.appendChild(label);

    const argsPreview = document.createElement('code');
    const firstKey = Object.keys(toolCall.args)[0];
    argsPreview.textContent = firstKey ? `${firstKey}=${JSON.stringify(toolCall.args[firstKey]).slice(0, 30)}` : '';
    argsPreview.style.cssText = 'font-size:11px;color:#6b7280;background:#f3f4f6;padding:2px 6px;border-radius:3px;';
    card.appendChild(argsPreview);

    return card;
  }

  function addExecuteButton(container, toolCall, card) {
    const btn = document.createElement('button');
    btn.className = 'mcp-execute-btn';
    btn.innerHTML = '▶️ 执行';
    btn.style.cssText = 'background:linear-gradient(135deg,#667eea 0%,#764ba2 100%)!important;color:white!important;border:none!important;padding:4px 10px!important;border-radius:4px!important;font-size:12px!important;cursor:pointer!important;';
    btn.onclick = async (e) => {
      e.stopPropagation();
      await executeSingle(btn, toolCall);
    };
    card.appendChild(btn);
  }

  async function executeSingle(btn, toolCall) {
    btn.innerHTML = '⏳ 执行中...';
    btn.style.background = '#9ca3af';
    btn.disabled = true;

    return new Promise((resolve) => {
      const handler = (e) => {
        window.removeEventListener('mcp:execute-result', handler);
        resolve(e.detail);
      };
      window.addEventListener('mcp:execute-result', handler);

      const content = JSON.stringify(toolCall.args);
      window.dispatchEvent(new CustomEvent('mcp:execute-tool', { 
        detail: { 
          toolName: toolCall.toolName, 
          content: content, 
          button: btn,
          callback: 'mcp:execute-result'
        } 
      }));
    });
  }

  function scanForToolCalls() {
    const messageElements = document.querySelectorAll('.message-content, .markdown-content, [class*="message"], [class*="content"]');

    messageElements.forEach((messageEl) => {
      if (state.processedBlocks.has(messageEl)) return;

      const text = messageEl.textContent;
      const toolCalls = findXmlToolCalls(text);

      if (toolCalls.length > 0) {
        state.processedBlocks.add(messageEl);

        const wrapper = document.createElement('div');
        wrapper.className = 'mcp-tools-panel';
        wrapper.style.cssText = 'margin:12px 0;padding:12px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;';

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;';
        
        const title = document.createElement('span');
        title.textContent = `🛠️ 检测到 ${toolCalls.length} 个工具调用`;
        title.style.cssText = 'font-weight:600;font-size:14px;';
        header.appendChild(title);

        if (toolCalls.length > 1) {
          const runAllBtn = document.createElement('button');
          runAllBtn.innerHTML = '⚡ 全部执行';
          runAllBtn.style.cssText = 'background:#10b981!important;color:white!important;border:none!important;padding:6px 12px!important;border-radius:6px!important;font-size:12px!important;cursor:pointer!important;font-weight:500!important;';
          runAllBtn.onclick = async () => {
            runAllBtn.disabled = true;
            runAllBtn.innerHTML = '⏳ 执行中...';
            const buttons = wrapper.querySelectorAll('.mcp-execute-btn');
            for (let i = 0; i < toolCalls.length; i++) {
              await executeSingle(buttons[i], toolCalls[i]);
            }
            runAllBtn.innerHTML = '✅ 全部完成';
            runAllBtn.style.background = '#6b7280!important';
          };
          header.appendChild(runAllBtn);
        }

        wrapper.appendChild(header);

        toolCalls.forEach(toolCall => {
          const card = createToolCard(toolCall);
          addExecuteButton(wrapper, toolCall, card);
          wrapper.appendChild(card);
        });

        messageEl.appendChild(wrapper);
      }
    });
  }

  function startObserver() {
    state.observer = new MutationObserver(scanForToolCalls);
    state.observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(scanForToolCalls, 1000);
    setInterval(scanForToolCalls, 3000);
  }

  window.__MCP_CODEBLOCKS__ = { startObserver };
})();
