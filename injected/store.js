/**
 * Store Module - 统一状态管理
 * 集中管理应用的所有状态，提供响应式更新机制
 */

(function() {
  'use strict';

  // ============ 内部状态 ============

  const state = {
    // MCP 连接状态
    mcp: {
      sessionId: null,
      isConnected: false,
      error: null
    },
    
    // 工具列表
    tools: [],
    
    // 当前平台适配器
    adapter: null,
    
    // UI 元素引用
    ui: {
      statusIndicator: null,
      buttonContainer: null
    }
  };

  // 状态变更监听器
  const listeners = new Map();

  // ============ Getter 方法 ============

  function getMcpStatus() {
    return { ...state.mcp };
  }

  function getTools() {
    return [...state.tools];
  }

  function getAdapter() {
    return state.adapter;
  }

  function getUI() {
    return { ...state.ui };
  }

  function getState() {
    return {
      mcp: { ...state.mcp },
      tools: [...state.tools],
      adapter: state.adapter,
      ui: { ...state.ui }
    };
  }

  // ============ Setter 方法 ============

  function setMcpStatus(partial) {
    Object.assign(state.mcp, partial);
    emit('mcp:change', state.mcp);
    return state.mcp;
  }

  function setTools(tools) {
    state.tools = tools;
    emit('tools:change', state.tools);
    return state.tools;
  }

  function setAdapter(adapter) {
    state.adapter = adapter;
    emit('adapter:change', state.adapter);
    return state.adapter;
  }

  function setUI(partial) {
    Object.assign(state.ui, partial);
    emit('ui:change', state.ui);
    return state.ui;
  }

  // ============ 便捷方法 ============

  function isConnected() {
    return state.mcp.isConnected;
  }

  function hasAdapter() {
    return state.adapter !== null;
  }

  function getToolCount() {
    return state.tools.length;
  }

  // ============ 事件系统 ============

  function on(event, callback) {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    listeners.get(event).add(callback);
    
    // 返回取消订阅函数
    return () => off(event, callback);
  }

  function off(event, callback) {
    if (listeners.has(event)) {
      listeners.get(event).delete(callback);
    }
  }

  function emit(event, data) {
    if (listeners.has(event)) {
      listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (e) {
          console.error(`[Store] 事件处理错误 (${event}):`, e);
        }
      });
    }
  }

  // ============ 重置状态 ============

  function reset() {
    state.mcp = { sessionId: null, isConnected: false, error: null };
    state.tools = [];
    state.adapter = null;
    state.ui = { statusIndicator: null, buttonContainer: null };
    emit('reset', null);
  }

  // ============ 暴露 API ============

  window.Store = {
    // Getters
    getMcpStatus,
    getTools,
    getAdapter,
    getUI,
    getState,
    isConnected,
    hasAdapter,
    getToolCount,
    
    // Setters
    setMcpStatus,
    setTools,
    setAdapter,
    setUI,
    
    // Events
    on,
    off,
    emit,
    
    // Utils
    reset
  };

})();
