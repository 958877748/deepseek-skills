/**
 * Adapter Registry
 * 适配器注册表 - 管理所有平台适配器
 * 
 * 使用方式：
 * 1. 在创建新适配器后，调用 AdapterRegistry.register(NewAdapterClass)
 * 2. 在 content.js 中调用 AdapterRegistry.findAdapter(hostname) 获取当前适配器
 */

class AdapterRegistry {
  static adapters = [];

  /**
   * 注册新的适配器类
   * @param {class} AdapterClass - 继承自 PlatformAdapter 的适配器类
   */
  static register(AdapterClass) {
    if (!AdapterClass.prototype instanceof PlatformAdapter) {
      throw new Error('AdapterClass must extend PlatformAdapter');
    }
    this.adapters.push(AdapterClass);
    console.log(`[AdapterRegistry] 已注册适配器: ${AdapterClass.name}`);
  }

  /**
   * 根据 hostname 查找匹配的适配器
   * @param {string} hostname - 当前页面的 hostname
   * @returns {PlatformAdapter|null} 匹配的适配器实例，如果没有则返回 null
   */
  static findAdapter(hostname) {
    for (const AdapterClass of this.adapters) {
      const adapter = new AdapterClass();
      if (adapter.matches(hostname)) {
        console.log(`[AdapterRegistry] 找到适配器: ${adapter.getName()} for ${hostname}`);
        return adapter;
      }
    }
    console.log(`[AdapterRegistry] 未找到适配器: ${hostname}`);
    return null;
  }

  /**
   * 获取所有已注册的适配器类
   * @returns {Array} 适配器类列表
   */
  static getRegisteredAdapters() {
    return this.adapters;
  }

  /**
   * 清空所有注册的适配器（主要用于测试）
   */
  static clear() {
    this.adapters = [];
  }
}

// 暴露到全局
window.AdapterRegistry = AdapterRegistry;
