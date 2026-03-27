/**
 * Prompt Generator - Node.js 端   
 * 根据工具列表动态生成系统提示词
 */

const fs = require('fs');
const path = require('path');

// 需要过滤掉的工具名称列表
const EXCLUDED_TOOLS = [
  'get_config', 'set_config_value', 'block_command', 'unblock_command',
  'list_blocked_commands', 'set_allowed_directories', 'get_allowed_directories',
  'start_search', 'get_more_search_results', 'stop_search', 'list_searches',
  'get_usage_stats', 'get_recent_tool_calls', 'give_feedback_to_desktop_commander', 'get_prompts'
];

// 允许执行的工具名称列表
const ALLOWED_TOOLS = [
  'read_file', 'write_file',
  'create_directory', 'list_directory', 'move_file', 'get_file_info', 'edit_block',
  'start_process', 'read_process_output', 'interact_with_process', 'force_terminate',
  'list_sessions', 'list_processes', 'kill_process'
];

// 各工具在提示词中需要隐藏的参数配置
// 说明：这里只影响提示词展示，不影响工具真实执行参数
const HIDDEN_TOOL_PARAMS = {
  read_file: ['isUrl', 'sheet', 'range', 'options'],
  edit_block: ['expected_replacements', 'range', 'content', 'options'],
  start_process: ['shell', 'verbose_timing'],
  read_process_output: ['verbose_timing'],
  interact_with_process: ['verbose_timing', 'wait_for_prompt']
};

/**
 * 读取单个 skill 的信息（从 SKILL.md 的 frontmatter 提取 name 和 description）
 */
function loadSkillInfo(skillName, skillsDir) {
  try {
    const skillPath = path.join(skillsDir, skillName, 'SKILL.md');
    if (fs.existsSync(skillPath)) {
      const content = fs.readFileSync(skillPath, 'utf-8');
      // 统一换行符
      const normalized = content.replace(/\r\n/g, '\n');
      // 解析 frontmatter
      const frontmatterMatch = normalized.match(/^---\n([\s\S]*?)\n---/);
      if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[1];
        const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
        
        // 处理单行或多行description
        let description = '';
        const descMatch = frontmatter.match(/^description:\s*\|?\n?([\s\S]*?)(?=^[a-z_]+:|$)/m);
        if (descMatch) {
          description = descMatch[1]
            .split('\n')
            .map(line => line.replace(/^\s+/, '').trim())
            .filter(line => line)
            .join(' ');
        }
        
        return {
          name: nameMatch ? nameMatch[1].trim() : skillName,
          description: description,
          location: skillPath
        };
      }
    }
  } catch (e) {
    console.error(`[PromptGenerator] 读取 skill ${skillName} 失败:`, e.message);
  }
  return null;
}

/**
 * 从指定目录加载 skills
 */
function loadSkillsFromDir(skillsDir) {
  const skills = [];
  try {
    if (!fs.existsSync(skillsDir)) return skills;

    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    const skillNames = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);

    for (const skillName of skillNames) {
      const info = loadSkillInfo(skillName, skillsDir);
      if (info) skills.push(info);
    }
  } catch (e) {
    console.error(`[PromptGenerator] 扫描目录失败 ${skillsDir}:`, e.message);
  }
  return skills;
}

/**
 * 加载所有已安装的 skills（扫描 .agents/skills 目录）
 */
function loadSkills() {
  return loadSkillsFromDir(path.join(process.cwd(), '.agents', 'skills'));
}

/**
 * 检查工具是否允许执行
 */
function isAllowedTool(toolName) {
  return ALLOWED_TOOLS.includes(toolName);
}

/**
 * 生成参数列表
 */
function generateParamList(toolName, schema) {
  if (!schema || !schema.properties) return '';

  const requiredParams = schema.required || [];
  const hiddenParams = new Set(HIDDEN_TOOL_PARAMS[toolName] || []);
  const properties = Object.entries(schema.properties).filter(([key]) => !hiddenParams.has(key));

  return properties.map(([key, value]) => {
    let typeStr = '';
    
    if (value.default !== undefined) {
      typeStr = ` = ${JSON.stringify(value.default)}`;
    } else {
      typeStr = `: ${value.type}`;
    }
    
    const isRequired = requiredParams.includes(key);
    return isRequired ? `${key}${typeStr}` : `${key}?${typeStr}`;
  }).join(', ');
}

/**
 * 生成单个工具的说明
 */
function generateToolSection(tool) {
  const paramList = generateParamList(tool.name, tool.inputSchema);
  return `${tool.name}(${paramList})\n`;
}

/**
 * 生成使用规则
 */
