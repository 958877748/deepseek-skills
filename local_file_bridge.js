#!/usr/bin/env node

/**
 * DeepSeek Local File Bridge Service (修复版)
 * 修复文件读取失败问题
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const WebSocket = require('ws');
const crypto = require('crypto');

// ==================== 配置 ====================
const CONFIG = {
    PORT: 8765,
    HOST: 'localhost',
    ALLOWED_PATHS: [], // 留空表示允许所有路径
    BACKUP_DIR: '.deepseek_backups',
    MAX_FILE_SIZE: 1024 * 1024 * 10, // 10MB
    LOG_FILE: 'bridge_service.log',
    DEBUG: true
};

// ==================== 日志工具 ====================
class Logger {
    static log(...args) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}]`, ...args);
    }

    static error(...args) {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}]`, ...args);
    }

    static debug(...args) {
        if (CONFIG.DEBUG) {
            const timestamp = new Date().toISOString();
            console.log(`[DEBUG ${timestamp}]`, ...args);
        }
    }
}

// ==================== 文件工具类 ====================
class FileUtils {
    static async safeReadFile(filePath, encoding = 'utf8') {
        try {
            Logger.debug(`开始读取文件: ${filePath}`);

            // 检查文件是否存在
            if (!fs.existsSync(filePath)) {
                throw new Error(`文件不存在: ${filePath}`);
            }

            const stats = await fsp.stat(filePath);
            Logger.debug(`文件状态: ${stats.size} 字节, ${stats.isDirectory() ? '目录' : '文件'}`);

            if (stats.size > CONFIG.MAX_FILE_SIZE) {
                throw new Error(`文件过大: ${stats.size} 字节 (限制: ${CONFIG.MAX_FILE_SIZE} 字节)`);
            }

            if (stats.isDirectory()) {
                throw new Error(`路径是目录而不是文件: ${filePath}`);
            }

            const content = await fsp.readFile(filePath, encoding);
            Logger.debug(`文件读取成功，大小: ${content.length} 字符`);
            return content;

        } catch (error) {
            Logger.error(`读取文件失败: ${filePath}`, error);
            throw new Error(`读取文件失败: ${error.message}`);
        }
    }

    static async safeWriteFile(filePath, content) {
        try {
            // 创建备份
            await this.createBackup(filePath);

            // 确保目录存在
            const dir = path.dirname(filePath);
            await fsp.mkdir(dir, { recursive: true });

            // 写入文件
            await fsp.writeFile(filePath, content, 'utf8');

            Logger.debug(`文件写入成功: ${filePath}`);
            return { success: true, message: `文件已写入: ${filePath}` };

        } catch (error) {
            Logger.error(`写入文件失败: ${filePath}`, error);

            // 尝试恢复备份
            try {
                await this.restoreBackup(filePath);
            } catch (restoreError) {
                Logger.error('恢复备份失败:', restoreError);
            }

            throw new Error(`写入文件失败: ${error.message}`);
        }
    }

    static async createBackup(filePath) {
        try {
            if (!await this.fileExists(filePath)) return null;

            const backupDir = path.join(path.dirname(filePath), CONFIG.BACKUP_DIR);
            await fsp.mkdir(backupDir, { recursive: true });

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = `${path.basename(filePath)}_${timestamp}.bak`;
            const backupPath = path.join(backupDir, backupName);

            await fsp.copyFile(filePath, backupPath);
            Logger.debug(`创建备份: ${backupPath}`);
            return backupPath;

        } catch (error) {
            Logger.warn(`创建备份失败: ${error.message}`);
            return null;
        }
    }

    static async restoreBackup(filePath) {
        try {
            const backupDir = path.join(path.dirname(filePath), CONFIG.BACKUP_DIR);
            if (!fs.existsSync(backupDir)) return false;

            const files = await fsp.readdir(backupDir);
            const backups = files
                .filter(f => f.startsWith(path.basename(filePath)))
                .sort()
                .reverse();

            if (backups.length === 0) return false;

            const latestBackup = path.join(backupDir, backups[0]);
            await fsp.copyFile(latestBackup, filePath);
            Logger.debug(`已从备份恢复: ${latestBackup}`);
            return true;

        } catch (error) {
            Logger.warn(`恢复备份失败: ${error.message}`);
            return false;
        }
    }

    static async findContentPosition(fileContent, oldContentStart, oldContentEnd = null) {
        const lines = fileContent.split('\n');
        const startLines = oldContentStart.split('\n');

        for (let i = 0; i <= lines.length - startLines.length; i++) {
            let match = true;
            for (let j = 0; j < startLines.length; j++) {
                if (lines[i + j] !== startLines[j]) {
                    match = false;
                    break;
                }
            }

            if (match) {
                if (oldContentEnd) {
                    const remainingLines = lines.slice(i + startLines.length);
                    const endLines = oldContentEnd.split('\n');
                    if (remainingLines.length < endLines.length) continue;

                    let endMatch = true;
                    for (let k = 0; k < endLines.length; k++) {
                        if (remainingLines[k] !== endLines[k]) {
                            endMatch = false;
                            break;
                        }
                    }
                    if (!endMatch) continue;

                    return {
                        start: i,
                        end: i + startLines.length + endLines.length,
                        foundContent: lines.slice(i, i + startLines.length + endLines.length).join('\n')
                    };
                }

                return {
                    start: i,
                    end: i + startLines.length,
                    foundContent: lines.slice(i, i + startLines.length).join('\n')
                };
            }
        }

        return null;
    }

    static async updateFileSection(filePath, oldContentStart, oldContentEnd, newContent) {
        try {
            Logger.debug(`更新文件片段: ${filePath}`);
            const originalContent = await this.safeReadFile(filePath);

            const position = await this.findContentPosition(
                originalContent,
                oldContentStart,
                oldContentEnd
            );

            if (!position) {
                throw new Error('未找到匹配的旧内容。请确保提供的旧内容片段准确。');
            }

            if (!position.foundContent.includes(oldContentStart) ||
                (oldContentEnd && !position.foundContent.includes(oldContentEnd))) {
                throw new Error('找到的内容片段不匹配。可能文件中有相似但不相同的内容。');
            }

            const lines = originalContent.split('\n');
            const before = lines.slice(0, position.start).join('\n');
            const after = lines.slice(position.end).join('\n');

            let newFullContent;
            if (before) {
                newFullContent = before + '\n' + newContent + (after ? '\n' + after : '');
            } else {
                newFullContent = newContent + (after ? '\n' + after : '');
            }

            return await this.safeWriteFile(filePath, newFullContent);

        } catch (error) {
            Logger.error(`更新文件片段失败: ${filePath}`, error);
            throw new Error(`更新文件片段失败: ${error.message}`);
        }
    }

    static async fileExists(filePath) {
        try {
            await fsp.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    static async directoryExists(dirPath) {
        try {
            const stat = await fsp.stat(dirPath);
            return stat.isDirectory();
        } catch {
            return false;
        }
    }

    // 改进的路径验证函数，更宽松的检查
    static validatePath(requestedPath) {
        try {
            Logger.debug(`验证路径: ${requestedPath}`);

            // 规范化路径（处理Windows反斜杠）
            let normalizedPath = requestedPath.replace(/\\/g, '/');

            // 解析绝对路径
            let resolvedPath;
            try {
                resolvedPath = path.resolve(normalizedPath);
            } catch (resolveError) {
                // 如果path.resolve失败，尝试其他方法
                Logger.debug(`path.resolve失败，使用原始路径: ${normalizedPath}`);
                resolvedPath = normalizedPath;
            }

            // 移除末尾斜杠
            resolvedPath = resolvedPath.replace(/\/$/, '');

            Logger.debug(`解析后路径: ${resolvedPath}`);

            // 基本安全检查（允许相对路径）
            if (resolvedPath.includes('../..') || resolvedPath.includes('..\\..')) {
                throw new Error('路径包含不安全的父目录引用');
            }

            // 如果配置了允许的路径，进行检查
            if (CONFIG.ALLOWED_PATHS.length > 0) {
                const isAllowed = CONFIG.ALLOWED_PATHS.some(allowedPath => {
                    try {
                        const resolvedAllowed = path.resolve(allowedPath);
                        return resolvedPath.startsWith(resolvedAllowed);
                    } catch {
                        return false;
                    }
                });

                if (!isAllowed) {
                    throw new Error(`路径不在允许列表中: ${resolvedPath}`);
                }
            }

            return resolvedPath;

        } catch (error) {
            Logger.error(`路径验证失败: ${requestedPath}`, error);
            throw error;
        }
    }

    static getFileInfo(filePath) {
        try {
            const ext = path.extname(filePath).toLowerCase();
            const languageMap = {
                '.js': 'javascript',
                '.ts': 'typescript',
                '.py': 'python',
                '.java': 'java',
                '.cpp': 'cpp',
                '.c': 'c',
                '.html': 'html',
                '.css': 'css',
                '.md': 'markdown',
                '.json': 'json',
                '.txt': 'text',
                '.xml': 'xml',
                '.yml': 'yaml',
                '.yaml': 'yaml',
                '.csv': 'csv',
                '.sql': 'sql'
            };

            return {
                extension: ext,
                language: languageMap[ext] || 'text',
                basename: path.basename(filePath),
                filename: filePath
            };
        } catch (error) {
            Logger.error('获取文件信息失败:', error);
            return {
                extension: '',
                language: 'text',
                basename: path.basename(filePath),
                filename: filePath
            };
        }
    }
}

// ==================== 命令处理器 ====================
class CommandProcessor {
    constructor() {
        this.commandHandlers = {
            read_file: this.handleReadFile.bind(this),
            write_file: this.handleWriteFile.bind(this),
            update_section: this.handleUpdateSection.bind(this),
            create_file: this.handleCreateFile.bind(this),
            list_dir: this.handleListDir.bind(this)
        };
    }

    async process(command) {
        const commandId = crypto.randomBytes(4).toString('hex');
        Logger.debug(`[${commandId}] 处理命令: ${command.action}`);

        try {
            if (!command || typeof command !== 'object') {
                throw new Error('无效的命令格式');
            }

            if (!command.action) {
                throw new Error('命令缺少action字段');
            }

            if (!this.commandHandlers[command.action]) {
                throw new Error(`不支持的操作类型: ${command.action}`);
            }

            // 执行处理
            const result = await this.commandHandlers[command.action](command);

            // 添加额外信息
            if (command.action === 'read_file') {
                result._clipboardReady = true;
                result._suggestCopy = true;
            }

            Logger.debug(`[${commandId}] 命令处理成功`);
            return result;

        } catch (error) {
            Logger.error(`[${commandId}] 命令处理失败:`, error.message);

            return {
                success: false,
                error: error.message,
                command: command.action,
                timestamp: new Date().toISOString()
            };
        }
    }

    async handleReadFile(command) {
        Logger.debug('处理读取文件命令:', command);

        if (!command.file_path) {
            throw new Error('缺少file_path字段');
        }

        // 验证路径
        const filePath = FileUtils.validatePath(command.file_path);
        Logger.debug(`验证后的文件路径: ${filePath}`);

        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            throw new Error(`文件不存在: ${filePath}`);
        }

        // 读取文件
        const content = await FileUtils.safeReadFile(filePath);
        const fileInfo = FileUtils.getFileInfo(filePath);

        Logger.debug(`文件读取成功，大小: ${content.length} 字符`);

        return {
            success: true,
            action: 'read_file',
            file_path: filePath,
            content: content,
            file_info: fileInfo,
            size: content.length,
            formatted_size: this.formatFileSize(content.length),
            timestamp: new Date().toISOString()
        };
    }

    async handleWriteFile(command) {
        if (!command.file_path) {
            throw new Error('缺少file_path字段');
        }

        if (command.content === undefined || command.content === null) {
            throw new Error('缺少content字段');
        }

        const filePath = FileUtils.validatePath(command.file_path);
        const result = await FileUtils.safeWriteFile(filePath, command.content);

        return {
            success: true,
            action: 'write_file',
            file_path: filePath,
            message: result.message,
            timestamp: new Date().toISOString()
        };
    }

    async handleUpdateSection(command) {
        if (!command.file_path) {
            throw new Error('缺少file_path字段');
        }

        if (!command.old_content_start || !command.new_content) {
            throw new Error('缺少必要字段: old_content_start 和 new_content');
        }

        const filePath = FileUtils.validatePath(command.file_path);

        if (!fs.existsSync(filePath)) {
            throw new Error(`文件不存在: ${filePath}`);
        }

        const result = await FileUtils.updateFileSection(
            filePath,
            command.old_content_start,
            command.old_content_end || null,
            command.new_content
        );

        return {
            success: true,
            action: 'update_section',
            file_path: filePath,
            message: result.message || '文件片段更新成功',
            timestamp: new Date().toISOString()
        };
    }

    async handleCreateFile(command) {
        if (!command.file_path) {
            throw new Error('缺少file_path字段');
        }

        const filePath = FileUtils.validatePath(command.file_path);

        if (fs.existsSync(filePath)) {
            throw new Error(`文件已存在: ${filePath}`);
        }

        const content = command.content || '';
        const result = await FileUtils.safeWriteFile(filePath, content);

        return {
            success: true,
            action: 'create_file',
            file_path: filePath,
            message: result.message,
            timestamp: new Date().toISOString()
        };
    }

    async handleListDir(command) {
        const dirPath = FileUtils.validatePath(command.dir_path || '.');

        if (!fs.existsSync(dirPath)) {
            throw new Error(`目录不存在: ${dirPath}`);
        }

        const stats = await fsp.stat(dirPath);
        if (!stats.isDirectory()) {
            throw new Error(`路径不是目录: ${dirPath}`);
        }

        const items = await fsp.readdir(dirPath, { withFileTypes: true });
        const files = [];
        const directories = [];

        for (const item of items) {
            const fullPath = path.join(dirPath, item.name);
            const info = {
                name: item.name,
                path: fullPath,
                type: item.isDirectory() ? 'directory' : 'file'
            };

            if (item.isFile()) {
                try {
                    const stats = await fsp.stat(fullPath);
                    info.size = stats.size;
                    info.formatted_size = this.formatFileSize(stats.size);
                    info.modified = stats.mtime;
                    info.extension = path.extname(item.name);
                } catch (error) {
                    info.error = error.message;
                }
                files.push(info);
            } else {
                directories.push(info);
            }
        }

        directories.sort((a, b) => a.name.localeCompare(b.name));
        files.sort((a, b) => a.name.localeCompare(b.name));

        return {
            success: true,
            action: 'list_dir',
            dir_path: dirPath,
            items: [...directories, ...files],
            count: items.length,
            timestamp: new Date().toISOString()
        };
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// ==================== WebSocket 服务器 ====================
class BridgeServer {
    constructor(port = CONFIG.PORT) {
        this.port = port;
        this.wss = null;
        this.clients = new Set();
        this.commandProcessor = new CommandProcessor();
        this.setupLogging();
    }

    setupLogging() {
        try {
            this.logStream = fs.createWriteStream(CONFIG.LOG_FILE, { flags: 'a' });

            const originalLog = console.log;
            const originalError = console.error;

            console.log = (...args) => {
                const message = `[INFO] ${new Date().toISOString()}: ${args.join(' ')}\n`;
                if (this.logStream && this.logStream.writable) {
                    this.logStream.write(message);
                }
                originalLog(...args);
            };

            console.error = (...args) => {
                const message = `[ERROR] ${new Date().toISOString()}: ${args.join(' ')}\n`;
                if (this.logStream && this.logStream.writable) {
                    this.logStream.write(message);
                }
                originalError(...args);
            };

            Logger.log('日志系统已初始化');
        } catch (error) {
            console.error('日志初始化失败:', error);
        }
    }

    start() {
        this.wss = new WebSocket.Server({
            port: this.port,
            host: CONFIG.HOST
        });

        this.wss.on('listening', () => {
            Logger.log(`✅ 桥接服务已启动 (修复版)`);
            Logger.log(`📡 监听地址: ws://${CONFIG.HOST}:${this.port}`);
            Logger.log(`📁 备份目录: ${CONFIG.BACKUP_DIR}`);
            Logger.log(`🔒 最大文件大小: ${CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`);
            Logger.log(`🔍 调试模式: ${CONFIG.DEBUG ? '开启' : '关闭'}`);
            if (CONFIG.ALLOWED_PATHS.length > 0) {
                Logger.log(`🔐 允许的路径: ${CONFIG.ALLOWED_PATHS.join(', ')}`);
            } else {
                Logger.log(`⚠️  警告: 允许访问所有路径（生产环境建议设置ALLOWED_PATHS）`);
            }
            Logger.log('等待DeepSeek插件连接...\n');
        });

        this.wss.on('connection', (ws, req) => {
            const clientId = crypto.randomBytes(4).toString('hex');
            const clientIp = req.socket.remoteAddress;

            Logger.log(`🔗 新客户端连接: ${clientId} (${clientIp})`);

            this.clients.add(ws);

            ws.send(JSON.stringify({
                type: 'system',
                message: '桥接服务已连接 (修复版)',
                client_id: clientId,
                timestamp: new Date().toISOString()
            }));

            ws.on('message', async (data) => {
                const startTime = Date.now();
                let command = null;

                try {
                    command = JSON.parse(data.toString());
                    Logger.log(`📨 收到命令 [${clientId}]: ${command.action} ${command.file_path || ''}`);

                    const response = await this.commandProcessor.process(command);
                    ws.send(JSON.stringify(response));

                    const duration = Date.now() - startTime;
                    Logger.log(`📤 发送响应 [${clientId}]: ${response.success ? '成功' : '失败'} (${duration}ms)`);

                    if (!response.success) {
                        Logger.error(`失败详情 [${clientId}]: ${response.error}`);
                    }

                } catch (error) {
                    Logger.error(`❌ 处理消息失败 [${clientId}]:`, error);

                    ws.send(JSON.stringify({
                        success: false,
                        error: `处理命令时出错: ${error.message}`,
                        command: command?.action || 'unknown',
                        timestamp: new Date().toISOString()
                    }));
                }
            });

            ws.on('close', () => {
                Logger.log(`🔒 客户端断开: ${clientId}`);
                this.clients.delete(ws);
            });

            ws.on('error', (error) => {
                Logger.error(`⚠️ 客户端错误 [${clientId}]:`, error);
                this.clients.delete(ws);
            });
        });

        this.wss.on('error', (error) => {
            Logger.error('❌ 服务器错误:', error);
        });

        // 优雅关闭
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
    }

    shutdown() {
        Logger.log('\n🛑 正在关闭桥接服务...');

        this.clients.forEach(client => {
            try {
                client.close(1001, '服务关闭');
            } catch (e) {
                // 忽略错误
            }
        });

        if (this.wss) {
            this.wss.close(() => {
                Logger.log('✅ 桥接服务已安全关闭');
                if (this.logStream) {
                    this.logStream.end();
                }
                process.exit(0);
            });
        }

        setTimeout(() => {
            Logger.log('⚠️ 强制退出');
            process.exit(1);
        }, 5000);
    }
}

// ==================== 启动服务 ====================
// 检查依赖
try {
    require.resolve('ws');
} catch (error) {
    console.error('❌ 缺少依赖模块，请先安装:');
    console.log('npm install ws');
    process.exit(1);
}

// 启动服务器
const server = new BridgeServer(CONFIG.PORT);

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
    Logger.error('💥 未捕获的异常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    Logger.error('💥 未处理的Promise拒绝:', reason);
});

server.start();