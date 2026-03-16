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
  'read_file', 'read_multiple_files', 'write_file', 'write_pdf',
  'create_directory', 'list_directory', 'move_file', 'get_file_info', 'edit_block',
  'start_process', 'read_process_output', 'interact_with_process', 'force_terminate',
  'list_sessions', 'list_processes', 'kill_process'
];

/**
 * 读取单个 skill 的信息（从 SKILL.md 的 frontmatter 提取 name 和 description）
 */
function loadSkillInfo(skillName) {
  try {
    const skillPath = path.join(process.cwd(), '.agents', 'skills', skillName, 'SKILL.md');
    if (fs.existsSync(skillPath)) {
      const content = fs.readFileSync(skillPath, 'utf-8');
      // 解析 frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[1];
        const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
        const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
        return {
          name: nameMatch ? nameMatch[1].trim() : skillName,
          description: descMatch ? descMatch[1].trim() : ''
        };
      }
    }
  } catch (e) {
    console.error(`[PromptGenerator] 读取 skill ${skillName} 失败:`, e.message);
  }
  return { name: skillName, description: '' };
}

/**
 * 加载所有已安装的 skills 信息（扫描 .agents/skills 目录）
 */
function loadSkills() {
  try {
    const skillsDir = path.join(process.cwd(), '.agents', 'skills');
    if (!fs.existsSync(skillsDir)) return [];

    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    const skillNames = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);

    const skills = [];
    for (const skillName of skillNames) {
      const info = loadSkillInfo(skillName);
      skills.push(info);
    }
    return skills;
  } catch (e) {
    console.error('[PromptGenerator] 扫描 skills 目录失败:', e.message);
    return [];
  }
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
function generateParamList(schema) {
  if (!schema || !schema.properties) return '';

  const requiredParams = schema.required || [];
  
  // 移除不需要让 AI 看见的参数
  const properties = { ...schema.properties };
  delete properties.shell;

  return Object.keys(properties).map(key => {
    const value = properties[key];
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
  const paramList = generateParamList(tool.inputSchema);
  return `${tool.name}(${paramList})\n`;
}

/**
 * 生成使用规则
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

  section += `
示例：读取技能文档
\`\`\`read_file
{
  "path": ".agents/skills/{技能名}/SKILL.md"
}
\`\`\`

`;

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
  // 过滤掉不需要的工具
  const filteredTools = tools.filter(tool => !EXCLUDED_TOOLS.includes(tool.name));

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
  EXCLUDED_TOOLS
};