function generateUsageRules() {
  return `## 工具使用指南

- 调用工具时，使用 XML 格式输出工具调用标签
- 使用工具名作为 XML 标签名
- 参数作为子元素，使用正确的值类型
- 字符串不需要引号，数字直接写值
- 如果你能输出思考内容，不能在思考中调用工具
- 可以在一次回复中调用多个工具，多个工具会按顺序执行
- 当你决定调用工具时，你的回复应只包含工具调用 XML，不要夹带解释、总结或伪造结果
- <tool-result> 和 <tool-results> 是系统保留标签，只能由系统在工具执行后返回，你绝不能主动生成这两个标签
- 在没有收到系统返回的 <tool-result> 或 <tool-results> 之前，不要假装工具已经执行成功，不要编造文件内容、目录内容或命令输出
- 收到系统返回的 <tool-result> 或 <tool-results> 后，要把它们当作上下文继续完成任务，而不是原样复述给用户

## 正确示例

当你需要读取文件时，只输出工具调用：
<read_file>
  <path>package.json</path>
</read_file>

当你需要同时查看多个信息时，可以一次输出多个工具调用：
<read_file>
  <path>package.json</path>
</read_file>
<list_directory>
  <path>src</path>
  <depth>2</depth>
</list_directory>

写入文件：
<write_file>
  <path>/path/to/file.txt</path>
  <content>Hello World</content>
</write_file>

执行命令：
<start_process>
  <command>ls -la</command>
  <timeout>5000</timeout>
</start_process>

## 重要说明

以下标签仅供你识别系统返回结果时使用，不能由你主动输出：
- <tool-result>
- <tool-results>

错误示例（不要这样做）：
- 不要在未执行工具前自己输出 <tool-result>
- 不要假装已经读取了 README.md 然后直接给出文件内容
- 不要一边输出工具调用，一边又自己补出工具执行结果

`;
}

/**
 * 生成技能部分
 */
function generateSkillsSection(skills) {
  if (skills.length === 0) return '';

  let section = `## 技能 (${skills.length} 个可用)

每个技能是一个独立的文件夹，包含 \`SKILL.md\` 文件以及可能附带的相关脚本和参考文档。

要使用某个技能，第一步需要读取 \`SKILL.md\` 文件了解详细用法。

`;
  skills.forEach(skill => {
    section += `- **${skill.name}**: ${skill.description}\n`;
  });

  section += '\n';

  return section;
}

/**
 * 生成目录列表部分
 */
function generateDirectorySection() {
  const cwd = process.cwd();
  let section = `## 当前工作目录

\`${cwd}\`

`;

  try {
    const entries = fs.readdirSync(cwd, { withFileTypes: true });
    if (entries.length > 0) {
      section += `目录内容：

`;
      entries.forEach(entry => {
        if (entry.isDirectory()) {
          section += `📁 ${entry.name}/\n`;
        } else {
          section += `📄 ${entry.name}\n`;
        }
      });
    }
  } catch (e) {
    section += `(无法读取目录内容)\n`;
  }

  section += '\n';
  return section;
}

/**
 * 生成完整提示词
 */
function generate(tools) {
  // 先按白名单保留，再过滤掉不需要的工具
  const filteredTools = tools.filter(tool => {
    return ALLOWED_TOOLS.includes(tool.name) && !EXCLUDED_TOOLS.includes(tool.name);
  });

  if (filteredTools.length === 0) {
    return `这是自动回复
当前没有可用工具。MCP Server 可能未运行。
指示用户启动下面的 MCP Server
mcp-proxy --port=3000 --allow-origin "*" --stateless -- npx @wonderwhy-er/desktop-commander@latest
`;
  }

  // 加载已安装的技能
  const skills = loadSkills();

  let prompt = `你是一个强大的自主性AI,以下工具连接到用户工作区,使用以下可用工具来主动帮助用户解决问题。

## 工具 (${filteredTools.length} 个可用)

`;

  filteredTools.forEach(tool => {
    prompt += generateToolSection(tool);
  });

  prompt += '\n';
  prompt += generateUsageRules();

  // 如果有技能，添加技能部分（放在工具示例之后）
  if (skills.length > 0) {
    prompt += generateSkillsSection(skills);
  }

  // 添加当前工作目录信息
  prompt += generateDirectorySection();

  prompt += '如果明白了你当前所处的情况，给用户打个招呼 10个字左右。';

  return prompt;
}

module.exports = {
  generate,
  isAllowedTool,
  ALLOWED_TOOLS,
  EXCLUDED_TOOLS,
  HIDDEN_TOOL_PARAMS
};
