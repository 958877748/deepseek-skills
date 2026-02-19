/**
 * Platform Adapter Base Class
 * 适配器基类 - 定义所有平台适配器必须实现的接口
 * 
 * 使用方式：
 * 1. 继承此类创建新适配器
 * 2. 实现所有抽象方法
 * 3. 在 AdapterRegistry 中注册
 */

class PlatformAdapter {
  /**
   * 构造函数
   * @param {string} name - 适配器名称
   */
  constructor(name) {
    this.name = name;
  }

  // ========== 工具定义 ==========

  /**
   * 允许执行的工具名称列表
   * 与 prompt-generator.js 的 EXCLUDED_TOOLS 互补
   */
  static ALLOWED_TOOLS = [
    'read_file', 'read_multiple_files', 'write_file', 'write_pdf',
    'create_directory', 'list_directory', 'move_file', 'get_file_info', 'edit_block',
    'start_process', 'read_process_output', 'interact_with_process', 'force_terminate',
    'list_sessions', 'list_processes', 'kill_process'
  ];

  /**
   * 检查工具名是否允许
   * @param {string} toolName - 工具名
   * @returns {boolean}
   */
  isAllowedTool(toolName) {
    return PlatformAdapter.ALLOWED_TOOLS.includes(toolName);
  }

  // ========== 平台识别 ==========

  /**
   * 检查适配器是否匹配当前网站
   * @param {string} hostname - 当前页面的 hostname
   * @returns {boolean} 是否匹配
   */
  matches(hostname) {
    throw new Error(`Adapter ${this.name} must implement matches(hostname)`);
  }

  /**
   * 获取适配器名称
   * @returns {string} 适配器名称
   */
  getName() {
    return this.name;
  }

  // ========== 输入框操作 ==========

  /**
   * 获取聊天输入框元素
   * @returns {HTMLElement|null} textarea 或 input 元素
   */
  getInputField() {
    throw new Error(`Adapter ${this.name} must implement getInputField()`);
  }

  /**
   * 设置输入框的值并触发必要的事件
   * @param {HTMLElement} element - 输入框元素
   * @param {string} text - 要设置的文本
   */
  setInputValue(element, text) {
    throw new Error(`Adapter ${this.name} must implement setInputValue(element, text)`);
  }

  /**
   * 触发发送按钮点击
   * 如果按钮不可用可以轮询等待
   */
  clickSendButton() {
    throw new Error(`Adapter ${this.name} must implement clickSendButton()`);
  }

  // ========== Action 代码块 ==========

  /**
   * 获取代码块容器的 CSS 选择器
   * 用于 MutationObserver 检测新代码块
   * @returns {string} CSS 选择器
   */
  getCodeBlockSelector() {
    throw new Error(`Adapter ${this.name} must implement getCodeBlockSelector()`);
  }

  /**
   * 查找页面中所有代码块元素
   * @returns {NodeList|Array} 代码块元素列表
   */
  findCodeBlocks() {
    throw new Error(`Adapter ${this.name} must implement findCodeBlocks()`);
  }

  /**
   * 从代码块中获取工具名
   * @param {HTMLElement} block - 代码块元素
   * @returns {string|null} 工具名，如果不是有效工具则返回 null
   */
  getToolName(block) {
    throw new Error(`Adapter ${this.name} must implement getToolName(block)`);
  }

  /**
   * 判断代码块是否是 action 代码块
   * 默认实现：调用 getToolName 并检查是否是允许的工具
   * @param {HTMLElement} block - 代码块元素
   * @returns {string|false} 返回工具名或 false
   */
  isActionBlock(block) {
    const toolName = this.getToolName(block);
    if (toolName && this.isAllowedTool(toolName)) {
      return toolName;
    }
    return false;
  }

  /**
   * 从 action 代码块中提取内容（异步方法）
   * @param {HTMLElement} block - 代码块元素
   * @returns {Promise<string>} 代码块内容
   */
  async getActionContent(block) {
    throw new Error(`Adapter ${this.name} must implement getActionContent(block)`);
  }

  /**
   * 获取插入执行按钮的容器元素
   * @param {HTMLElement} block - 代码块元素
   * @returns {HTMLElement|null} 按钮容器
   */
  getActionButtonContainer(block) {
    throw new Error(`Adapter ${this.name} must implement getActionButtonContainer(block)`);
  }

  // ========== UI 位置 ==========

  /**
   * 获取控制按钮容器的挂载点
   * 默认使用 body，fixed 定位
   * @returns {HTMLElement} 容器元素
   */
  getControlContainer() {
    return document.body;
  }
}

// 暴露到全局
window.PlatformAdapter = PlatformAdapter;
