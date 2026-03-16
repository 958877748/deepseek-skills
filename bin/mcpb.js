#!/usr/bin/env node
 
/**
 * mcpb CLI 入口
 * 用法:
 *   mcpb qwen
 *   mcpb deepseek
 */

const SUPPORTED_PLATFORMS = ['qwen', 'deepseek'];

function printHelp() {
  console.log(`
mcpb - MCP Bridge CLI

用法:
  mcpb <platform>

平台:
  qwen        打开通义千问
  deepseek    打开 DeepSeek

选项:
  --help      显示帮助

示例:
  mcpb qwen
  mcpb deepseek
`);
}

function parseArgs(argv) {
  const args = argv.slice(2);

  if (args.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  const platform = args[0] || 'deepseek';

  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    console.error(`[mcpb] 不支持的平台: "${platform}"`);
    console.error(`[mcpb] 支持的平台: ${SUPPORTED_PLATFORMS.join(', ')}`);
    process.exit(1);
  }

  const cwd = process.cwd();

  return { platform, cwd };
}

async function main() {
  const { platform, cwd } = parseArgs(process.argv);

  console.log(`[mcpb] 启动中... 平台: ${platform}`);
  console.log(`[mcpb] 工作目录: ${cwd}`);

  // 启动浏览器（MCP Server 由 McpClient 内部管理）
  const Browser = require('../src/browser');
  await Browser.start({ platform, cwd });
}

main().catch(e => {
  console.error('[mcpb] 启动失败:', e.message);
  process.exit(1);
});
