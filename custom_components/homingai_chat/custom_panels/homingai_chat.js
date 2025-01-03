/**
 * Icons Copyright Notice:
 * <a target="_blank" href="https://icons8.com/icon/BDM6BQpQH1dl/microphone">Microphone</a> icon by <a target="_blank" href="https://icons8.com">Icons8</a>
 */

class HomingAIChat extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({mode: 'open'});
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.recordingTimer = null;
        this.recordingDuration = 0;
        this.permissionIframe = null;

        const scriptPath = new URL(import.meta.url).pathname;
        this.basePath = scriptPath.substring(0, scriptPath.lastIndexOf('/'));

        // 添加音频控制相关属性
        this.currentAudio = null;
        this.isPlaying = false;

        // 添加用户名属性
        this.currentUser = null;
        this._hass = null;

        // 添加 WebSocket 相关属性
        this.ws = null;
        this.wsReconnectTimer = null;
        this.wsReconnectAttempts = 0;
        this.maxReconnectAttempts = 5;

        // 修改缓存相关属性，移除过期相关的属性
        this.tokenCache = null;
        this.TOKEN_CACHE_KEY = 'homingai_token_cache';

        // 修改分页相关属性
        this.currentPage = 1;
        this.pageSize = 20;
        this.isLoading = false;
        this.hasMore = true;  // 添加是否有更多数据的标志
        this.loadingThreshold = 100;  // 滚动触发阈值

        // Add new WebSocket-related properties
        this.lastMessageTime = Date.now();

        // 初始化音频上下文
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('AudioContext initialized in constructor');
        } catch (e) {
            console.warn('Failed to initialize AudioContext:', e);
        }

        this.isIntentionalClose = false; // 添加标记，用于区分主动关闭和异常关闭
    }

    // 设置 Home Assistant 实例
    set hass(hass) {
        this._hass = hass;
        if (hass && hass.user) {
            this.currentUser = hass.user.name;
        }
    }

    async getTokenFromCache() {
        try {
            // 直接从 localStorage 获取缓存的 token
            const cachedToken = localStorage.getItem(this.TOKEN_CACHE_KEY);

            if (cachedToken) {
                console.log('Using cached token');
                return cachedToken;
            }
        } catch (error) {
            console.error('Error reading token from cache:', error);
        }
        return null;
    }

    async saveTokenToCache(token) {
        try {
            // 直接保存 token，不设置过期时间
            localStorage.setItem(this.TOKEN_CACHE_KEY, token);
            console.log('Token saved to cache');
        } catch (error) {
            console.error('Error saving token to cache:', error);
        }
    }

    async connectedCallback() {
        // 先渲染基础UI
        this.render();
        
        // 添加重试机制
        let retryCount = 0;
        const maxRetries = 3;
        
        const getToken = async () => {
            try {
                // 首先尝试从缓存获取 token
                let token = await this.getTokenFromCache();
                
                if (!token) {
                    // 如果缓存中没有，则从文件获取
                    const response = await fetch(`${this.basePath}/access_token.txt`, {
                        headers: {
                            'Cache-Control': 'no-cache',
                            'Pragma': 'no-cache'
                        }
                    });
                    
                    if (response.ok) {
                        token = await response.text();
                        // 保存到缓存
                        await this.saveTokenToCache(token);
                    } else {
                        throw new Error(`Failed to load token file: ${response.status}`);
                    }
                }
                
                // 确保 token 有效
                if (token) {
                    this.access_token = token.trim();  // 移除可能的空白字符
                    this.initializeEventListeners();
                    await this.loadHistoryMessages(true);
                    
                    // 只有在成功获取 token 后才初始化 WebSocket
                    this.initWebSocket();
                } else {
                    throw new Error('Invalid token');
                }
                
            } catch (error) {
                console.error('Token retrieval failed:', error);
                if (retryCount < maxRetries) {
                    retryCount++;
                    console.log(`Retrying token retrieval (${retryCount}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                    await getToken();
                } else {
                    console.error('Max retry attempts reached');
                    this.addMessage('无法获取授权信息，请检查配置或重新授权', 'bot');
                }
            }
        };

        await getToken();

        // 延迟初始化 AudioContext，等待用户交互
        const initAudioContext = () => {
            if (!this.audioContext && window.AudioContext) {
                try {
                    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                } catch (e) {
                    console.warn('Failed to initialize AudioContext:', e);
                }
            }
        };

        // 添加用户交互事件监听器
        const userInteractionEvents = ['click', 'touchstart', 'keydown'];
        const handleUserInteraction = () => {
            initAudioContext();
            // 如果 AudioContext 被挂起，则恢复它
            if (this.audioContext?.state === 'suspended') {
                this.audioContext.resume();
            }
            // 移除事件监听器，因为我们只需要初始化一次
            userInteractionEvents.forEach(event => {
                document.removeEventListener(event, handleUserInteraction);
            });
        };

        // 添加事件监听器
        userInteractionEvents.forEach(event => {
            document.addEventListener(event, handleUserInteraction, { once: true });
        });

        // 检查并请求权限
        try {
            const isHassWebView = window.webkit?.messageHandlers?.getExternalAuth || 
                                 window.Android?.getExternalAuth ||
                                 document.querySelector('home-assistant');

            if (isHassWebView) {
                // 在 WebView 中初始化权限
                if (window.webkit?.messageHandlers?.requestMediaPermission) {
                    await window.webkit.messageHandlers.requestMediaPermission.postMessage({});
                } else if (window.Android?.requestMediaPermission) {
                    await window.Android.requestMediaPermission();
                }
            }

            // 检查权限状态
            if (navigator.permissions) {
                const result = await navigator.permissions.query({ name: 'microphone' });
                console.log('Initial microphone permission state:', result.state);
                
                // 监听权限变化
                result.onchange = () => {
                    console.log('Microphone permission changed to:', result.state);
                };
            }
        } catch (error) {
            console.warn('Permission initialization failed:', error);
        }

        if (this.access_token) {
            this.initializeEventListeners();
            this.initWebSocket();
            // 组件首次加载时加载历史消息
            this.loadHistoryMessages(true).catch(error => {
                console.error('Failed to load initial messages:', error);
            });
        }
    }

    // 初始化带 token 的功能
    initializeWithToken(token) {
        if (token && this.isConnected) {
            this.initializeEventListeners();
            this.initWebSocket(token);
        }
    }

    // 添加历史消息加载方法
    async loadHistoryMessages(isInitial = false) {
        if (this.isLoading || (!this.hasMore && !isInitial)) return;

        try {
            this.isLoading = true;
            const messagesContainer = this.shadowRoot.getElementById('messages');
            const oldScrollHeight = messagesContainer.scrollHeight;

            const response = await fetch('https://api.homingai.com/ha/home/message', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    page_no: isInitial ? 1 : this.currentPage,
                    page_size: this.pageSize
                })
            });

            if (!response.ok) {
                throw new Error(`获取历史消息失败: ${response.status}`);
            }

            const result = await response.json();

            if (result.code === 200) {
                if (isInitial) {
                    messagesContainer.innerHTML = '';
                    this.currentPage = 1;
                    this.hasMore = true;
                }

                const messages = result.data.data;
                
                if (!messages || messages.length === 0) {
                    this.hasMore = false;
                    if (!isInitial) {
                        this.showNoMoreMessage();
                    }
                    return;
                }

                // 渲染消息
                const fragment = document.createDocumentFragment();
                messages.reverse().forEach(msg => {
                    const messageElement = this.createMessageElement({
                        type: msg.message_type === 1 ? 'user' : 'bot',
                        content: msg.content,
                        timestamp: new Date(msg.created_at).toLocaleTimeString('zh-CN', {
                            hour: '2-digit',
                            minute: '2-digit'
                        }),
                        showUserName: msg.message_type === 1,
                        userName: msg.user_name
                    });
                    fragment.appendChild(messageElement);
                });

                if (isInitial) {
                    messagesContainer.appendChild(fragment);
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                } else {
                    messagesContainer.insertBefore(fragment, messagesContainer.firstChild);
                    // 保持滚动位置
                    messagesContainer.scrollTop = messagesContainer.scrollHeight - oldScrollHeight;
                }

                this.currentPage++;
                
                // 检查是否还有更多数据
                this.hasMore = messages.length >= this.pageSize;
            }
        } catch (error) {
            console.error('加载历史消息失败:', error);
            this.showErrorMessage();
        } finally {
            this.isLoading = false;
        }
    }

    // 修改 WebSocket 初始化方法
    initWebSocket() {
        // 如果已经有活跃的连接，先检查它的状态
        if (this.ws) {
            // 如果连接正常，直接返回
            if (this.ws.readyState === WebSocket.OPEN) {
                console.log('WebSocket connection is already active');
                return;
            }
            // 如果连接正在建立中，等待它完成
            if (this.ws.readyState === WebSocket.CONNECTING) {
                console.log('WebSocket connection is already in progress');
                return;
            }
            // 如果连接已关闭或正在关闭，清理它
            console.log('Cleaning up existing WebSocket connection');
            this.ws.close();
            this.ws = null;
        }

        try {
            if (!this.access_token) {
                console.error('WebSocket initialization failed: access_token is not available');
                return;
            }

            const wsUrl = new URL('wss://api.homingai.com/ws');
            wsUrl.searchParams.append('token', this.access_token.trim());
            wsUrl.searchParams.append('user_name', this.currentUser || 'Unknown User');
            
            console.log('Initializing new WebSocket connection...');
            
            this.ws = new WebSocket(wsUrl.toString());
            
            // 连接超时处理
            const connectionTimeout = setTimeout(() => {
                if (this.ws) {
                    if (this.ws.readyState === WebSocket.CONNECTING) {
                        console.error('WebSocket connection timeout');
                        this.ws.close();
                        this.handleWebSocketReconnect();
                    }
                }
            }, 10000);

            this.ws.onopen = async () => {
                console.log('WebSocket connected successfully');
                clearTimeout(connectionTimeout);
                this.wsReconnectAttempts = 0;
                
                // 连接成功后加载历史消息
                await this.loadHistoryMessages(true);
            };

            this.ws.onclose = (event) => {
                clearTimeout(connectionTimeout);
                // 检查关闭代码，1006 表示异常关闭
                if (event.code === 1006) {
                    console.log(`WebSocket disconnected abnormally: ${event.code} - ${event.reason}`);
                    // 只有在不是主动关闭的情况下才重连
                    if (!this.isIntentionalClose) {
                        this.handleWebSocketReconnect();
                    }
                } else {
                    console.log(`WebSocket closed with code: ${event.code} - ${event.reason}`);
                }
            };

            this.ws.onmessage = (event) => {
                try {
                    // 如果收到 ping 消息，回复 pong
                    if (event.data === 'ping') {
                        console.debug('Received ping, sending pong');
                        try {
                            this.ws.send('pong');
                        } catch (error) {
                            console.error('Failed to send pong:', error);
                        }
                        return;
                    }

                    // 处理业务消息
                    const messages = event.data.split('\n');
                    for (const message of messages) {
                        if (!message.trim()) continue;
                        
                        try {
                            const data = JSON.parse(message);
                            this.handleWebSocketMessage(data);
                        } catch (parseError) {
                            console.error('Failed to parse message:', {
                                error: parseError,
                                messagePreview: message.substring(0, 100)
                            });
                        }
                    }
                } catch (error) {
                    console.error('WebSocket message handling error:', error);
                }
            };

            this.ws.onerror = (error) => {
                clearTimeout(connectionTimeout);
                console.error('WebSocket error:', error);
                // 只在连接未关闭时处理重连
                if (this.ws && this.ws.readyState !== WebSocket.CLOSING && this.ws.readyState !== WebSocket.CLOSED) {
                    this.handleWebSocketReconnect();
                }
            };

        } catch (error) {
            console.error('Failed to initialize WebSocket:', error);
            this.handleWebSocketReconnect();
        }
    }

    // 设置面板配置
    set panelConfig(config) {
        console.log('Panel config received:', config); // 调试日志
        if (config && config._panel_custom && config._panel_custom.config) {
            const token = config._panel_custom.config.homingai_token;
            console.log('Token found:', !!token); // 调试日志
            if (token) {
                this.access_token = token;
                if (this.isConnected) {
                    this.initializeEventListeners();
                    this.initWebSocket();
                }
            }
        }
    }

    // 添加 panel config 设置器
    set panel_config(config) {
        this._panel_config = config;
        // 当配置更新时立即初始化
        if (config && config.homingai_token) {
            this.access_token = config.homingai_token;
            this.initializeEventListeners();
            this.initWebSocket();
        }
    }

    render() {
        const micClosePath = `${this.basePath}/mic_close.jpeg`;  //https://www.pinterest.com/pin/474355773267408002/
        // const micWorkingPath = `${this.basePath}/mic_woking.png`;

        this.shadowRoot.innerHTML = `
            <style>
                /* ============= 基础样式 ============= */
                :host {
                    display: block;
                    width: 100%;
                    height: 100vh;
                    overflow: hidden;
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                }

                /* 聊天容器基础样式 */
                .chat-container {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: #fff;
                    overflow: hidden;
                }

                .chat-messages {
                    position: relative;
                    height: 85vh;
                    overflow-y: auto;
                    -webkit-overflow-scrolling: touch;
                    padding: 20px;
                    background: #fafafa;
                }

                /* 消息样式 */
                .message {
                    display: flex;
                    flex-direction: column;
                    margin-bottom: 16px;
                    max-width: 80%;
                    animation: messageAppear 0.3s ease-out;
                }

                .user-message {
                    margin-left: auto;
                    align-items: flex-end;
                }

                .bot-message {
                    margin-right: auto;
                    align-items: flex-start;
                }

                .message-content {
                    padding: 12px 16px;
                    border-radius: 16px;
                    font-size: 15px;
                    line-height: 1.4;
                    position: relative;
                    word-wrap: break-word;
                    max-width: 100%;
                }

                .user-message .message-content {
                    background: #8A2BE2;
                    color: white;
                    border-bottom-right-radius: 4px;
                    box-shadow: 0 2px 4px rgba(138, 43, 226, 0.2);
                }

                .bot-message .message-content {
                    background: #f0f0f0;
                    color: #333;
                    border-bottom-left-radius: 4px;
                    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
                }

                .message-time {
                    font-size: 11px;
                    color: #999;
                    margin-top: 4px;
                    padding: 0 4px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }

                /* 输入区域基础样式 */
                .input-container {
                    position: fixed;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    width: 100%;
                    height: 10%;
                    min-height: 70px;
                    max-height: 120px;
                    background: #fff;
                    border-top: 1px solid rgba(0, 0, 0, 0.08);
                    padding: 12px 16px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    z-index: 100;
                    box-sizing: border-box;
                    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.08);
                }

                .input-wrapper {
                    flex: 1;
                    height: 40px;
                    position: relative;
                    background: transparent;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    border: none;
                }

                .input-wrapper:focus-within {
                    background: transparent;
                    box-shadow: none;
                }

                #messageInput {
                    flex: 1;
                    padding: 5px 8px;
                    border: 1px solid #e0e0e0;
                    border-radius: 8px;
                    font-size: 15px;
                    line-height: 1.5;
                    color: #333;
                    background: transparent;
                    transition: all 0.3s ease;
                    box-sizing: border-box;
                    outline: none;
                    -webkit-appearance: none;
                }

                /* 按钮基础样式 */
                .action-button {
                    width: 40px;
                    height: 40px;
                    min-width: 40px;
                    border-radius: 8px;
                    padding: 0;
                    border: 1px solid #e0e0e0;
                    transition: all 0.3s ease;
                    flex-shrink: 0;
                    cursor: pointer;
                    position: relative;
                    overflow: hidden;  /* 确保图片不会溢出按钮边界 */
                }

                /* 修改麦克风按钮样式 */
                .mic-button {
                    background: none;
                }

                .mic-button::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background-image: url('${micClosePath}');
                    background-size: cover;
                    background-position: center;
                    background-repeat: no-repeat;
                    transition: opacity 0.3s ease;
                }

                /* 录音状态下的麦克风按钮样式 */
                .mic-button.recording::before {
                    opacity: 0.5;
                }

                /* 移动端样式适配 */
                @media (max-width: 767px) {
                    .action-button {
                        width: 36px;  /* 稍微调小一点适应移动端 */
                        height: 36px;
                        min-width: 36px;
                    }
                }

                /* Web端样式适配 */
                @media (min-width: 768px) {
                    .action-button {
                        width: 44px;  /* 在Web端稍微放大一点 */
                        height: 44px;
                        min-width: 44px;
                    }
                }

                /* 动画效果 */
                @keyframes messageAppear {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                /* ============= Web端样式（>= 768px）============= */
                @media (min-width: 768px) {
                    :host {
                        padding: 20px;
                        background: #f5f5f5;
                        height: 100vh;
                        box-sizing: border-box;
                    }

                    .chat-wrapper {
                        position: relative;
                        width: 100%;
                        max-width: 900px;
                        height: calc(100vh - 40px);
                        margin: 0 auto;
                        background: #fff;
                        border-radius: 16px;
                        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
                        overflow: hidden;
                    }

                    .chat-container {
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        /* 聊天容器占90% */
                        bottom: 0;
                        border-radius: 16px 16px 0 0;
                        overflow: hidden;
                        background: transparent;
                    }

                    .chat-messages {
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        padding: 20px;
                        overflow-y: auto;
                        background: #fafafa;
                        margin-bottom: 0;
                    }

                    .input-container {
                        position: absolute;
                        bottom: 0;
                        left: 0;
                        right: 0;
                        width: 100%;
                        max-width: 900px;
                        /* 输入框容器占10% */
                        height: 10%;
                        margin: 0 auto;
                        padding: 12px 16px;
                        border-radius: 0 0 16px 16px;
                        background: #fff;
                        box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.06);
                        display: flex;
                        align-items: center;
                        box-sizing: border-box;
                        z-index: 10;
                    }

                    .input-wrapper {
                        flex: 1;
                        height: 56px;
                        margin: 0 8px;
                        background: #f8f9fa;
                        border-radius: 12px;
                        display: flex;
                        align-items: center;
                    }

                    #messageInput {
                        height: 100%;
                        border-radius: 12px;
                        font-size: 16px;
                    }

                    .action-button {
                        width: 56px;
                        height: 56px;
                        min-width: 56px;
                        border-radius: 12px;
                    }


                    /* 确保消息容器内容正确显示 */
                    .message {
                        margin-bottom: 16px;
                    }

                    .message:last-child {
                        margin-bottom: 0;
                    }
                }

                /* ============= 移动端样式（< 768px）============= */
                @media (max-width: 767px) {
                    :host {
                        position: fixed;
                        height: 100%;
                        overflow: hidden;
                        background: #fff;
                    }

                    .chat-wrapper {
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        overflow: hidden;
                        background: #fff;
                        -webkit-transform: translateZ(0);
                    }

                    .chat-container {
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        overflow: hidden;
                    }

                    .chat-messages {
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        padding: 10px;
                        transform: translateZ(0);
                        overflow-y: auto;
                        -webkit-overflow-scrolling: touch;
                        background: #fafafa;
                    }

                    .input-container {
                        position: fixed !important;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        width: 100%;
                        /* 输入框容器占10% */
                        height: 10%;
                        background: #fff;
                        border-top: 1px solid rgba(0, 0, 0, 0.08);
                        padding: 10px 15px;
                        display: flex;
                        align-items: center;
                        z-index: 1000;
                        box-sizing: border-box;
                        transform: translateZ(0);
                        -webkit-transform: translateZ(0);
                        will-change: transform;
                        touch-action: none;
                        box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.06);
                    }

                    .input-wrapper {
                        flex: 1;
                        height: 40px;
                        margin: 0 8px;
                        position: relative;
                        background: transparent;
                        border-radius: 8px;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }

                    #messageInput {
                        height: 100%;
                        padding: 5px 8px;
                        border-radius: 8px;
                        font-size: 15px;
                        line-height: 40px;
                    }

                    .action-button {
                        width: 40px;
                        height: 40px;
                        min-width: 40px;
                        border-radius: 8px;
                    }

                    /* iOS 设备底部安全区域适配 */
                    @supports (-webkit-touch-callout: none) {
                        .input-container {
                            height: calc(10% + env(safe-area-inset-bottom));
                            padding-bottom: calc(10px + env(safe-area-inset-bottom));
                        }
                    }
                }

                /* ============= 功能性样式 ============= */
                /* 录音相关样式 */
                .voice-wave-container {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    width: 100vw;
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    pointer-events: none;
                    opacity: 0;
                    transition: opacity 0.3s ease;
                    z-index: 10000;  /* 确保在遮罩层之上 */
                }

                .recording .voice-wave-container {
                    opacity: 1;
                }

                /* 修改波形样式 */
                .voice-wave-large {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    transform: scale(1);
                }

                .voice-wave-bar-large {
                    width: 12px;
                    height: 80px;
                    background: #fff;
                    border-radius: 6px;
                    animation: voice-wave-animation 1.2s ease-in-out infinite;
                    opacity: 0.9;
                }

                /* 波形动画 */
                @keyframes voice-wave-animation {
                    0%, 100% { 
                        transform: scaleY(0.3);
                    }
                    50% { 
                        transform: scaleY(1);
                    }
                }

                /* 大波形条的延迟动画 */
                .voice-wave-bar-large:nth-child(1) { animation-delay: -1.2s; }
                .voice-wave-bar-large:nth-child(2) { animation-delay: -1.0s; }
                .voice-wave-bar-large:nth-child(3) { animation-delay: -0.8s; }
                .voice-wave-bar-large:nth-child(4) { animation-delay: -0.6s; }
                .voice-wave-bar-large:nth-child(5) { animation-delay: -0.4s; }
                .voice-wave-bar-large:nth-child(6) { animation-delay: -0.2s; }
                .voice-wave-bar-large:nth-child(7) { animation-delay: 0s; }

                /* 修改录音状态文字样式 */
                .recording-status {
                    color: #fff;
                    font-size: 24px;
                    margin-top: 30px;
                    font-weight: 500;
                    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                }

                /* 添加遮罩层样式 */
                .recording-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    width: 100vw;
                    height: 100vh;
                    background: rgba(0, 0, 0, 0.75);
                    opacity: 0;
                    pointer-events: none;
                    transition: opacity 0.3s ease;
                    z-index: 9999;
                }

                .recording .recording-overlay {
                    opacity: 1;
                }

                /* 修改发送按钮样式 */
                .send-button {
                    background-color: #8A2BE2;
                    border: none;
                    display: none;  /* 默认隐藏 */
                }

                .send-button::after {
                    content: '→';
                    color: white;
                    font-size: 18px;
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                }

                /* 当输入框有内容时显示发送按钮 */
                .input-container.show-send .mic-button {
                    display: none;  /* 隐藏麦克风按钮 */
                }

                .input-container.show-send .send-button {
                    display: flex;  /* 显示发送按钮 */
                    align-items: center;
                    justify-content: center;
                }

                /* 移动端适配 */
                @media (max-width: 767px) {
                    .voice-wave-large {
                        transform: scale(0.8);
                    }

                    .voice-wave-bar-large {
                        width: 10px;
                        height: 70px;
                    }

                    .recording-status {
                        font-size: 20px;
                    }
                }

                /* 处理 iOS 安全区域 */
                @supports (-webkit-touch-callout: none) {
                    .recording-overlay,
                    .voice-wave-container {
                        height: -webkit-fill-available;
                    }
                }

                /* 移动端特定样式 */
                @media (max-width: 767px) {
                    .recording-overlay,
                    .voice-wave-container {
                        position: fixed;
                        height: 100%;
                        /* 处理底部安全区域 */
                        padding-bottom: env(safe-area-inset-bottom);
                    }


                    /* 调整波形大小适应移动端 */
                    .voice-wave-large {
                        transform: scale(0.8);
                    }

                    .voice-wave-bar-large {
                        width: 10px;
                        height: 70px;
                    }

                    .recording-status {
                        font-size: 20px;
                        margin-bottom: env(safe-area-inset-bottom);  /* 适应底部安全区域 */
                    }
                }

                /* iOS 设备特定处理 */
                @supports (-webkit-touch-callout: none) {
                    .recording-overlay,
                    .voice-wave-container {
                        height: -webkit-fill-available;
                    }
                }

                /* 消息提示样式 */
                .message-tip {
                    text-align: center;
                    padding: 10px;
                    color: #666;
                    font-size: 12px;
                }

                .no-more-tip {
                    color: #999;
                }

                .error-tip {
                    color: #ff4d4f;
                }

                .audio-message {
                    padding: 10px;
                    background: #f5f5f5;
                    border-radius: 8px;
                }

                .audio-message audio {
                    width: 250px;
                    height: 40px;
                    margin-bottom: 5px;
                }

                .audio-message .message-time {
                    font-size: 12px;
                    color: #666;
                    text-align: right;
                }
            </style>

            <div class="chat-wrapper">
                <div class="recording-overlay"></div>
                <div class="voice-wave-container">
                    <div class="voice-wave-large">
                        <div class="voice-wave-bar-large"></div>
                        <div class="voice-wave-bar-large"></div>
                        <div class="voice-wave-bar-large"></div>
                        <div class="voice-wave-bar-large"></div>
                        <div class="voice-wave-bar-large"></div>
                        <div class="voice-wave-bar-large"></div>
                        <div class="voice-wave-bar-large"></div>
                    </div>
                    <div class="recording-status">正在聆听...</div>
                </div>
                <div class="chat-container">
                    <div class="chat-messages" id="messages"></div>
                </div>
            </div>

            <div class="input-container">
                <div class="input-wrapper">
                    <input type="text" id="messageInput">
                    <button class="action-button mic-button" id="recordButton"></button>
                    <button class="action-button send-button" id="sendButton"></button>
                </div>
            </div>
        `;
    }

    initializeEventListeners() {
        const input = this.shadowRoot.getElementById('messageInput');
        const sendButton = this.shadowRoot.getElementById('sendButton');
        const recordButton = this.shadowRoot.getElementById('recordButton');
        const inputContainer = this.shadowRoot.querySelector('.input-container');

        // 修改全局点击事件监听，处理录音和播放
        document.addEventListener('click', (e) => {
            // 如果正在录音，则停止录音（不需要判断点击位置）
            if (this.isRecording) {
                this.stopRecording();
                e.stopPropagation(); // 防止事件冒泡
                return;
            }
        });

        // 监听输入变化
        input.addEventListener('input', (e) => {
            const hasText = e.target.value.trim().length > 0;
            if (hasText) {
                inputContainer.classList.add('show-send');
            } else {
                inputContainer.classList.remove('show-send');
            }
            this.stopCurrentAudio(); // 输入时停止播放
        });

        // 在发送消息后重置按钮状态
        const sendMessage = () => {
            const message = input.value.trim();
            if (message) {
                this.stopCurrentAudio();
                this.addMessage(message, 'user');
                input.value = '';
                inputContainer.classList.remove('show-send');  // 重置按钮状态
                this.sendChatMessage(message, false);
            }
        };

        sendButton.addEventListener('click', sendMessage);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });

        // 录音按钮点击事件
        recordButton.addEventListener('click', (e) => {
            e.stopPropagation(); // 防止触发两次停止录音
            this.stopCurrentAudio(); // 开始录音前停止播放

            // 如果没有在录音，则开始录音
            if (!this.isRecording) {
                this.startRecording();
            }
            // 如果正在录音，全局点击事件会处理停止录音
        });

        // 添加触摸事件监听，处理移动端
        document.addEventListener('touchstart', (e) => {
            if (this.isRecording) {
                this.stopRecording();
                e.stopPropagation();
                e.preventDefault(); // 防止触发点击事件
            }
        }, {passive: false}); // 允许阻止默认行为

        // 滚动加载历史消息
        const messagesContainer = this.shadowRoot.getElementById('messages');
        messagesContainer.addEventListener('scroll', async () => {
            // 使用 shouldLoadMore 方法检查是否需要加载更多
            if (this.shouldLoadMore(messagesContainer)) {
                await this.loadHistoryMessages(false);
            }
        });
    }

    async checkMicrophonePermission() {
        try {
            if (navigator.permissions) {
                const result = await navigator.permissions.query({ name: 'microphone' });
                console.log('Microphone permission status:', result.state);
                
                if (result.state === 'denied') {
                    return false;
                }
            }
            
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch (error) {
            console.error('Microphone permission check failed:', error);
            return false;
        }
    }

    async startRecording() {
        try {
            // 如果已经在录音，先停止当前录音并直接返回
            if (this.isRecording) {
                await this.stopRecording();
                return;
            }

            // 检查是否是安全上下文
            if (!window.isSecureContext) {
                return;
            }

            // 清理之前的资源
            if (this.mediaRecorder) {
                this.mediaRecorder = null;
            }
            this.audioChunks = [];
            this.recordingDuration = 0;

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: { ideal: true },
                    noiseSuppression: { ideal: true },
                    autoGainControl: { ideal: true }
                }
            });

            if (!stream || !stream.getAudioTracks().length) {
                return;
            }

            await this.setupRecording(stream);

        } catch (error) {
            console.error('Recording failed:', error);
            this.addMessage('录音失败: ' + error.message, 'bot');
        }
    }

    // 修改 setupRecording 方法
    async setupRecording(stream) {
        try {
            // 清理之前的资源
            if (this.mediaRecorder) {
                try {
                    this.mediaRecorder.removeEventListener('dataavailable', this.handleDataAvailable);
                    this.mediaRecorder.removeEventListener('stop', this.handleStop);
                    this.mediaRecorder = null;
                } catch (e) {
                    console.warn('Cleanup old mediaRecorder failed:', e);
                }
            }

            // 清理计时器
            if (this.recordingTimer) {
                clearInterval(this.recordingTimer);
                this.recordingTimer = null;
            }

            // 重置录音状态和数据
            this.audioChunks = [];
            this.recordingDuration = 0;
            this.isRecording = false;

            // 检查支持的 MIME 类型
            let mimeType = 'audio/webm';
            if (!MediaRecorder.isTypeSupported('audio/webm')) {
                if (MediaRecorder.isTypeSupported('audio/mp4')) {
                    mimeType = 'audio/mp4';
                } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
                    mimeType = 'audio/ogg';
                }
            }

            // 创建新的 MediaRecorder 实例
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType,
                audioBitsPerSecond: 128000
            });

            // 设置录音计时器
            this.recordingTimer = setInterval(() => {
                this.recordingDuration++;
                const recordButton = this.shadowRoot.getElementById('recordButton');
                const minutes = Math.floor(this.recordingDuration / 60);
                const seconds = this.recordingDuration % 60;
                recordButton.setAttribute('title', `录音中: ${minutes}:${seconds.toString().padStart(2, '0')}`);
            }, 1000);

            // 设置数据收集事件
            this.handleDataAvailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            this.mediaRecorder.addEventListener('dataavailable', this.handleDataAvailable);

            // 设置停止事件
            this.handleStop = async () => {
                try {
                    // 停止所有轨道
                    stream.getTracks().forEach(track => track.stop());

                    // 确保有录音数据
                    if (this.audioChunks.length === 0) {
                        throw new Error('没有录到音频数据');
                    }

                    const audioBlob = new Blob(this.audioChunks, {
                        type: mimeType
                    });

                    // 检查 blob 大小
                    if (audioBlob.size === 0) {
                        throw new Error('录音文件大小为0');
                    }

                    console.log('Audio blob created:', {
                        type: audioBlob.type,
                        size: audioBlob.size
                    });

                    const finalBlob = await this.convertToWav(audioBlob);

                    // 发送语音识别请求
                    const sttResponse = await fetch('https://api.homingai.com/ha/home/stt', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${this.access_token}`,
                            'Content-Type': 'audio/wav'
                        },
                        body: finalBlob
                    });

                    if (!sttResponse.ok) {
                        throw new Error(`语音识别请求失败: ${sttResponse.status}`);
                    }

                    const sttResult = await sttResponse.json();
                    
                    if (sttResult.code === 200 && sttResult.msg) {
                        this.addMessage(sttResult.msg, 'user');
                        await this.sendChatMessage(sttResult.msg, true);
                    } else {
                        throw new Error('语音识别失败：' + (sttResult.msg || '未知错误'));
                    }
                } catch (error) {
                    console.error('Error processing audio:', error);
                    this.addMessage(error.message, 'bot');
                }
            };
            this.mediaRecorder.addEventListener('stop', this.handleStop);

            // 开始录音
            this.mediaRecorder.start(1000);
            this.isRecording = true;

            // 更新 UI
            const recordButton = this.shadowRoot.getElementById('recordButton');
            const inputWrapper = this.shadowRoot.querySelector('.input-wrapper');
            const chatWrapper = this.shadowRoot.querySelector('.chat-wrapper');  // 获取 chat-wrapper

            if (recordButton) {
                recordButton.classList.add('recording');
                recordButton.classList.add('mic-button');
            }
            if (inputWrapper) {
                inputWrapper.classList.add('recording');
            }
            if (chatWrapper) {  // 添加录音状态到 chat-wrapper
                chatWrapper.classList.add('recording');
            }

        } catch (error) {
            console.error('Setup recording failed:', error);
            throw new Error('录音设置失败：' + error.message);
        }
    }

    async stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;

            this.mediaRecorder.stop();
            this.isRecording = false;

            // 更新 UI
            const recordButton = this.shadowRoot.getElementById('recordButton');
            const inputWrapper = this.shadowRoot.querySelector('.input-wrapper');
            const chatWrapper = this.shadowRoot.querySelector('.chat-wrapper');  // 获取 chat-wrapper

            if (recordButton) {
                recordButton.classList.remove('recording');
                recordButton.classList.add('mic-button');
            }
            if (inputWrapper) {
                inputWrapper.classList.remove('recording');
            }
            if (chatWrapper) {  // 从 chat-wrapper 移除录音状态
                chatWrapper.classList.remove('recording');
            }
        }
    }

    addMessage(text, type) {
        const messagesContainer = this.shadowRoot.getElementById('messages');
        const messageElement = this.createMessageElement({
            type,
            content: text,
            timestamp: new Date().toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit'
            }),
            showUserName: type === 'user',  // 如果是用户消息则显示用户名
            userName: this.currentUser  // 使用当前用户名
        });

        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // 添加创建消息元素的辅助方法
    createMessageElement({type, content, timestamp, showUserName, userName}) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message');

        if (type === 'user') {
            messageElement.classList.add('user-message');
        } else {
            messageElement.classList.add('bot-message');
        }

        const messageContent = document.createElement('div');
        messageContent.classList.add('message-content');
        messageContent.textContent = content;
        messageElement.appendChild(messageContent);

        const timestampElement = document.createElement('div');
        timestampElement.classList.add('message-time');

        // 如果是用户消息且需要显示用户名
        if (type === 'user' && showUserName && userName) {
            timestampElement.textContent = `${userName} · ${timestamp}`;
        } else {
            timestampElement.textContent = timestamp;
        }
        messageElement.appendChild(timestampElement);

        return messageElement;
    }

    // 在组件销毁时清理 iframe
    disconnectedCallback() {
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
        }
        if (this.mediaRecorder) {
            this.stopRecording();
        }
        if (this.permissionIframe) {
            this.permissionIframe.remove();
            this.permissionIframe = null;
        }
        // 清理 WebSocket
        if (this.ws) {
            this.isIntentionalClose = true; // 标记这是一个主动关闭
            this.ws.close(1000, 'Component disconnected');
            this.ws = null;
        }
        if (this.wsReconnectTimer) {
            clearTimeout(this.wsReconnectTimer);
            this.wsReconnectTimer = null;
        }
    }

    audioBufferToWav(buffer) {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const format = 1; // PCM
        const bitDepth = 16;
        const bytesPerSample = bitDepth / 8;
        const blockAlign = numChannels * bytesPerSample;
        
        const dataLength = buffer.length * blockAlign;
        const bufferLength = 44 + dataLength;
        const arrayBuffer = new ArrayBuffer(bufferLength);
        const view = new DataView(arrayBuffer);
        
        // WAV 文件头
        const writeString = (view, offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };
        
        // 写入 WAV 头部信息
        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataLength, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, format, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitDepth, true);
        writeString(view, 36, 'data');
        view.setUint32(40, dataLength, true);
        
        // 写入音频数据
        const offset = 44;
        let pos = 0;

        // 只处理第一个声道的数据
        const channel = buffer.getChannelData(0);
        for (let i = 0; i < buffer.length; i++) {
            const sample = Math.max(-1, Math.min(1, channel[i]));
            view.setInt16(pos + offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            pos += bytesPerSample;
        }
        
        return new Blob([arrayBuffer], { type: 'audio/wav' });
    }

    // 修改 sendChatMessage 方法
    async sendChatMessage(message, needTTS = false) {
        this.stopCurrentAudio();

        try {
            const chatResponse = await fetch('https://api.homingai.com/ha/home/chat', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    content: message,
                    user_name: this.currentUser || 'Unknown User'  // 修改参数名为 user_name
                })
            });

            if (!chatResponse.ok) {
                throw new Error(`聊天请求失败: ${chatResponse.status}`);
            }

            const chatResult = await chatResponse.json();

            if (chatResult.code === 200 && chatResult.msg) {
                this.addMessage(chatResult.msg, 'bot');

                if (needTTS) {
                    try {
                        const ttsResponse = await fetch('https://api.homingai.com/ha/home/tts', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${this.access_token}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                text: chatResult.msg,
                                user_name: this.currentUser || 'Unknown User',
                                option: 2
                            })
                        });

                        if (!ttsResponse.ok) {
                            throw new Error(`语音合成请求失败: ${ttsResponse.status}`);
                        }

                        const ttsResult = await ttsResponse.json();

                        // 新增：当 code 为 201 时直接返回，不做任何处理
                        if (ttsResult.code === 201) {
                            return;
                        }

                        if (ttsResult.code === 200 && ttsResult.body) {
                            try {
                                const audioData = this.base64ToBuffer(ttsResult.body);
                                // 确保音频格式正确
                                const audioBlob = new Blob([audioData], {
                                    type: 'audio/wav; codecs=1'  // 指定编解码器
                                });
                                const audioUrl = URL.createObjectURL(audioBlob);
                                this.playAudio(audioUrl);
                            } catch (error) {
                                console.error('TTS audio processing error:', error);
                                this.addMessage('语音处理失败: ' + error.message, 'bot');
                            }
                        } else {
                            throw new Error('语音合成失败：' + (ttsResult.msg || '未知错误'));
                        }
                    } catch (error) {
                        console.error('TTS error:', error);
                    }
                }
            } else {
                throw new Error('获取回复失败：' + (chatResult.msg || '未知错误'));
            }
        } catch (error) {
            console.error('Error in chat process:', error);
            this.addMessage(error.message, 'bot');
        }
    }

    // 添加 base64 转换方法
    base64ToBuffer(base64) {
        try {
            console.log('Converting base64 to buffer, length:', base64.length);
            const binaryString = window.atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            console.log('Buffer created successfully');
            return bytes.buffer;
        } catch (error) {
            console.error('Failed to convert base64 to buffer:', error);
            throw error;
        }
    }

    // 修改 playAudio 方法
    async playAudio(audioUrl) {
        try {
            // 先停止当前播放的音频
            await this.stopCurrentAudio();

            // 创建新的音频实例
            const audio = new Audio();
            
            // iOS Safari 需要设置这些属性
            audio.setAttribute('playsinline', 'true');
            audio.setAttribute('webkit-playsinline', 'true');
            audio.preload = 'auto';

            // 设置事件监听器
            const playPromise = new Promise((resolve, reject) => {
                audio.oncanplaythrough = () => {
                    this.currentAudio = audio;
                    this.isPlaying = true;
                    audio.play().then(resolve).catch(reject);
                };

                audio.onerror = () => {
                    reject(new Error('Audio loading failed'));
                };

                audio.onended = () => {
                    this.cleanupAudio(audio, audioUrl);
                };
            });

            // 设置音频源并等待播放
            audio.src = audioUrl;
            await playPromise;

        } catch (error) {
            console.warn('Audio playback warning:', error);
            // 不抛出错误，只清理资源
            this.cleanupAudio(this.currentAudio, audioUrl);
        }
    }

    // 修改 stopCurrentAudio 方法
    async stopCurrentAudio() {
        if (this.currentAudio) {
            try {
                this.currentAudio.pause();
                await this.cleanupAudio(this.currentAudio, this.currentAudio.src);
            } catch (error) {
                console.warn('Stop audio warning:', error);
            }
        }
    }

    // 修改 cleanupAudio 方法
    async cleanupAudio(audio, audioUrl) {
        if (audio) {
            try {
                audio.pause();
                audio.src = '';
                audio.load();
                audio.oncanplaythrough = null;
                audio.onerror = null;
                audio.onended = null;
            } catch (e) {
                console.warn('Audio cleanup warning:', e);
            }
        }

        if (audioUrl) {
            try {
                URL.revokeObjectURL(audioUrl);
            } catch (e) {
                console.warn('URL cleanup warning:', e);
            }
        }

        this.currentAudio = null;
        this.isPlaying = false;
    }

    // 添加音频转换辅助方法
    async convertToWav(audioBlob) {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            const offlineContext = new OfflineAudioContext(
                audioBuffer.numberOfChannels,
                audioBuffer.length,
                audioBuffer.sampleRate
            );

            const source = offlineContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(offlineContext.destination);
            source.start();

            const renderedBuffer = await offlineContext.startRendering();
            return await this.audioBufferToWav(renderedBuffer);
        } catch (error) {
            throw new Error('音频格式转换失败: ' + error.message);
        }
    }

    // 处理 WebSocket 消息
    handleWebSocketMessage(data) {
        console.log('Handling WebSocket message:', {
            type: data.message_type,
            hasContent: !!data.content,
            hasBody: !!data.body,
            isComplete: data.is_complete
        });

        // 根据消息类型处理不同的消息
        switch (data.message_type) {
            case 1: // 用户消息
                console.log('Processing user message');
                const messageElement = this.createMessageElement({
                    type: 'user',
                    content: data.content,
                    timestamp: new Date(data.created_at * 1000).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit'
                    }),
                    showUserName: true,
                    userName: data.user_name
                });

                const messagesContainer = this.shadowRoot.getElementById('messages');
                messagesContainer.appendChild(messageElement);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                break;

            case 2: // 机器人消息
                console.log('Processing bot message');
                const botMessage = this.createMessageElement({
                    type: 'bot',
                    content: data.content,
                    timestamp: new Date(data.created_at * 1000).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit'
                    })
                });

                const chatContainer = this.shadowRoot.getElementById('messages');
                chatContainer.appendChild(botMessage);
                chatContainer.scrollTop = chatContainer.scrollHeight;
                break;

            case 1000: // 实时语音合成
                this.handleAudioMessage(data).catch(error => {
                    console.error('Audio message processing error:', error);
                });
                break;

            default:
                console.log('Unknown message type:', data.message_type);
        }
    }

    // 修改 handleAudioMessage 方法
    async handleAudioMessage(data) {
        try {
            // 如果是完成信号，直接返回
            if (data.is_complete === true) {
                return;
            }

            // 检查音频数据
            if (!data.body) {
                console.warn('No audio data received');
                return;
            }

            // 创建音频 Blob
            const audioData = this.base64ToArrayBuffer(data.body);
            const audioBlob = new Blob([audioData], { 
                type: 'audio/wav'  // 明确指定编解码器
            });
            
            // 创建 URL 并播放
            const audioUrl = URL.createObjectURL(audioBlob);
            await this.playAudio(audioUrl);

        } catch (error) {
            console.warn('Audio message warning:', error);
            await this.cleanupAudio(this.currentAudio, null);
        }
    }

    // base64 转换方法
    base64ToArrayBuffer(base64) {
        const binaryString = window.atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    // 处理 WebSocket 重连
    handleWebSocketReconnect() {
        if (this.wsReconnectTimer) {
            clearTimeout(this.wsReconnectTimer);
            this.wsReconnectTimer = null;
        }

        // 添加最小重连间隔检查
        const now = Date.now();
        if (this.lastReconnectAttempt && (now - this.lastReconnectAttempt) < 5000) {
            console.log('Reconnection attempted too frequently, waiting...');
            return;
        }
        this.lastReconnectAttempt = now;

        // 如果已经达到最大重试次数，不再继续重试
        if (this.wsReconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            this.addMessage('连接失败，请刷新页面重试', 'bot');
            return;
        }

        this.wsReconnectAttempts++;
        const delay = Math.min(2000 * Math.pow(2, this.wsReconnectAttempts), 60000);
        
        console.log(`Scheduling reconnection attempt ${this.wsReconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
        
        this.wsReconnectTimer = setTimeout(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                console.log('Connection already restored, skipping reconnection');
                return;
            }
            console.log(`Attempting to reconnect (${this.wsReconnectAttempts}/${this.maxReconnectAttempts})`);
            this.initWebSocket();
        }, delay);
    }

    // 添加 shouldLoadMore 方法
    shouldLoadMore(container) {
        // 如果没有更多数据或正在加载中，返回 false
        if (!this.hasMore || this.isLoading) {
            return false;
        }
        
        // 检查是否滚动到顶部附近
        // this.loadingThreshold 在构造函数中已定义为 100
        return container.scrollTop <= this.loadingThreshold;
    }

    // 修改 playStreamAudio 方法
    async playStreamAudio(base64Data) {
        if (!base64Data) {
            console.error('No base64 data provided');
            return;
        }

        // 确保停止并清理之前的音频
        if (this.currentAudio) {
            try {
                this.currentAudio.stop();
                this.currentAudio.disconnect();
            } catch (e) {
                // 忽略错误
            }
            this.currentAudio = null;
        }

        try {
            // 创建新的 AudioContext
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // 解码 base64 数据
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // 解码音频数据
            const audioBuffer = await audioContext.decodeAudioData(bytes.buffer);
            
            // 创建音频源
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);

            // 设置播放结束的处理
            source.onended = () => {
                source.disconnect();
                audioContext.close();
                this.currentAudio = null;
                this.isPlaying = false;
            };

            // 保存当前音频源并开始播放
            this.currentAudio = source;
            this.isPlaying = true;
            source.start(0);

        } catch (error) {
            console.error('Audio playback error:', error);
            this.isPlaying = false;
            this.currentAudio = null;
            throw new Error('音频格式转换失败: ' + error.message);
        }
    }
}

// 注册自定义元素
if (!customElements.get('homingai-chat')) {
    customElements.define('homingai-chat', HomingAIChat);
}