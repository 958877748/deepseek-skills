(function () {
  'use strict';

  const shared = window.__MCP_SHARED__;
  const ui = window.__MCP_UI__;
  const toolcalls = window.__MCP_TOOLCALLS__;

  function init(config) {
    shared.setPlatformConfig(config);
    ui.createUI();
    toolcalls.startObserver();
    console.log(`[DOM Bridge] 已初始化平台: ${config.name}`);
  }

  window.__MCP_BRIDGE__ = {
    init,
    getInputField: shared.getInputField,
    setInputValue: shared.setInputValue,
    clickSendButton: shared.clickSendButton,
    updateStatus: ui.updateStatus,
    showButtonResult: ui.showButtonResult
  };

  console.log('[DOM Bridge] 模块已加载');
})();
