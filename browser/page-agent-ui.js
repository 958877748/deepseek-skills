(function(){
  'use strict';
  const { state } = window.__MCP_SHARED__;

  function button(html, style, onclick) {
    const btn = document.createElement('button');
    btn.innerHTML = html;
    btn.style.cssText = style;
    btn.onclick = onclick;
    return btn;
  }

  function updateStatus(status, count) {
    const btn = document.getElementById('mcp-status-btn');
    if (!btn) return;
    const map = {
      connected: ['linear-gradient(135deg, #10b981 0%, #059669 100%)', `🟢 MCP 已连接 (${count}个工具)`],
      connecting: ['linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', '🟡 启动中...首次可能较慢'],
      error: ['linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', '🔴 启动失败，点击重试']
    };
    const [bg, text] = map[status] || map.error;
    btn.style.background = bg;
    btn.style.color = 'white';
    btn.innerHTML = text;
    btn.onclick = status === 'error' ? () => window.dispatchEvent(new CustomEvent('mcp:reconnect')) : null;
  }

  function createUI() {
    const base = 'color:white!important;border:none!important;padding:8px 14px!important;border-radius:18px!important;font-size:12px!important;cursor:pointer!important;font-family:-apple-system,BlinkMacSystemFont,sans-serif!important;';
    state.uiContainer = document.createElement('div');
    state.uiContainer.id = 'mcp-bridge-ui';
    state.uiContainer.style.cssText = 'position:fixed!important;bottom:0!important;right:20px!important;z-index:999999999!important;display:flex!important;gap:10px!important;align-items:center!important;';
    document.body.appendChild(state.uiContainer);

    const statusBtn = button('', base, null);
    statusBtn.id = 'mcp-status-btn';
    state.uiContainer.appendChild(statusBtn);
    updateStatus('connecting', 0);

    state.uiContainer.appendChild(button('📋 加载提示词', `${base}background:linear-gradient(135deg,#667eea 0%,#764ba2 100%)!important;`, () => {
      window.dispatchEvent(new CustomEvent('mcp:load-prompt'));
    }));
  }

  function showButtonResult(btn, success, message) {
    btn.innerHTML = success ? '✅ 已执行' : '❌ 失败';
    btn.style.background = success ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#ef4444';
    btn.title = success ? '' : (message || '未知错误');
    setTimeout(() => {
      btn.innerHTML = '▶️ 执行';
      btn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      btn.title = '';
    }, 3000);
  }

  window.__MCP_UI__ = { createUI, updateStatus, showButtonResult };
})();
