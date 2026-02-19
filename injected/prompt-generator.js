/**
 * Prompt Generator Module
 * 根据工具列表动态生成系统提示词
 */

(function () {
  'use strict';

  // 需要过滤掉的工具名称列表
  const EXCLUDED_TOOLS = [
    // 配置类工具
    'get_config',
    'set_config_value',
    'block_command',
    'unblock_command',
    'list_blocked_commands',
    'set_allowed_directories',
    'get_allowed_directories',
    // 搜索类工具
    'start_search',
    'get_more_search_results',
    'stop_search',
    'list_searches',
    // 统计/监控类工具
    'get_usage_stats',
    'get_recent_tool_calls',
    'give_feedback_to_desktop_commander',
    'get_prompts'
  ];

  /**
   * 根据工具列表生成系统提示词
   */
  function generate(tools, config) {
    // 过滤掉不需要的工具
    const filteredTools = tools.filter(tool => !EXCLUDED_TOOLS.includes(tool.name));

    if (filteredTools.length === 0) {
      return generateNoToolsPrompt(config);
    }

    let prompt = `你是一个强大的自主性AI,以下工具连接到用户工作区,使用以下可用工具来主动帮助用户解决问题。

## 工具 (${filteredTools.length} 个可用)

`;

    // 为每个工具生成说明
    filteredTools.forEach((tool) => {
      prompt += generateToolSection(tool);
    });

    prompt += '\n';
    prompt += generateUsageRules();
    prompt += '\n';
    prompt += generateClosing();

    return prompt;
  }

  /**
   * 生成无工具时的提示词
   */
  function generateNoToolsPrompt(config) {
    return `这是自动回复
当前没有可用工具。MCP Server 可能未运行。
指示玩家启动下面的 MCP Server
mcp-proxy --port=3000 --allow-origin "*" --stateless -- npx @wonderwhy-er/desktop-commander@latest
`;
  }

  /**
   * 生成单个工具的说明段落
   */
  function generateToolSection(tool) {
    const requiredParams = tool.inputSchema?.required || [];
    const paramList = generateParamList(tool.inputSchema, requiredParams);

    return `${tool.name}(${paramList})
`;
  }


  /**
   * 生成参数列表，必填不加问号，可选加问号
   */
  function generateParamList(schema, requiredParams) {
    if (!schema || !schema.properties) return '';

    // 删除一些不需要让AI看见的参数
    // 根据我自己的使用经验来看,这些参数看见了AI反倒乱填,反正有默认值
    const delete_keys = [
      "shell"
    ];
    delete_keys.forEach(key => {
      if (schema.properties[key]) {
        delete schema.properties[key];
      }
    });

    return Object.keys(schema.properties).map(key => {
      const value = schema.properties[key];
      let str2 = "";
      if (value.default !== undefined) {
        str2 = ` = ${JSON.stringify(value.default)}`;
      } else {
        str2 = `: ${value.type}`;
      }
      const isRequired = requiredParams.includes(key);
      const str1 = isRequired ? key : `${key}?`;
      return str1 + str2;
    }).join(', ');
  }

  /**
   * 生成使用规则段落
   */
  function generateUsageRules() {
    return `## 工具使用指南

- 调用以上工具你需要输出一个代码块
- 使用工具名作为代码块标签（如 \`\`\`read_file）
- 代码块内只包含参数对象
- 参数必须使用正确的 JSON 格式和语法
- 数字不应加引号
- 如果你能输出思考内容，不能在思考中调用工具
- 一次只能调用一个工具
- 工具名-result 代码块标签 是工具执行后返回的结果，用户不关心它，主要是你来观察并决定下一步做什么

## 示例

下面是一个正确的 代码块 输出示例：
\`\`\`read_file
{
  "path": "/path/to/file.txt"
}
\`\`\`

`;
  }

  /**
   * 生成结尾段落
   */
  function generateClosing() {
    return `如果明白了你当前所处的情况，给用户打个招呼 10个字左右。`;
  }

  // 暴露到全局
  window.PromptGenerator = {
    generate
  };

})();
