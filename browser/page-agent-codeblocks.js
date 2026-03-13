(function () {
  'use strict';

  const { state, getPlatformConfig } = window.__MCP_SHARED__;

  function getToolName(block) {
    const config = getPlatformConfig();
    const tools = config.allowedTools || [];

    if (config.codeBlockLangBySpan) {
      for (const span of block.querySelectorAll('span')) {
        const text = span.textContent.trim();
        if (tools.includes(text)) return text;
      }
      return null;
    }

    const text = block.querySelector(config.codeBlockLangSelector)?.textContent.trim();
    return tools.includes(text) ? text : null;
  }

  async function waitClipboardChange(original, timeout = 3000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      await new Promise((r) => setTimeout(r, 50));
      const current = await navigator.clipboard.readText();
      if (current !== original) return current;
    }
    return null;
  }

  async function getCodeBlockContent(block) {
    const config = getPlatformConfig();
    if (config.copyButtonSelector) {
      const btn = block.querySelector(config.copyButtonSelector);
      if (!btn) return '';
      let original = '';
      try { original = await navigator.clipboard.readText(); } catch (_) {}
      btn.click();
      const content = await waitClipboardChange(original);
      if (original) navigator.clipboard.writeText(original).catch(() => {});
      return content || '';
    }

    return block.querySelector(config.codeBlockContentSelector)?.textContent.trim() || '';
  }

  function addExecuteButton(block, toolName) {
    const config = getPlatformConfig();
    const container = config.actionButtonContainerSelector
      ? block.querySelector(config.actionButtonContainerSelector)
      : block.querySelector('button')?.parentElement;
    if (!container) return;

    const btn = document.createElement('button');
    btn.className = 'mcp-execute-btn';
    btn.innerHTML = '▶️ 执行';
    btn.style.cssText = 'background:linear-gradient(135deg,#667eea 0%,#764ba2 100%)!important;color:white!important;border:none!important;padding:4px 10px!important;border-radius:4px!important;font-size:12px!important;cursor:pointer!important;margin-right:4px!important;';
    btn.onclick = async (e) => {
      e.stopPropagation();
      btn.innerHTML = '⏳ 执行中...';
      btn.style.background = '#9ca3af';
      const content = await getCodeBlockContent(block);
      window.dispatchEvent(new CustomEvent('mcp:execute-tool', { detail: { toolName, content, button: btn } }));
    };
    container.insertBefore(btn, container.firstChild);
  }

  function scanCodeBlocks() {
    const config = getPlatformConfig();
    document.querySelectorAll(config.codeBlockSelector).forEach((block) => {
      if (state.processedBlocks.has(block)) return;
      const toolName = getToolName(block);
      if (!toolName) return;
      state.processedBlocks.add(block);
      addExecuteButton(block, toolName);
    });
  }

  function startObserver() {
    state.observer = new MutationObserver(scanCodeBlocks);
    state.observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(scanCodeBlocks, 1000);
    setInterval(scanCodeBlocks, 3000);
  }

  window.__MCP_CODEBLOCKS__ = { startObserver };
})();
