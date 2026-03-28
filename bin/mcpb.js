#!/usr/bin/env node
 
/**
 * mcpb 桌面版入口
 */

const { selectFolder, messageBox } = require('win32-dialog');
const Systray = require('systray2').default;
const path = require('path');
const fs = require('fs');

const SUPPORTED_PLATFORMS = ['qwen', 'deepseek'];

// 获取exe内置图标（如果没有用默认图标）
function getIconPath() {
  try {
    // 优先使用打包后的内置路径
    return path.join(process.execPath, '../icon.ico');
  } catch (e) {
    // 开发环境默认图标
    return path.join(__dirname, '../assets/icon.ico');
  }
}

// 初始化系统托盘
function initTray(cwd, platform) {
  const tray = new Systray({
    icon: getIconPath(),
    menu: [
      {
        title: `工作目录: ${path.basename(cwd)}`,
        enabled: false
      },
      {
        title: `当前平台: ${platform}`,
        enabled: false
      },
      {
        title: '打开工作目录',
        click: () => {
          require('child_process').exec(`explorer.exe "${cwd}"`);
        }
      },
      {
        title: '退出',
        click: () => {
          tray.kill();
          process.exit(0);
        }
      }
    ]
  });

  tray.on('click', () => {
    // 点击托盘打开工作目录
    require('child_process').exec(`explorer.exe "${cwd}"`);
  });

  return tray;
}

async function main() {
  // 1. 弹出文件夹选择器
  const selectedPath = selectFolder('选择工作目录', process.cwd());
  if (!selectedPath) {
    // 用户取消选择，直接退出
    process.exit(0);
  }

  // 2. 验证目录有效性
  if (!fs.existsSync(selectedPath) || !fs.statSync(selectedPath).isDirectory()) {
    messageBox('错误', '选择的目录无效', 'error');
    process.exit(1);
  }

  // 3. 解析参数（默认deepseek平台）
  const args = process.argv.slice(2);
  const platform = args[0] || 'deepseek';
  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    messageBox('错误', `不支持的平台: ${platform}`, 'error');
    process.exit(1);
  }

  // 4. 初始化系统托盘
  const tray = initTray(selectedPath, platform);

  // 5. 启动浏览器服务
  try {
    const Browser = require('../src/browser');
    await Browser.start({ platform, cwd: selectedPath });
  } catch (e) {
    messageBox('启动失败', e.message, 'error');
    tray.kill();
    process.exit(1);
  }
}

main().catch(e => {
  messageBox('错误', e.message, 'error');
  process.exit(1);
});
