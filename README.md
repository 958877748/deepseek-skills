# DeepSeek MCP Tools

通过 **MCP (Model Context Protocol)** 协议连接外部工具的浏览器扩展。

## 功能特点

- 🔌 **动态工具发现** - 自动从 MCP Server 获取可用工具列表
- 📝 **动态提示词生成** - 根据可用工具自动生成系统提示词
- 🟢 **实时连接状态** - 显示 MCP 连接状态和工具数量
- ⚡ **自动执行** - 点击即可调用 MCP 工具并获取结果

## 前置要求

1. **启动 MCP Server**（你的 server.js）
   ```bash
   node server.js
   ```
   确保 MCP Server 运行在 `http://localhost:3000`

2. **安装浏览器扩展**
   - 打开 Chrome，访问 `chrome://extensions/`
   - 开启「开发者模式」
   - 点击「加载已解压的扩展程序」，选择 `browser-extension` 目录

## 使用步骤

1. **确保 MCP Server 已启动**
   ```bash
   # 在项目根目录运行
   node server.js
   ```

2. **打开 DeepSeek Chat**
   - 访问 https://chat.deepseek.com/
   - 扩展会自动连接 MCP Server（显示 🟢 表示已连接）

3. **加载提示词**
   - 点击右下角「📋 加载 MCP 提示词」按钮
   - 系统会自动从 MCP Server 获取工具列表并生成提示词

4. **使用工具**
   - 与 AI 对话，例如：「帮我算一下 25 加 17」
   - AI 会输出 ` ```action ` 代码块
   - 点击「▶️ 执行」按钮运行工具
   - 结果会自动以 ` ```result ` 格式写入输入框

## 工具调用格式

**Action 调用：**
```action
{
  "name": "add",
  "params": {
    "a": 25,
    "b": 17
  }
}
```

**Result 返回：**
```result
25 + 17 = 42
```

## 文件结构

```
browser-extension/
├── manifest.json              # 扩展配置
├── content.js                 # 主入口（整合所有模块）
├── modules/                   # 功能模块
│   ├── mcp-client.js         # MCP 客户端核心（连接、请求、工具调用）
│   ├── prompt-generator.js   # 提示词生成器（根据工具动态生成）
│   ├── ui-components.js      # UI 组件（状态指示器、按钮、输入框操作）
│   └── action-handler.js     # Action 代码块处理（扫描、执行按钮）
└── icons/                    # 扩展图标
```

### 模块职责

| 模块 | 职责 | 暴露的全局对象 |
|------|------|----------------|
| `mcp-client.js` | MCP 协议通信 | `window.McpClient` |
| `prompt-generator.js` | 动态生成提示词 | `window.PromptGenerator` |
| `ui-components.js` | 界面元素管理 | `window.UIComponents` |
| `action-handler.js` | 代码块扫描执行 | `window.ActionHandler` |
| `content.js` | 主逻辑、模块协调 | - |

## 添加新工具

只需在 `server.js` 中添加新工具，扩展会自动发现并可用：

```javascript
// server.js
server.addTool({
  name: "power",
  description: "计算幂运算",
  parameters: z.object({
    base: z.number(),
    exponent: z.number()
  }),
  execute: async (args) => {
    const result = Math.pow(args.base, args.exponent);
    return {
      content: [{
        type: "text",
        text: `${args.base}^${args.exponent} = ${result}`
      }]
    };
  }
});
```

重启 server.js 后，扩展会自动获取新工具！

## 故障排除

- **🔴 MCP 未连接**
  - 确保 `node server.js` 已运行
  - 点击状态按钮可重试连接

- **找不到输入框**
  - 确保在 DeepSeek Chat 页面
  - 刷新页面后重试

- **工具执行失败**
  - 检查 MCP Server 日志
  - 确保工具名称和参数正确

## 技术架构

```
DeepSeek Chat
     ↓ (浏览器扩展)
browser-extension/content.js
     ↓ (HTTP JSON-RPC 2.0)
MCP Server (server.js)
     ↓ (Node.js)
工具执行
```

## 协议说明

本扩展使用 **Model Context Protocol (MCP)** 协议：
- **传输层**: HTTP Stream
- **消息格式**: JSON-RPC 2.0
- **会话管理**: Session ID (Mcp-Session-Id Header)
- **工具发现**: `tools/list` 方法
- **工具调用**: `tools/call` 方法

了解更多：[MCP 官方文档](https://modelcontextprotocol.io/)
