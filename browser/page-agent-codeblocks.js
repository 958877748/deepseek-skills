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

  function addExecuteButton(element, toolCall) {
    const btn = document.createElement('button');
    btn.className = 'mcp-execute-btn';
    btn.innerHTML = '▶️ 执行';
    btn.style.cssText = 'background:linear-gradient(135deg,#667eea 0%,#764ba2 100%)!important;color:white!important;border:none!important;padding:4px 10px!important;border-radius:4px!important;font-size:12px!important;cursor:pointer!important;margin-left:8px!important;';
    btn.onclick = async (e) => {
      e.stopPropagation();
      btn.innerHTML = '⏳ 执行中...';
      btn.style.background = '#9ca3af';
      const content = JSON.stringify(toolCall.args);
      window.dispatchEvent(new CustomEvent('mcp:execute-tool', { 
        detail: { 
          toolName: toolCall.toolName, 
          content: content, 
          button: btn 
        } 
      }));
    };

    const wrapper = document.createElement('span');
    wrapper.style.cssText = 'display:inline-block;';
    wrapper.appendChild(btn);
    element.appendChild(wrapper);
  }

  function scanForToolCalls() {
    const messageElements = document.querySelectorAll('.message-content, .markdown-content, [class*="message"], [class*="content"]');

    messageElements.forEach((messageEl) => {
      if (state.processedBlocks.has(messageEl)) return;

      const text = messageEl.textContent;
      const toolCalls = findXmlToolCalls(text);

      if (toolCalls.length > 0) {
        state.processedBlocks.add(messageEl);
        toolCalls.forEach(toolCall => {
          const wrapper = document.createElement('div');
          wrapper.className = 'mcp-tool-wrapper';
          wrapper.style.cssText = 'margin:8px 0;padding:8px;background:#f3f4f6;border-radius:6px;border-left:3px solid #667eea;';
          
          const label = document.createElement('span');
          label.textContent = `🔧 ${toolCall.toolName}`;
          label.style.cssText = 'font-weight:bold;margin-right:8px;';
          wrapper.appendChild(label);

          addExecuteButton(wrapper, toolCall);
          messageEl.appendChild(wrapper);
        });
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
