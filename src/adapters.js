/**
 * 平台适配器配置
 * 纯配置对象，只包含选择器字符串
 */

const adapters = {
  qwen: {
    name: 'Qwen',
    matches: (hostname) => hostname.includes('qwen.ai'),
    inputSelector: '.message-input-textarea',
    sendButtonSelector: '.send-button:not(.disabled)',
    useReactSetter: true
  },

  deepseek: {
    name: 'DeepSeek',
    matches: (hostname) => hostname.includes('deepseek.com'),
    inputSelector: 'textarea[class*="scroll-area"]',
    sendButtonSelector: null,
    sendButtonContainerSelector: '[style*="width: fit-content"]',
    sendButtonRole: 'button',
    useReactSetter: true
  }
};

/**
 * 根据主机名查找适配器
 * 返回的配置不包含函数，可安全序列化传给浏览器
 */
function findAdapter(hostname) {
  for (const [key, adapter] of Object.entries(adapters)) {
    if (adapter.matches(hostname)) {
      const { matches, ...config } = adapter;
      return { key, ...config };
    }
  }
  return null;
}

/**
 * 获取所有适配器
 */
function getAllAdapters() {
  return adapters;
}

module.exports = {
  adapters,
  findAdapter,
  getAllAdapters
};
