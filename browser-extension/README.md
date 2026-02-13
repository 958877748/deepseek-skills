# DeepSeek Tools

为 DeepSeek Chat 添加工具调用能力的浏览器扩展。

## 安装

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择本目录

## 使用

1. 打开 [DeepSeek Chat](https://chat.deepseek.com/)
2. 点击右下角「📋 加载提示词」按钮，加载系统提示词
3. 与 AI 对话，当 AI 输出 ` ```action ` 代码块时，点击「▶️ 执行」按钮运行工具
4. 执行结果以 ` ```result ` 格式写入输入框

## 格式

**Action 调用：**
```action
{
  "name": "add",
  "params": {
    "a": 5,
    "b": 3
  }
}
```

**Result 返回：**
```result
8
```

## 文件结构

```
├── manifest.json    # 扩展配置
├── content.js       # 主要逻辑
├── prompt.md        # 系统提示词
└── icons/           # 扩展图标
```

## 扩展工具

在 `content.js` 的 `processToolCommand` 函数中添加新工具，在 `prompt.md` 中添加工具说明。
