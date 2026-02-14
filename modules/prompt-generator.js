/**
 * Prompt Generator Module
 * 根据工具列表动态生成系统提示词
 */

(function() {
  'use strict';

  /**
   * 根据工具列表生成系统提示词
   */
  function generate(tools, config) {
    if (tools.length === 0) {
      return generateNoToolsPrompt(config);
    }

    let prompt = `# DeepSeek MCP Tools - 系统提示词

你是一个配备 MCP (Model Context Protocol) 工具的 AI 助手，可以调用外部工具来执行任务。

## 🛠️ 可用工具 (${tools.length}个)

`;

    // 为每个工具生成说明
    tools.forEach((tool) => {
      prompt += generateToolSection(tool);
    });

    prompt += generateUsageRules();
    prompt += generateExamples();
    prompt += generateClosing();

    return prompt;
  }

  /**
   * 生成无工具时的提示词
   */
  function generateNoToolsPrompt(config) {
    return `# DeepSeek MCP Tools

当前没有可用的工具。请确保 MCP Server 正在运行。

**MCP Server 地址**: http://${config.host}:${config.port}

**可能的原因：**
1. MCP Server 未启动
2. 网络连接问题
3. 扩展权限未正确设置

**解决方法：**
1. 在终端运行：\`node server.js\`
2. 刷新 DeepSeek 页面
3. 检查扩展权限设置
`;
  }

  /**
   * 生成单个工具的说明段落
   */
  function generateToolSection(tool) {
    return `### ${tool.description || tool.name} (${tool.name})

**调用格式：**
\`\`\`action
{
  "name": "${tool.name}",
  "params": ${formatSchemaExample(tool.inputSchema)}
}
\`\`\`

`;
  }

  /**
   * 根据 JSON Schema 生成示例参数
   */
  function formatSchemaExample(schema) {
    if (!schema || !schema.properties) return '{}';
    
    const example = {};
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (prop.type === 'number') {
        example[key] = 0;
      } else if (prop.type === 'string') {
        example[key] = 'value';
      } else if (prop.type === 'boolean') {
        example[key] = true;
      } else if (prop.type === 'array') {
        example[key] = [];
      } else if (prop.type === 'object') {
        example[key] = {};
      }
    }
    
    return JSON.stringify(example, null, 2);
  }

  /**
   * 生成使用规则段落
   */
  function generateUsageRules() {
    return `## ⚠️ 使用规则

1. **只输出工具调用格式** - 不要直接给出计算结果，只输出工具调用指令
2. **确保 JSON 格式正确** - 所有引号、大括号必须成对
3. **数值不加引号** - 数字参数必须是数值类型，不要加引号
4. **识别用户意图** - 当用户需要计算、查询等操作时，判断是否需要使用工具

`;
  }

  /**
   * 生成示例段落
   */
  function generateExamples() {
    return `## 📝 示例

**示例 1：使用加法工具**

用户：帮我算一下 7 + 5
AI：
\`\`\`action
{
  "name": "add",
  "params": {
    "a": 7,
    "b": 5
  }
}
\`\`\`

**示例 2：使用乘法工具**

用户：三百乘二百等于多少？
AI：
\`\`\`action
{
  "name": "multiply",
  "params": {
    "a": 300,
    "b": 200
  }
}
\`\`\`

## ❌ 错误示例

❌ **错误：直接给出答案**
\`\`\`
用户：计算 3 + 4
AI：3 + 4 = 7
\`\`\`

❌ **错误：数字加了引号**
\`\`\`action
{
  "name": "add",
  "params": {
    "a": "3",
    "b": "4"
  }
}
\`\`\`

`;
  }

  /**
   * 生成结尾段落
   */
  function generateClosing() {
    return `---

现在请根据用户的需求，使用正确的工具调用格式来帮助他们。
**以上都看明白的话，请给用户回复一句问候语（10个字左右），并告知当前可用的工具数量。**
`;
  }

  // 暴露到全局
  window.PromptGenerator = {
    generate
  };

})();
