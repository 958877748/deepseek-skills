// ==UserScript==
// @name         DeepSeek Local File Skills (增强版)
// @namespace    http://tampermonkey.net/
// @version      1.4.0
// @description  为DeepSeek网页版添加本地文件操作能力，修复重复识别问题
// @author       蓝色奇夸克
// @match        https://chat.deepseek.com/*
// @icon         https://chat.deepseek.com/favicon.ico
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @connect      localhost
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 配置区域 ====================
    const CONFIG = {
        BRIDGE_WS_URL: 'ws://localhost:8765',
        COMMAND_START_MARKER: '[[COMMAND=',
        COMMAND_END_MARKER: ']]',
        AUTO_SCAN_INTERVAL: 3000, // 增加扫描间隔，减少重复检测
        RECONNECT_DELAY: 3000,
        DEBUG_MODE: true,
        COPY_TO_CLIPBOARD: true,
        MAX_PROCESSED_COMMANDS: 100, // 最多存储100个已处理命令
        COMMAND_EXPIRY_TIME: 10 * 60 * 1000 // 命令过期时间：10分钟
    };

    // ==================== 全局状态 ====================
    let wsConnection = null;
    let isConnected = false;
    let pendingCommand = null;
    let commandQueue = [];
    let bridgeStatus = 'disconnected';
    let processedCommands = new Map(); // 使用Map存储已处理的命令
    let processedCommandHashes = new Set(); // 使用Set存储已处理命令的哈希值
    let isInitialized = false;
    let lastMessageTime = 0;
    let scanningActive = true; // 控制扫描状态
    let currentConversationHash = '';

    // ==================== CSS样式隔离 ====================
    const createIsolatedStyles = () => {
        const style = document.createElement('style');
        style.id = 'deepseek-file-skill-styles';
        style.textContent = `
            /* 只针对我们自己的元素 */
            #file-skill-indicator {
                position: fixed !important;
                bottom: 20px !important;
                right: 20px !important;
                z-index: 2147483647 !important;
                padding: 8px 12px !important;
                border-radius: 16px !important;
                font-size: 12px !important;
                font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
                background: rgba(0, 0, 0, 0.7) !important;
                color: white !important;
                border: 1px solid rgba(255,255,255,0.2) !important;
                user-select: none !important;
                transition: all 0.3s ease !important;
                cursor: pointer !important;
                pointer-events: auto !important;
            }

            #file-skill-status-dot {
                width: 8px !important;
                height: 8px !important;
                border-radius: 50% !important;
                background-color: #ff4444 !important;
                transition: background-color 0.3s ease !important;
            }

            .file-skill-confirmation-modal {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                background-color: rgba(0, 0, 0, 0.7) !important;
                z-index: 2147483647 !important;
                display: flex !important;
                justify-content: center !important;
                align-items: center !important;
            }

            .file-skill-confirmation-content {
                background: white !important;
                border-radius: 12px !important;
                width: 90% !important;
                max-width: 600px !important;
                max-height: 90vh !important;
                overflow: hidden !important;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3) !important;
            }

            .file-skill-notification {
                position: fixed !important;
                top: 20px !important;
                right: 20px !important;
                background: white !important;
                border-left: 4px solid #2196F3 !important;
                border-radius: 8px !important;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
                padding: 16px !important;
                min-width: 300px !important;
                max-width: 400px !important;
                z-index: 2147483646 !important;
                transform: translateX(400px) !important;
                transition: transform 0.3s ease !important;
                font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
            }

            .file-skill-command-highlight {
                background-color: rgba(255, 255, 0, 0.2) !important;
                padding: 2px !important;
                border-radius: 3px !important;
                border: 1px dashed #ffaa00 !important;
                font-family: monospace !important;
                display: inline !important;
            }

            #file-skill-test-button {
                position: fixed !important;
                bottom: 60px !important;
                left: 20px !important;
                z-index: 2147483645 !important;
                padding: 8px 12px !important;
                background: #007bff !important;
                color: white !important;
                border: none !important;
                border-radius: 6px !important;
                cursor: pointer !important;
                font-size: 12px !important;
            }

            .file-skill-copy-btn {
                margin-top: 10px !important;
                padding: 6px 12px !important;
                background: #4CAF50 !important;
                color: white !important;
                border: none !important;
                border-radius: 4px !important;
                cursor: pointer !important;
                font-size: 12px !important;
                display: inline-flex !important;
                align-items: center !important;
                gap: 5px !important;
            }
        `;
        document.head.appendChild(style);
    };

    // ==================== 工具函数 ====================
    const debugLog = (...args) => {
        if (CONFIG.DEBUG_MODE) {
            console.log('[FileSkill]', ...args);
        }
    };

    // 生成命令哈希（用于去重）
    const generateCommandHash = (commandText) => {
        // 移除所有空白字符和换行符，生成标准化哈希
        const normalizedText = commandText.replace(/\s+/g, '').replace(/\n/g, '');

        let hash = 0;
        for (let i = 0; i < normalizedText.length; i++) {
            const char = normalizedText.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }

        // 添加时间戳前缀，确保同一秒内的重复命令也能区分
        const timestamp = Math.floor(Date.now() / 1000);
        return `${timestamp}_${Math.abs(hash).toString(36)}`;
    };

    // 生成命令唯一ID（包含上下文信息）
    const generateCommandId = (command, container, position) => {
        const containerText = container ? safeExtractText(container).substring(0, 50) : '';
        const contextHash = generateCommandHash(`${command.action}_${command.file_path}_${containerText}_${position.start}`);

        return `${contextHash}_${Date.now()}`;
    };

    // 安全文本提取
    const safeExtractText = (element) => {
        if (!element) return '';

        if (element.nodeType === 3) {
            return element.textContent.trim();
        }

        const clone = element.cloneNode(true);
        clone.querySelectorAll('script, style, link, meta, button, input, textarea').forEach(el => el.remove());

        const text = clone.textContent || '';
        return text.replace(/\s+/g, ' ').trim();
    };

    // 复制文本到剪贴板
    const copyToClipboard = async (text) => {
        try {
            if (typeof GM_setClipboard !== 'undefined') {
                GM_setClipboard(text);
                return true;
            }

            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            const success = document.execCommand('copy');
            document.body.removeChild(textarea);
            return success;
        }
    };

    // ==================== WebSocket 连接管理 ====================
    const connectToBridge = () => {
        try {
            debugLog('连接桥接服务...');
            wsConnection = new WebSocket(CONFIG.BRIDGE_WS_URL);

            wsConnection.onopen = () => {
                debugLog('桥接服务已连接');
                isConnected = true;
                bridgeStatus = 'connected';
                updateStatusIndicator();
                showNotification('已连接本地文件服务', '现在可以使用文件操作功能', 'success');
            };

            wsConnection.onmessage = (event) => {
                try {
                    const response = JSON.parse(event.data);
                    handleBridgeResponse(response);
                } catch (e) {
                    debugLog('解析响应失败:', e);
                }
            };

            wsConnection.onerror = (error) => {
                debugLog('WebSocket错误:', error);
                bridgeStatus = 'error';
                updateStatusIndicator();
            };

            wsConnection.onclose = () => {
                debugLog('连接断开，尝试重连...');
                isConnected = false;
                bridgeStatus = 'disconnected';
                updateStatusIndicator();
                setTimeout(connectToBridge, CONFIG.RECONNECT_DELAY);
            };

        } catch (error) {
            debugLog('连接失败:', error);
            bridgeStatus = 'error';
            updateStatusIndicator();
            setTimeout(connectToBridge, CONFIG.RECONNECT_DELAY);
        }
    };

    // ==================== 状态指示器 ====================
    const createStatusIndicator = () => {
        const oldIndicator = document.getElementById('file-skill-indicator');
        if (oldIndicator) oldIndicator.remove();

        const indicator = document.createElement('div');
        indicator.id = 'file-skill-indicator';

        const dot = document.createElement('div');
        dot.id = 'file-skill-status-dot';

        const text = document.createElement('span');
        text.id = 'file-skill-status-text';
        text.textContent = '文件服务: 未连接';

        indicator.appendChild(dot);
        indicator.appendChild(text);
        document.body.appendChild(indicator);

        indicator.addEventListener('click', showConnectionInfo);

        return indicator;
    };

    const updateStatusIndicator = () => {
        const dot = document.getElementById('file-skill-status-dot');
        const text = document.getElementById('file-skill-status-text');

        if (!dot || !text) return;

        const statusConfig = {
            'connected': { color: '#44ff44', text: '文件服务: 已连接' },
            'disconnected': { color: '#ff4444', text: '文件服务: 未连接' },
            'error': { color: '#ffaa44', text: '文件服务: 错误' }
        };

        const config = statusConfig[bridgeStatus] || statusConfig.disconnected;
        dot.style.backgroundColor = config.color;
        text.textContent = config.text;
        text.style.color = config.color;
    };

    const showConnectionInfo = () => {
        const info = `
            <strong>文件服务状态</strong><br>
            连接: ${bridgeStatus}<br>
            地址: ${CONFIG.BRIDGE_WS_URL}<br>
            待处理命令: ${commandQueue.length}<br>
            已处理命令: ${processedCommands.size}<br>
            扫描状态: ${scanningActive ? '活跃' : '暂停'}
        `;
        showNotification('连接信息', info, 'info');
    };

    // ==================== 对话哈希计算（用于检测新对话） ====================
    const calculateConversationHash = () => {
        try {
            // 获取最近的几条消息
            const messageSelectors = [
                '[class*="message"]',
                '[class*="Message"]',
                '[class*="chat"]',
                '.message-container',
                'main'
            ];

            let recentText = '';

            // 获取最近5个可能的消息容器
            for (const selector of messageSelectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    for (let i = Math.max(0, elements.length - 3); i < elements.length; i++) {
                        const text = safeExtractText(elements[i]);
                        if (text.length > 10) {
                            recentText += text.substring(0, 100);
                        }
                    }
                    if (recentText.length > 50) break;
                }
            }

            // 计算哈希
            let hash = 0;
            for (let i = 0; i < recentText.length; i++) {
                const char = recentText.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }

            return hash.toString(36);
        } catch (error) {
            return Date.now().toString(36);
        }
    };

    // ==================== AI响应监听（改进版） ====================
    const startMonitoringAIResponses = () => {
        debugLog('启动AI响应监控');

        // 定期扫描
        const scanInterval = setInterval(() => {
            if (document.visibilityState === 'visible' && scanningActive) {
                performSmartScan();
            }
        }, CONFIG.AUTO_SCAN_INTERVAL);

        // DOM变化监听
        setupDOMObserver();

        // 保存interval以便清理
        window._deepseekScanInterval = scanInterval;

        // 立即扫描一次
        setTimeout(performSmartScan, 1000);
    };

    // 智能扫描（避免重复）
    const performSmartScan = () => {
        try {
            const newConversationHash = calculateConversationHash();

            // 如果对话没有变化，跳过
            if (newConversationHash === currentConversationHash) {
                return;
            }

            currentConversationHash = newConversationHash;
            debugLog('对话内容变化，开始扫描新命令');

            // 扫描新的命令
            scanForNewCommands();

            // 清理过期的命令记录
            cleanupExpiredCommands();

        } catch (error) {
            debugLog('智能扫描时出错:', error);
        }
    };

    // 扫描新命令
    const scanForNewCommands = () => {
        // 查找所有可能包含命令的元素
        const selectors = [
            '[class*="message"]',
            '[class*="Message"]',
            '[class*="chat"]',
            '[class*="ai"]',
            '.ai-message',
            '.user-message',
            'main div',
            'article',
            'section'
        ];

        let foundCommands = 0;

        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);

            for (const element of elements) {
                if (element.__deepseek_processed) {
                    continue; // 跳过已处理的元素
                }

                const commandsFound = processElementForCommands(element);
                if (commandsFound > 0) {
                    foundCommands += commandsFound;
                    element.__deepseek_processed = true; // 标记为已处理
                }

                // 如果已经找到足够多的命令，可以提前退出
                if (foundCommands > 5) break;
            }

            if (foundCommands > 5) break;
        }

        if (foundCommands > 0) {
            debugLog(`找到 ${foundCommands} 个新命令`);
            processNextCommand();
        }
    };

    // 处理单个元素中的命令
    const processElementForCommands = (element) => {
        const text = safeExtractText(element);
        if (!text || !text.includes(CONFIG.COMMAND_START_MARKER)) {
            return 0;
        }

        let foundCommands = 0;
        let startIndex = 0;

        while (true) {
            const commandStart = text.indexOf(CONFIG.COMMAND_START_MARKER, startIndex);
            if (commandStart === -1) break;

            const commandEnd = text.indexOf(CONFIG.COMMAND_END_MARKER, commandStart);
            if (commandEnd === -1) break;

            // 提取完整命令文本
            const fullCommandText = text.substring(
                commandStart,
                commandEnd + CONFIG.COMMAND_END_MARKER.length
            );

            // 提取命令JSON
            const commandStr = text.substring(
                commandStart + CONFIG.COMMAND_START_MARKER.length,
                commandEnd
            );

            try {
                const normalizedStr = commandStr.replace(/\\\\/g, '\\');
                const command = JSON.parse(normalizedStr);

                // 生成命令哈希
                const commandHash = generateCommandHash(fullCommandText);

                // 检查是否已处理过（通过哈希）
                if (processedCommandHashes.has(commandHash)) {
                    debugLog(`命令已处理过 (哈希: ${commandHash})`);
                    startIndex = commandEnd + CONFIG.COMMAND_END_MARKER.length;
                    continue;
                }

                // 生成命令ID（带上下文）
                const commandId = generateCommandId(command, element, { start: commandStart, end: commandEnd });

                debugLog(`发现新命令: ${command.action} (ID: ${commandId}, 哈希: ${commandHash})`);

                // 记录已处理的哈希
                processedCommandHashes.add(commandHash);

                // 保存命令信息
                processedCommands.set(commandId, {
                    command,
                    timestamp: Date.now(),
                    commandHash,
                    status: 'pending',
                    element,
                    position: { start: commandStart, end: commandEnd }
                });

                // 添加到队列
                commandQueue.push({
                    command,
                    element,
                    commandId,
                    commandHash,
                    fullCommandText
                });

                // 添加视觉反馈
                addCommandVisualFeedback(element, commandStart, commandEnd);

                foundCommands++;

            } catch (error) {
                debugLog('命令解析失败:', error.message);
            }

            startIndex = commandEnd + CONFIG.COMMAND_END_MARKER.length;
        }

        return foundCommands;
    };

    // 清理过期的命令记录
    const cleanupExpiredCommands = () => {
        const now = Date.now();
        const expiryTime = CONFIG.COMMAND_EXPIRY_TIME;

        // 清理processedCommands
        for (const [id, info] of processedCommands.entries()) {
            if (now - info.timestamp > expiryTime) {
                processedCommands.delete(id);
                if (info.commandHash) {
                    processedCommandHashes.delete(info.commandHash);
                }
            }
        }

        // 限制Map大小
        if (processedCommands.size > CONFIG.MAX_PROCESSED_COMMANDS) {
            const entries = Array.from(processedCommands.entries());
            entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

            for (let i = 0; i < entries.length - CONFIG.MAX_PROCESSED_COMMANDS; i++) {
                const [id, info] = entries[i];
                processedCommands.delete(id);
                if (info.commandHash) {
                    processedCommandHashes.delete(info.commandHash);
                }
            }
        }

        debugLog(`清理后: ${processedCommands.size} 个命令记录, ${processedCommandHashes.size} 个哈希记录`);
    };

    // 设置DOM观察者（改进版）
    const setupDOMObserver = () => {
        const observer = new MutationObserver((mutations) => {
            let hasNewContent = false;

            for (const mutation of mutations) {
                // 检查新增的节点
                if (mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === 1 && node.querySelector) {
                            const text = safeExtractText(node);
                            if (text.includes(CONFIG.COMMAND_START_MARKER)) {
                                hasNewContent = true;
                                lastMessageTime = Date.now();

                                // 处理新增节点
                                if (!node.__deepseek_processed) {
                                    processElementForCommands(node);
                                    node.__deepseek_processed = true;
                                }
                            }

                            // 检查子节点
                            const childElements = node.querySelectorAll('*');
                            for (const child of childElements) {
                                if (!child.__deepseek_processed) {
                                    const childText = safeExtractText(child);
                                    if (childText.includes(CONFIG.COMMAND_START_MARKER)) {
                                        hasNewContent = true;
                                        lastMessageTime = Date.now();
                                        processElementForCommands(child);
                                        child.__deepseek_processed = true;
                                    }
                                }
                            }
                        }
                    }
                }

                if (hasNewContent) break;
            }

            if (hasNewContent) {
                debugLog('DOM变化检测到新内容');
                setTimeout(performSmartScan, 500);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: false // 关闭字符数据监听，减少误报
        });

        window._deepseekDOMObserver = observer;
        debugLog('DOM观察者已启动');
    };

    // 添加视觉反馈
    const addCommandVisualFeedback = (element, start, end) => {
        if (!element || !element.textContent) return;

        const tooltip = document.createElement('div');
        tooltip.style.cssText = `
            position: absolute !important;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
            color: white !important;
            padding: 8px 12px !important;
            border-radius: 8px !important;
            font-size: 12px !important;
            font-family: -apple-system, sans-serif !important;
            z-index: 2147483646 !important;
            border: none !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2) !important;
            animation: fadeIn 0.3s ease !important;
            pointer-events: none !important;
            white-space: nowrap !important;
            opacity: 0.9 !important;
        `;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-10px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `;
        document.head.appendChild(style);

        tooltip.textContent = '📄 文件命令已检测到';
        tooltip.id = 'command-tooltip-' + Date.now();

        const rect = element.getBoundingClientRect();
        tooltip.style.top = (rect.top + window.scrollY - 40) + 'px';
        tooltip.style.left = (rect.left + window.scrollX) + 'px';

        document.body.appendChild(tooltip);

        setTimeout(() => {
            if (tooltip.parentNode) {
                tooltip.style.opacity = '0';
                tooltip.style.transition = 'opacity 0.5s ease';
                setTimeout(() => {
                    if (tooltip.parentNode) {
                        tooltip.parentNode.removeChild(tooltip);
                    }
                }, 500);
            }
        }, 2000);
    };

    // ==================== 命令队列处理（改进版） ====================
    const processNextCommand = () => {
        if (pendingCommand !== null) {
            debugLog('有命令正在处理中，等待...');
            return;
        }

        if (commandQueue.length === 0) {
            debugLog('命令队列为空');
            return;
        }

        if (!isConnected) {
            showNotification('服务未连接', '请等待连接到本地文件服务', 'warning');
            return;
        }

        pendingCommand = commandQueue.shift();
        const commandInfo = processedCommands.get(pendingCommand.commandId);

        if (!commandInfo || commandInfo.status !== 'pending') {
            debugLog(`命令状态无效或已处理，跳过: ${pendingCommand.commandId}`);
            pendingCommand = null;
            setTimeout(processNextCommand, 100);
            return;
        }

        debugLog(`开始处理命令: ${pendingCommand.command.action} (ID: ${pendingCommand.commandId})`);

        // 更新命令状态为处理中
        commandInfo.status = 'processing';
        processedCommands.set(pendingCommand.commandId, commandInfo);

        showCommandConfirmation(pendingCommand.command);
    };

    // ==================== 用户确认对话框 ====================
    const showCommandConfirmation = (command) => {
        const modal = document.createElement('div');
        modal.className = 'file-skill-confirmation-modal';

        const content = document.createElement('div');
        content.className = 'file-skill-confirmation-content';

        let contentHtml = `
            <div style="padding: 20px; border-bottom: 1px solid #eee;">
                <h3 style="margin: 0; color: #333; display: flex; align-items: center; gap: 10px;">
                    ${getActionIcon(command.action)} ${getActionName(command.action)}
                </h3>
            </div>
            <div style="padding: 20px;">
                <div style="margin-bottom: 15px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <span style="color: #666;">📁 文件路径:</span>
                        <code style="background: #f5f5f5; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${escapeHtml(command.file_path)}</code>
                    </div>
                </div>
        `;

        if (command.action === 'read_file') {
            contentHtml += `
                <div style="background: #e8f4ff; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <span style="color: #0066cc;">ℹ️</span>
                        <span style="color: #0066cc; font-weight: 500;">读取文件操作说明</span>
                    </div>
                    <div style="font-size: 13px; color: #444; line-height: 1.5;">
                        文件内容读取后，将自动复制到剪贴板。您可以按 <kbd style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px; border: 1px solid #ddd;">Ctrl+V</kbd> 粘贴到聊天框。
                    </div>
                </div>
            `;
        } else if (command.action === 'update_section' && command.old_content_start) {
            contentHtml += `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                    <div>
                        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">将被替换的内容:</div>
                        <pre style="background: #ffebee; padding: 10px; border-radius: 5px; font-size: 11px; max-height: 150px; overflow: auto;">${escapeHtml(command.old_content_start.substring(0, 200))}${command.old_content_start.length > 200 ? '...' : ''}</pre>
                    </div>
                    <div>
                        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">新内容:</div>
                        <pre style="background: #e8f5e9; padding: 10px; border-radius: 5px; font-size: 11px; max-height: 150px; overflow: auto;">${escapeHtml(command.new_content.substring(0, 200))}${command.new_content.length > 200 ? '...' : ''}</pre>
                    </div>
                </div>
            `;
        } else if (command.content) {
            contentHtml += `
                <div style="margin-bottom: 15px;">
                    <div style="font-size: 12px; color: #666; margin-bottom: 5px;">内容预览:</div>
                    <pre style="background: #f5f5f5; padding: 10px; border-radius: 5px; font-size: 11px; max-height: 200px; overflow: auto;">${escapeHtml(command.content.substring(0, 300))}${command.content.length > 300 ? '...' : ''}</pre>
                </div>
            `;
        }

        contentHtml += `
                <div style="font-size: 12px; color: #666; padding: 10px; background: #f9f9f9; border-radius: 5px; margin-top: 10px;">
                    <strong>⚠️ 安全提示:</strong> 请确认此操作是您期望的。
                </div>
            </div>
            <div style="padding: 20px; border-top: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                <div style="font-size: 12px; color: #888;">
                    命令ID: ${pendingCommand.commandId.substring(0, 8)}...
                </div>
                <div style="display: flex; gap: 10px;">
                    <button id="file-skill-cancel-btn" style="padding: 10px 20px; border: 1px solid #ddd; background: white; border-radius: 6px; cursor: pointer; font-size: 14px;">取消</button>
                    <button id="file-skill-confirm-btn" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">确认执行</button>
                </div>
            </div>
        `;

        content.innerHTML = contentHtml;
        modal.appendChild(content);
        document.body.appendChild(modal);

        const cancelBtn = content.querySelector('#file-skill-cancel-btn');
        const confirmBtn = content.querySelector('#file-skill-confirm-btn');

        const cleanupModal = () => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
            pendingCommand = null;
            setTimeout(processNextCommand, 100);
        };

        cancelBtn.addEventListener('click', () => {
            // 取消时标记命令为已取消，但不删除记录，防止重复识别
            const commandInfo = processedCommands.get(pendingCommand.commandId);
            if (commandInfo) {
                commandInfo.status = 'cancelled';
                processedCommands.set(pendingCommand.commandId, commandInfo);
                debugLog(`命令已取消: ${pendingCommand.commandId}`);
            }
            cleanupModal();
        });

        confirmBtn.addEventListener('click', () => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
            executeCommand(pendingCommand.command);
        });

        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const commandInfo = processedCommands.get(pendingCommand.commandId);
                if (commandInfo) {
                    commandInfo.status = 'cancelled';
                    processedCommands.set(pendingCommand.commandId, commandInfo);
                }
                cleanupModal();
            }
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                const commandInfo = processedCommands.get(pendingCommand.commandId);
                if (commandInfo) {
                    commandInfo.status = 'cancelled';
                    processedCommands.set(pendingCommand.commandId, commandInfo);
                }
                cleanupModal();
            }
        });

        setTimeout(() => confirmBtn.focus(), 100);
    };

    // ==================== 命令执行 ====================
    const executeCommand = async (command) => {
        if (!isConnected || !wsConnection) {
            showNotification('服务未就绪', '无法连接到本地文件服务', 'error');
            pendingCommand = null;
            return;
        }

        debugLog('发送命令到桥接服务:', command.action);

        if (command.action === 'read_file' && CONFIG.COPY_TO_CLIPBOARD) {
            command._requestClipboardCopy = true;
        }

        wsConnection.send(JSON.stringify(command));
    };

    const handleBridgeResponse = async (response) => {
        debugLog('收到桥接响应:', response.success);

        // 更新命令状态
        if (pendingCommand) {
            const commandInfo = processedCommands.get(pendingCommand.commandId);
            if (commandInfo) {
                commandInfo.status = response.success ? 'executed' : 'failed';
                commandInfo.executedAt = Date.now();
                commandInfo.response = response;
                processedCommands.set(pendingCommand.commandId, commandInfo);
            }
        }

        if (response.success) {
            showNotification('操作成功', response.message || '文件操作已完成', 'success');

            if (pendingCommand && pendingCommand.command.action === 'read_file' && response.content) {
                await handleFileReadResponse(response);
            }
        } else {
            showNotification('操作失败', response.error || '未知错误', 'error');
        }

        pendingCommand = null;
        setTimeout(processNextCommand, 500);
    };

    // ==================== 辅助函数 ====================
    const getActionIcon = (action) => {
        const icons = {
            'read_file': '📖',
            'write_file': '💾',
            'update_section': '🔧',
            'create_file': '📄',
            'list_dir': '📁'
        };
        return icons[action] || '📝';
    };

    const getActionName = (action) => {
        const names = {
            'read_file': '读取文件',
            'write_file': '写入文件',
            'update_section': '更新片段',
            'create_file': '创建文件',
            'list_dir': '列出目录'
        };
        return names[action] || '文件操作';
    };

    const escapeHtml = (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    const showNotification = (title, message, type = 'info') => {
        const notification = document.createElement('div');
        notification.className = 'file-skill-notification';

        const colors = {
            success: '#4CAF50',
            error: '#F44336',
            warning: '#FF9800',
            info: '#2196F3'
        };

        notification.style.borderLeftColor = colors[type] || colors.info;

        notification.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 8px; color: #333;">${title}</div>
            <div style="font-size: 13px; color: #666; line-height: 1.4;">${message}</div>
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 10);

        setTimeout(() => {
            notification.style.transform = 'translateX(400px)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, type === 'error' ? 5000 : 3000);
    };

    // 处理读取文件的响应
    const handleFileReadResponse = async (response) => {
        const { content, file_path, file_info } = response;

        if (CONFIG.COPY_TO_CLIPBOARD) {
            let contentToCopy = content;

            if (content.length > 10000) {
                contentToCopy = content.substring(0, 10000) + '\n\n...(文件过大，只显示部分内容)';
                showNotification('文件较大', '文件内容超过10000字符，只复制了部分内容', 'warning');
            }

            const formattedContent = `文件: ${file_path}\n${file_info ? `类型: ${file_info.language}\n` : ''}\`\`\`${file_info?.language || 'text'}\n${contentToCopy}\n\`\`\``;

            const success = await copyToClipboard(formattedContent);

            if (success) {
                showNotification(
                    '内容已复制到剪贴板',
                    `文件 ${file_path} 的内容已复制到剪贴板，您可以按 Ctrl+V 粘贴到聊天框。`,
                    'success'
                );
                showPasteSuggestion(file_path, formattedContent);
            } else {
                showNotification('复制失败', '无法复制到剪贴板，请手动复制', 'error');
                showManualCopyOption(contentToCopy, file_path);
            }
        }
    };

    // 显示粘贴建议
    const showPasteSuggestion = (filePath, content) => {
        const suggestion = document.createElement('div');
        suggestion.style.cssText = `
            position: fixed !important;
            bottom: 80px !important;
            right: 20px !important;
            background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%) !important;
            color: white !important;
            padding: 12px 16px !important;
            border-radius: 8px !important;
            font-size: 13px !important;
            font-family: -apple-system, sans-serif !important;
            z-index: 2147483645 !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2) !important;
            animation: slideIn 0.3s ease !important;
            max-width: 300px !important;
        `;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateY(20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);

        suggestion.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 8px;">📋 内容已准备就绪</div>
            <div style="margin-bottom: 10px; font-size: 12px; opacity: 0.9;">
                文件内容已复制到剪贴板
            </div>
            <div style="display: flex; gap: 8px;">
                <button onclick="document.querySelector('textarea, [contenteditable]')?.focus(); navigator.clipboard.readText().then(text => { const input = document.querySelector('textarea, [contenteditable]'); if (input.tagName === 'TEXTAREA') input.value += text; else if (input.isContentEditable) input.textContent += text; }); this.parentNode.parentNode.remove();"
                        style="padding: 6px 12px; background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; cursor: pointer; font-size: 12px; flex: 1;">
                    📝 一键粘贴
                </button>
                <button onclick="this.parentNode.parentNode.remove();"
                        style="padding: 6px 12px; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; cursor: pointer; font-size: 12px;">
                    ✕
                </button>
            </div>
        `;

        suggestion.id = 'paste-suggestion-' + Date.now();
        document.body.appendChild(suggestion);

        setTimeout(() => {
            if (suggestion.parentNode) {
                suggestion.style.opacity = '0';
                suggestion.style.transition = 'opacity 0.5s ease';
                setTimeout(() => {
                    if (suggestion.parentNode) {
                        suggestion.parentNode.removeChild(suggestion);
                    }
                }, 500);
            }
        }, 10000);
    };

    // 手动复制选项
    const showManualCopyOption = (content, filePath) => {
        const modal = document.createElement('div');
        modal.className = 'file-skill-confirmation-modal';

        modal.innerHTML = `
            <div class="file-skill-confirmation-content">
                <div style="padding: 20px; border-bottom: 1px solid #eee;">
                    <h3 style="margin: 0; color: #333;">📋 手动复制文件内容</h3>
                </div>
                <div style="padding: 20px;">
                    <div style="margin-bottom: 15px; font-size: 14px; color: #444;">
                        由于浏览器限制，无法自动复制。请手动选择并复制以下内容：
                    </div>
                    <div style="margin-bottom: 15px;">
                        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">文件路径: ${filePath}</div>
                        <textarea id="manual-copy-textarea"
                                  style="width: 100%; height: 200px; padding: 12px; border: 1px solid #ddd; border-radius: 6px; font-family: monospace; font-size: 12px; resize: vertical;">${escapeHtml(content)}</textarea>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <button onclick="document.getElementById('manual-copy-textarea').select(); document.execCommand('copy'); alert('已复制到剪贴板');"
                                style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            📋 选择并复制
                        </button>
                        <button onclick="this.parentNode.parentNode.parentNode.remove();"
                                style="padding: 8px 16px; background: #f5f5f5; color: #666; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;">
                            关闭
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        setTimeout(() => {
            const textarea = modal.querySelector('#manual-copy-textarea');
            if (textarea) {
                textarea.select();
            }
        }, 100);
    };

    // ==================== 初始化 ====================
    const initialize = () => {
        if (isInitialized) {
            debugLog('已经初始化，跳过');
            return;
        }

        debugLog('初始化DeepSeek文件技能插件 (增强版 v1.4.0)');

        createIsolatedStyles();
        createStatusIndicator();

        setTimeout(connectToBridge, 500);
        setTimeout(startMonitoringAIResponses, 1000);

        if (CONFIG.DEBUG_MODE) {
            addTestButton();
        }

        isInitialized = true;
        debugLog('初始化完成');
    };

    const addTestButton = () => {
        const testBtn = document.createElement('button');
        testBtn.id = 'file-skill-test-button';
        testBtn.textContent = '🔧 测试文件技能';

        testBtn.addEventListener('click', () => {
            const testCommands = [
                {
                    command: { action: 'read_file', file_path: 'D:\\test\\file1.txt' },
                    text: '[[COMMAND={"action":"read_file","file_path":"D:\\\\test\\\\file1.txt"}]]'
                },
                {
                    command: { action: 'read_file', file_path: 'D:\\test\\file2.txt' },
                    text: '[[COMMAND={"action":"read_file","file_path":"D:\\\\test\\\\file2.txt"}]]'
                }
            ];

            testCommands.forEach((test, index) => {
                setTimeout(() => {
                    const testDiv = document.createElement('div');
                    testDiv.className = 'test-message';
                    testDiv.textContent = `测试消息 ${index + 1}: ${test.text}`;
                    testDiv.style.cssText = `
                        background: #f0f8ff;
                        padding: 10px;
                        margin: 5px;
                        border-radius: 5px;
                        border-left: 4px solid #007bff;
                        font-family: monospace;
                        font-size: 12px;
                    `;
                    document.body.appendChild(testDiv);

                    lastMessageTime = Date.now();
                    scanForNewCommands();
                }, index * 1000);
            });

            showNotification('测试', '已注入多个测试命令', 'info');
        });

        document.body.appendChild(testBtn);
    };

    // ==================== 清理函数 ====================
    const cleanup = () => {
        if (window._deepseekScanInterval) {
            clearInterval(window._deepseekScanInterval);
        }

        if (window._deepseekDOMObserver) {
            window._deepseekDOMObserver.disconnect();
        }

        const selectors = [
            '#file-skill-indicator',
            '.file-skill-confirmation-modal',
            '.file-skill-notification',
            '#file-skill-test-button',
            '[id^="command-tooltip-"]',
            '[id^="paste-suggestion-"]',
            '.test-message'
        ];

        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                if (el.parentNode) {
                    el.parentNode.removeChild(el);
                }
            });
        });

        const style = document.getElementById('deepseek-file-skill-styles');
        if (style && style.parentNode) {
            style.parentNode.removeChild(style);
        }

        isInitialized = false;
        debugLog('清理完成');
    };

    // ==================== 启动 ====================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        setTimeout(initialize, 1000);
    }

    window.addEventListener('unload', cleanup);

    // 导出函数供测试使用
    window.deepseekFileSkill = {
        rescan: performSmartScan,
        getStatus: () => ({
            isConnected,
            queueLength: commandQueue.length,
            processedCount: processedCommands.size,
            hashCount: processedCommandHashes.size,
            pendingCommand: pendingCommand?.command?.action,
            scanningActive
        }),
        clearCache: () => {
            processedCommands.clear();
            processedCommandHashes.clear();
            commandQueue = [];
            scanningActive = true;
            debugLog('缓存已清除，重新开始扫描');
        },
        toggleScanning: () => {
            scanningActive = !scanningActive;
            showNotification('扫描状态', scanningActive ? '扫描已启用' : '扫描已暂停', 'info');
            return scanningActive;
        }
    };
})();