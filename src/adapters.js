/**
 * 平台适配器配置
 * 纯配置对象，只包含选择器字符串
 */

const adapters = {
  qwen: {
    name: 'Qwen',
    // 平台匹配
    matches: (hostname) => hostname.includes('qwen.ai'),
    // 输入框选择器
    inputSelector: '.message-input-textarea',
    // 发送按钮选择器
    sendButtonSelector: '.send-button:not(.disabled)',
    // 代码块选择器
    codeBlockSelector: '.qwen-markdown-code',
    // 代码块语言选择器
    codeBlockLangSelector: '.qwen-markdown-code-header > div:not(.qwen-markdown-code-header-actions)',
    // 复制按钮选择器
    copyButtonSelector: '.qwen-markdown-code-header-action-item',
    // 执行按钮容器选择器
    actionButtonContainerSelector: '.qwen-markdown-code-header-actions',
    // 是否使用 React 方式设置值
    useReactSetter: true
  },

  deepseek: {
    name: 'DeepSeek',
    // 平台匹配
    matches: (hostname) => hostname.includes('deepseek.com'),
    // 输入框选择器
    inputSelector: 'textarea[class*="scroll-area"]',
    // 发送按钮选择器（需要特殊处理）
    sendButtonSelector: null, // DeepSeek 需要特殊逻辑
    // 发送按钮容器选择器
    sendButtonContainerSelector: '[style*="width: fit-content"]',
    sendButtonRole: 'button',
    // 代码块选择器
    codeBlockSelector: '.md-code-block',
    // 代码块语言通过遍历 span 获取
    codeBlockLangBySpan: true,
    // 代码块内容选择器
    codeBlockContentSelector: 'pre',
    // 是否使用 React 方式设置值
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
      // 过滤掉函数属性，只返回可序列化的配置
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
