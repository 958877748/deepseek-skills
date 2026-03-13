(function () {
  'use strict';

  let platformConfig = null;
  const state = {
    uiContainer: null,
    observer: null,
    processedBlocks: new WeakSet()
  };

  function getInputField() {
    return document.querySelector(platformConfig.inputSelector);
  }

  function setInputValue(text) {
    const el = getInputField();
    if (!el) return false;

    if (platformConfig.useReactSetter) {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus();
    return true;
  }

  function clickSendButton() {
    if (platformConfig.sendButtonSelector) {
      const btn = document.querySelector(platformConfig.sendButtonSelector);
      if (btn) return btn.click(), true;
    }

    const container = document.querySelector(platformConfig.sendButtonContainerSelector);
    const btn = container?.querySelector(`[role="${platformConfig.sendButtonRole}"]:not([aria-disabled="true"])`);
    if (btn) return btn.click(), true;
    return false;
  }

  window.__MCP_SHARED__ = {
    state,
    setPlatformConfig: (config) => { platformConfig = config; },
    getPlatformConfig: () => platformConfig,
    getInputField,
    setInputValue,
    clickSendButton
  };
})();
