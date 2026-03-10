#!/usr/bin/env node
 
/**
 * mcpb CLI 入口
 * 用法:
 *   mcpb qwen
 *   mcpb deepseek
 *   mcpb qwen --auth
 */

const SUPPORTED_PLATFORMS = ['qwen', 'deepseek'];

function printHelp() {
  console.log(`
mcpb - MCP Bridge CLI

用法:
  mcpb <platform> [选项]

平台:
  qwen        打开通义千问
  deepseek    打开 DeepSeek

选项:
  --auth      保存登录态到 ~/.mcpb/<platform>.auth.json
  --help      显示帮助

示例:
  mcpb qwen
  mcpb deepseek
  mcpb qwen --auth
`);
}

function parseArgs(argv) {
  const args = argv.slice(2); // 去掉 node 和脚本路径

  if (args.length === 0 || args.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  const platform = args[0];
  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    console.error(`[mcpb] 不支持的平台: "${platform}"`);
    console.error(`[mcpb] 支持的平台: ${SUPPORTED_PLATFORMS.join(', ')}`);
    process.exit(1);
  }

  const saveAuth = args.includes('--auth');
  const cwd = process.cwd();

  return { platform, saveAuth, cwd };
}

async function main() {
  const { platform, saveAuth, cwd } = parseArgs(process.argv);

  console.log(`[mcpb] 启动中... 平台: ${platform}`);
  console.log(`[mcpb] 工作目录: ${cwd}`);

  // 启动浏览器（MCP Server 由 McpClient 内部管理）
  const Browser = require('../src/browser');
  await Browser.start({ platform, saveAuth, cwd });
}

main().catch(e => {
  console.error('[mcpb] 启动失败:', e.message);
  process.exit(1);
});
