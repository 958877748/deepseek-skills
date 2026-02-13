import * as vscode from 'vscode';
import { startMcpServer } from './mcp';

let mcpServerInstance: any = null;
let statusBarItem: vscode.StatusBarItem;
let mcpAddress: string = '';

export function activate(context: vscode.ExtensionContext) {
    console.log('HTTP MCP Server 扩展已激活');

    // 创建状态栏项
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'httpmcp.copyAddress';
    context.subscriptions.push(statusBarItem);

    // 注册命令
    context.subscriptions.push(
        vscode.commands.registerCommand('httpmcp.start', startMcp),
        vscode.commands.registerCommand('httpmcp.stop', stopMcp),
        vscode.commands.registerCommand('httpmcp.copyAddress', copyAddress),
        vscode.commands.registerCommand('httpmcp.openInspector', openInspector)
    );

    // 监听配置变化
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('httpmcp')) {
                if (mcpServerInstance) {
                    stopMcp();
                    startMcp();
                }
            }
        })
    );

    // 监听工作区变化
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders((e) => {
            const config = vscode.workspace.getConfiguration('httpmcp');
            if (config.get<boolean>('autoStart', true)) {
                if (e.added.length > 0 && !mcpServerInstance) {
                    startMcp();
                }
                if (e.removed.length > 0 && !vscode.workspace.workspaceFolders?.length) {
                    stopMcp();
                    statusBarItem.hide();
                }
            }
        })
    );

    // 自动启动 - 仅当有工作区时
    const config = vscode.workspace.getConfiguration('httpmcp');
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (config.get<boolean>('autoStart', true) && workspaceFolder) {
        startMcp();
    } else if (!workspaceFolder) {
        console.log('HTTP MCP: 没有打开工作目录，跳过自动启动');
        statusBarItem.hide();
    }
}

async function startMcp(): Promise<void> {
    if (mcpServerInstance) {
        vscode.window.showWarningMessage('HTTP MCP 服务器已在运行');
        return;
    }

    const config = vscode.workspace.getConfiguration('httpmcp');
    const port = config.get<number>('port', 3001);
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (!workspaceFolder) {
        vscode.window.showErrorMessage('没有打开的工作目录，无法启动 MCP 服务器');
        updateStatusBar('❌ MCP: 无工作目录');
        return;
    }

    // 设置工作目录环境变量
    process.env.MCP_WORKSPACE = workspaceFolder;
    process.env.MCP_PORT = String(port);

    mcpAddress = `http://localhost:${port}/mcp`;
    updateStatusBar('🔄 MCP: 启动中...');

    try {
        const result = await startMcpServer(port, workspaceFolder);
        mcpServerInstance = result.server;
        updateStatusBar(`🟢 MCP: ${mcpAddress}`);
        
        vscode.window.showInformationMessage(
            `HTTP MCP 服务器已启动: ${mcpAddress}`,
            '复制地址',
            '打开 Inspector'
        ).then(selection => {
            if (selection === '复制地址') {
                copyAddress();
            } else if (selection === '打开 Inspector') {
                openInspector();
            }
        });
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`MCP 服务器启动失败: ${errMsg}`);
        updateStatusBar('🔴 MCP: 错误');
        mcpServerInstance = null;
    }
}

function stopMcp(): void {
    if (mcpServerInstance) {
        try {
            mcpServerInstance.stop();
        } catch (e) {
            console.error('停止 MCP 服务器时出错:', e);
        }
        mcpServerInstance = null;
        updateStatusBar('⚪ MCP: 已停止');
        vscode.window.showInformationMessage('HTTP MCP 服务器已停止');
    } else {
        vscode.window.showWarningMessage('HTTP MCP 服务器未在运行');
    }
}

function copyAddress(): void {
    if (mcpAddress) {
        vscode.env.clipboard.writeText(mcpAddress);
        vscode.window.showInformationMessage(`已复制: ${mcpAddress}`);
    } else {
        vscode.window.showWarningMessage('MCP 服务器未启动');
    }
}

function openInspector(): void {
    const inspectorUrl = `https://inspector.modelcontextprotocol.io`;
    vscode.env.openExternal(vscode.Uri.parse(inspectorUrl));
}

function updateStatusBar(text: string): void {
    statusBarItem.text = text;
    statusBarItem.tooltip = 'HTTP MCP Server - 点击复制地址';
    statusBarItem.show();
}

export function deactivate() {
    if (mcpServerInstance) {
        try {
            mcpServerInstance.stop();
        } catch (e) {
            console.error('deactivate 时停止 MCP 服务器出错:', e);
        }
        mcpServerInstance = null;
    }
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}