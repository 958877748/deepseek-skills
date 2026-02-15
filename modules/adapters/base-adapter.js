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
   * 在输入框现有内容后追加文本
   * @param {HTMLElement} element - 输入框元素
   * @param {string} text - 要追加的文本
   */
  appendInputValue(element, text) {
    throw new Error(`Adapter ${this.name} must implement appendInputValue(element, text)`);
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
   * 查找页面中所有代码块元素
   * @returns {NodeList|Array} 代码块元素列表
   */
  findCodeBlocks() {
    throw new Error(`Adapter ${this.name} must implement findCodeBlocks()`);
  }

  /**
   * 判断代码块是否是 action 代码块 (```action)
   * @param {HTMLElement} block - 代码块元素
   * @returns {boolean} 是否是 action 块
   */
  isActionBlock(block) {
    throw new Error(`Adapter ${this.name} must implement isActionBlock(block)`);
  }

  /**
   * 从 action 代码块中提取内容
   * @param {HTMLElement} block - 代码块元素
   * @returns {string} 代码块内容
   */
  getActionContent(block) {
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
