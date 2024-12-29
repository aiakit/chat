class HomingAIChat extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.recordingTimer = null;
        this.recordingDuration = 0;
        this.permissionIframe = null;
        this.access_token = null;
        
        const scriptPath = new URL(import.meta.url).pathname;
        this.basePath = scriptPath.substring(0, scriptPath.lastIndexOf('/'));
        
        // 添加音频控制相关属性
        this.currentAudio = null;
        this.isPlaying = false;
        
        // 添加分页相关属性
        this.currentPage = 1;
        this.pageSize = 20;
        this.isLoading = false;
        this.totalCount = 0;  // 添加总数记录
        this.loadedCount = 0; // 添加已加载数量记录
        
        // 添加用户名属性
        this.currentUser = null;
        this.hass = null; // 添加 hass 属性
        
        // 添加 WebSocket 相关属性
        this.ws = null;
        this.wsReconnectTimer = null;
        this.wsReconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    // 添加 hass 属性设置器
    set hass(hass) {
        this._hass = hass;
        if (hass && hass.user) {
            this.currentUser = hass.user.name;
        }
    }

    async connectedCallback() {
        try {
            const response = await fetch(`${this.basePath}/access_token.txt`);
            if (response.ok) {
                this.access_token = await response.text();
                this.render();
                this.initializeEventListeners();
                await this.loadHistoryMessages(true);
                
                // 初始化 WebSocket 连接
                this.initWebSocket();
            } else {
                throw new Error('Failed to load token file');
            }
        } catch (error) {
            console.error('Failed to get access token:', error);
            this.render();
            this.initializeEventListeners();
            setTimeout(() => {
                this.addMessage('无法获取授权信息，请检查配置或重新授权', 'bot');
            }, 1000);
        }
    }

    render() {
        const micClosePath = `${this.basePath}/mic_close.png`;
        const micWorkingPath = `${this.basePath}/mic_woking.png`;

        this.shadowRoot.innerHTML = `
            <style>
                /* 基础样式 */
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

                .chat-container {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    display: flex;
                    flex-direction: column;
                    background: #fff;
                }

                .chat-messages {
                    flex: 1;
                    overflow-y: auto;
                    -webkit-overflow-scrolling: touch;
                    padding: 20px;
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 70px;
                    background: #fafafa;
                }

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

                /* 用户名样式 */
                .user-message .message-time {
                    justify-content: flex-end;
                }

                .bot-message .message-time {
                    justify-content: flex-start;
                }

                .audio-message {
                    background: transparent !important;
                    padding: 8px 0;
                    max-width: 300px;
                    box-shadow: none;
                }

                .audio-message audio {
                    width: 100%;
                    border-radius: 8px;
                    background: rgba(138, 43, 226, 0.1);
                }

                /* 添加消息发送时的动画效果 */
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

                .message {
                    animation: messageAppear 0.3s ease-out;
                }

                .input-container {
                    position: fixed;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    height: 70px;
                    background: #fff;
                    border-top: 1px solid rgba(0, 0, 0, 0.08);
                    padding: 12px 16px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    z-index: 100;
                    box-sizing: border-box;
                }

                .input-wrapper {
                    flex: 1;
                    position: relative;
                    background: #f8f9fa;
                    transition: all 0.3s ease;
                    border-radius: 8px;
                }

                .input-wrapper:focus-within {
                    background: #ffffff;
                    box-shadow: 0 0 0 2px rgba(138, 43, 226, 0.1);
                }

                #messageInput {
                    width: 100%;
                    padding: 12px 16px;
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

                #messageInput:focus {
                    border-color: rgba(138, 43, 226, 0.3);
                }

                .voice-wave-container {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    pointer-events: none;
                    opacity: 0;
                    transition: opacity 0.3s ease;
                    z-index: 1;
                    background: rgba(255, 255, 255, 0.95);
                }

                .input-wrapper.recording .voice-wave-container {
                    opacity: 1;
                }

                .input-wrapper.recording #messageInput {
                    color: transparent;
                }

                .action-button {
                    width: 40px;
                    height: 40px;
                    min-width: 40px;
                    border-radius: 8px;
                    padding: 0;
                    background-size: 20px;
                    background-position: center;
                    background-repeat: no-repeat;
                    border: 1px solid #e0e0e0;
                    transition: all 0.3s ease;
                    flex-shrink: 0;
                    cursor: pointer;
                    position: relative;
                }

                .action-button:hover {
                    background-color: #f5f5f5;
                    border-color: #d0d0d0;
                }

                .mic-button {
                    background-image: url('${micClosePath}');
                }

                .mic-button.recording {
                    background-image: url('${micWorkingPath}');
                    background-color: rgba(255, 59, 48, 0.1);
                    border-color: rgba(255, 59, 48, 0.2);
                    animation: pulse-mic 2s infinite;
                }

                @keyframes pulse-mic {
                    0% {
                        transform: scale(1);
                        box-shadow: 0 0 0 0 rgba(255, 59, 48, 0.2);
                    }
                    70% {
                        transform: scale(1.05);
                        box-shadow: 0 0 0 6px rgba(255, 59, 48, 0);
                    }
                    100% {
                        transform: scale(1);
                        box-shadow: 0 0 0 0 rgba(255, 59, 48, 0);
                    }
                }

                .send-button {
                    background-color: #8A2BE2;
                    border: none;
                    display: none;
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

                .send-button:hover {
                    background-color: #7B1FA2;
                }

                .input-container.show-send .mic-button {
                    display: none;
                }

                .input-container.show-send .send-button {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .voice-wave {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }

                .voice-wave-bar {
                    width: 3px;
                    height: 24px;
                    background: var(--primary-color, #2196F3);
                    border-radius: 6px;
                    animation: voice-wave-animation 1.2s ease-in-out infinite;
                    transform-origin: center;
                }

                .voice-wave-bar:nth-child(1) { animation-delay: -1.2s; }
                .voice-wave-bar:nth-child(2) { animation-delay: -1.0s; }
                .voice-wave-bar:nth-child(3) { animation-delay: -0.8s; }
                .voice-wave-bar:nth-child(4) { animation-delay: -0.6s; }
                .voice-wave-bar:nth-child(5) { animation-delay: -0.4s; }

                @keyframes voice-wave-animation {
                    0%, 100% { 
                        transform: scaleY(0.3);
                    }
                    50% { 
                        transform: scaleY(1);
                    }
                }

                .recording-status {
                    color: #8A2BE2;
                    font-size: 14px;
                    margin-bottom: 8px;
                }

                .record-button {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    margin-right: 8px;
                    padding: 0;
                    background-size: 24px;
                    background-position: center;
                    background-repeat: no-repeat;
                    background-image: url('${micClosePath}');
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    border: 1px solid transparent;
                }

                .record-button.recording {
                    background-image: url('${micWorkingPath}');
                    background-color: rgba(255, 59, 48, 0.1);
                    border-color: rgba(255, 59, 48, 0.2);
                    animation: pulse-mic 2s infinite;
                }

                @keyframes pulse-mic {
                    0% {
                        transform: scale(1);
                        box-shadow: 0 0 0 0 rgba(255, 59, 48, 0.4);
                    }
                    70% {
                        transform: scale(1.05);
                        box-shadow: 0 0 0 10px rgba(255, 59, 48, 0);
                    }
                    100% {
                        transform: scale(1);
                        box-shadow: 0 0 0 0 rgba(255, 59, 48, 0);
                    }
                }

                button {
                    padding: 8px 16px;
                    background: var(--primary-color);
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                button:hover {
                    opacity: 0.9;
                }

                .audio-message {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                audio {
                    max-width: 300px;
                }

                .recording-status {
                    position: absolute;
                    top: -24px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(0, 0, 0, 0.7);
                    color: white;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 12px;
                    pointer-events: none;
                    opacity: 0;
                    transition: opacity 0.3s;
                }

                .recording .recording-status {
                    opacity: 1;
                }

                /* 添加滚动条样式 */
                .chat-messages::-webkit-scrollbar {
                    width: 6px;
                }

                .chat-messages::-webkit-scrollbar-track {
                    background: transparent;
                }

                .chat-messages::-webkit-scrollbar-thumb {
                    background: rgba(0, 0, 0, 0.1);
                    border-radius: 3px;
                }

                .chat-messages::-webkit-scrollbar-thumb:hover {
                    background: rgba(0, 0, 0, 0.2);
                }

                /* 添加媒体查询，针对移动设备 */
                @media (max-width: 600px) {
                    .chat-messages {
                        padding: 15px;
                        padding-bottom: 80px;
                    }
                    
                    .input-container {
                        padding: 8px 15px;
                    }
                }

                /* 确保在虚拟键盘弹出时内容不会被压缩 */
                @supports (-webkit-touch-callout: none) {
                    :host {
                        height: -webkit-fill-available;
                    }
                    
                    .chat-container {
                        height: -webkit-fill-available;
                    }
                    
                    .input-container {
                        padding-bottom: calc(10px + env(safe-area-inset-bottom));
                    }
                }

                @supports (-webkit-touch-callout: none) {
                    :host {
                        height: -webkit-fill-available;
                    }
                    
                    .chat-container {
                        height: -webkit-fill-available;
                    }
                    
                    .input-container {
                        padding-bottom: calc(10px + env(safe-area-inset-bottom));
                    }
                    
                    .chat-messages {
                        bottom: calc(70px + env(safe-area-inset-bottom));
                    }
                }

                @media (max-height: 400px) {
                    .chat-messages {
                        bottom: 70px;
                    }
                    
                    .input-container {
                        position: fixed;
                    }
                }

                /* 虚拟键盘弹出时的处理 */
                @media (max-height: 450px) {
                    .chat-messages {
                        padding-bottom: 70px;
                    }
                }

                /* Web 端样式 */
                @media (min-width: 768px) {
                    :host {
                        padding: 20px;
                        background: #f5f5f5;
                    }

                    .chat-container {
                        position: relative;
                        width: 100%;
                        max-width: 900px;
                        height: calc(100vh - 40px);
                        margin: 0 auto;
                        border-radius: 16px;
                        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
                        overflow: hidden;
                    }

                    .chat-messages {
                        padding: 30px;
                        bottom: 80px;
                    }

                    .input-container {
                        position: absolute;
                        width: 100%;
                        max-width: 900px;
                        left: 50%;
                        transform: translateX(-50%);
                        height: 80px;
                        padding: 16px 30px;
                        border-top: 1px solid rgba(0, 0, 0, 0.06);
                        background: #fff;
                    }

                    .input-wrapper {
                        flex: 1;
                        background: #f8f9fa;
                        border-radius: 12px;
                        transition: all 0.3s ease;
                    }

                    #messageInput {
                        width: 100%;
                        height: 46px;
                        padding: 0 16px;
                        border: 1px solid #e0e0e0;
                        border-radius: 12px;
                        font-size: 16px;
                        background: transparent;
                        transition: all 0.3s ease;
                    }

                    #messageInput:focus {
                        border-color: rgba(138, 43, 226, 0.3);
                        box-shadow: 0 0 0 2px rgba(138, 43, 226, 0.1);
                    }

                    .action-button {
                        width: 46px;
                        height: 46px;
                        min-width: 46px;
                        border-radius: 12px;
                        transition: all 0.3s ease;
                    }

                    .action-button:hover {
                        transform: translateY(-1px);
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
                    }

                    /* 消息样式优化 */
                    .message {
                        max-width: 70%;
                    }

                    .message-content {
                        padding: 14px 18px;
                        border-radius: 16px;
                        font-size: 15px;
                        line-height: 1.5;
                    }

                    /* 滚动条样式 */
                    .chat-messages::-webkit-scrollbar {
                        width: 8px;
                    }

                    .chat-messages::-webkit-scrollbar-track {
                        background: transparent;
                    }

                    .chat-messages::-webkit-scrollbar-thumb {
                        background: rgba(0, 0, 0, 0.1);
                        border-radius: 4px;
                    }

                    .chat-messages::-webkit-scrollbar-thumb:hover {
                        background: rgba(0, 0, 0, 0.2);
                    }
                }

                /* 大屏幕优化 */
                @media (min-width: 1200px) {
                    .chat-container {
                        max-width: 1000px;
                    }

                    .input-container {
                        max-width: 1000px;
                    }

                    .message {
                        max-width: 60%;
                    }
                }

                /* 移动端的基础样式 */
                @media (max-width: 767px) {
                    :host {
                        position: fixed !important;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        width: 100%;
                        height: 100%;
                        overflow: hidden;
                        background: #fff;
                        display: flex;
                        flex-direction: column;
                    }

                    .chat-container {
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        width: 100%;
                        height: 100%;
                        display: flex;
                        flex-direction: column;
                        background: #fff;
                        overflow: hidden; /* 防止容器滚动 */
                    }

                    .chat-messages {
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 60px; /* 输入框高度 */
                        overflow-y: auto;
                        -webkit-overflow-scrolling: touch;
                        padding: 15px;
                        background: #fafafa;
                        z-index: 1;
                    }

                    .input-container {
                        position: fixed;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        height: 60px;
                        background: #fff;
                        border-top: 1px solid rgba(0, 0, 0, 0.08);
                        padding: 10px 15px;
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        z-index: 2;
                        box-sizing: border-box;
                    }

                    .input-wrapper {
                        flex: 1;
                        height: 40px;
                        display: flex;
                        align-items: center;
                        background: #f8f9fa;
                        border-radius: 8px;
                    }

                    #messageInput {
                        width: 100%;
                        height: 100%;
                        padding: 0 12px;
                        border: 1px solid #e0e0e0;
                        border-radius: 8px;
                        font-size: 15px;
                        background: transparent;
                    }

                    .action-button {
                        width: 40px;
                        height: 40px;
                        min-width: 40px;
                        border-radius: 8px;
                        padding: 0;
                        flex-shrink: 0;
                    }

                    /* iOS 设备底部安全区域适配 */
                    @supports (-webkit-touch-callout: none) {
                        .chat-messages {
                            bottom: calc(60px + env(safe-area-inset-bottom));
                        }

                        .input-container {
                            height: calc(60px + env(safe-area-inset-bottom));
                            padding-bottom: calc(10px + env(safe-area-inset-bottom));
                        }
                    }

                    /* 虚拟键盘弹出时的处理 */
                    @media (max-height: 450px) {
                        .chat-messages {
                            bottom: 50px;
                        }
                        
                        .input-container {
                            height: 50px;
                        }
                    }

                    /* 消息样式优化 */
                    .message {
                        max-width: 85%;
                        margin-bottom: 12px;
                    }

                    .message-content {
                        padding: 12px 16px;
                        border-radius: 16px;
                        font-size: 15px;
                        line-height: 1.4;
                    }

                    /* 录音波形动画容器固定位置 */
                    .voice-wave-container {
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: rgba(255, 255, 255, 0.95);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 3;
                    }
                }

                /* 虚拟键盘弹出时的处理 */
                @media (max-height: 450px) {
                    .chat-messages {
                        bottom: 60px;
                    }
                    
                    .input-container {
                        min-height: 50px;
                    }
                }

                .loading-tip, .error-tip {
                    text-align: center;
                    padding: 10px;
                    color: #666;
                    font-size: 14px;
                }
                
                .error-tip {
                    color: #ff4d4f;
                }
                
                .pull-down-tip {
                    text-align: center;
                    padding: 10px;
                    color: #666;
                    font-size: 14px;
                    opacity: 0;
                    transition: opacity 0.3s;
                }
                
                .pull-down-tip.visible {
                    opacity: 1;
                }

                .remaining-tip {
                    text-align: center;
                    padding: 8px;
                    color: #666;
                    font-size: 12px;
                    background: #f5f5f5;
                    border-radius: 4px;
                    margin: 8px 0;
                }
                
                .pull-down-tip {
                    text-align: center;
                    padding: 10px;
                    color: #666;
                    font-size: 14px;
                    opacity: 0.8;
                }
                
                .pull-down-tip.visible {
                    opacity: 1;
                }
            </style>

            <div class="chat-container">
                <div class="chat-messages" id="messages"></div>
                <div class="input-container">
                    <div class="input-wrapper">
                        <input type="text" id="messageInput">
                        <div class="voice-wave-container">
                            <div class="recording-status">正在聆听...</div>
                            <div class="voice-wave">
                                <div class="voice-wave-bar"></div>
                                <div class="voice-wave-bar"></div>
                                <div class="voice-wave-bar"></div>
                                <div class="voice-wave-bar"></div>
                                <div class="voice-wave-bar"></div>
                            </div>
                        </div>
                    </div>
                    <button class="action-button mic-button" id="recordButton"></button>
                    <button class="action-button send-button" id="sendButton"></button>
                </div>
            </div>
        `;
        
        // 在消息容器前添加下拉提示
        const messagesContainer = this.shadowRoot.querySelector('.chat-messages');
        const pullDownTip = document.createElement('div');
        pullDownTip.className = 'pull-down-tip';
        pullDownTip.textContent = '下拉加载更多...';
        messagesContainer.insertBefore(pullDownTip, messagesContainer.firstChild);
    }

    initializeEventListeners() {
        const input = this.shadowRoot.getElementById('messageInput');
        const sendButton = this.shadowRoot.getElementById('sendButton');
        const recordButton = this.shadowRoot.getElementById('recordButton');
        const inputContainer = this.shadowRoot.querySelector('.input-container');

        // 添加全局点击事件监听，处理录音和播放
        document.addEventListener('click', (e) => {
            // 如果正在录音，则停止录音（不需要判断点击位置）
            if (this.isRecording) {
                this.stopRecording();
            }
            // 如果点击的不是播放按钮，则停止播放
            if (!e.target.closest('.audio-play-button')) {
                this.stopCurrentAudio();
            }
        });

        const sendMessage = () => {
            const message = input.value.trim();
            if (message) {
                this.stopCurrentAudio(); // 发送消息前停止播放
                this.addMessage(message, 'user');
                input.value = '';
                inputContainer.classList.remove('show-send');
                this.sendChatMessage(message, false);
            }
        };

        // 监听输入变化
        input.addEventListener('input', (e) => {
            if (e.target.value.trim()) {
                inputContainer.classList.add('show-send');
            } else {
                inputContainer.classList.remove('show-send');
            }
            this.stopCurrentAudio(); // 输入时停止播放
        });

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

        // 添加消息容器的滚动监听
        const messagesContainer = this.shadowRoot.getElementById('messages');
        let touchStartY = 0;
        let pullDownTip = this.shadowRoot.querySelector('.pull-down-tip');
        
        messagesContainer.addEventListener('touchstart', (e) => {
            if (messagesContainer.scrollTop === 0) {
                touchStartY = e.touches[0].clientY;
            }
        });
        
        messagesContainer.addEventListener('touchmove', (e) => {
            if (messagesContainer.scrollTop === 0) {
                const touchY = e.touches[0].clientY;
                const pull = touchY - touchStartY;
                
                if (pull > 50) {
                    pullDownTip.classList.add('visible');
                } else {
                    pullDownTip.classList.remove('visible');
                }
            }
        });
        
        messagesContainer.addEventListener('touchend', async (e) => {
            if (messagesContainer.scrollTop === 0) {
                const touchY = e.changedTouches[0].clientY;
                const pull = touchY - touchStartY;
                
                if (pull > 50) {
                    pullDownTip.classList.remove('visible');
                    await this.loadHistoryMessages(true);
                }
            }
        });
    }

    async startRecording() {
        try {
            // 如果已经在录音，先停止当前录音
            if (this.isRecording) {
                await this.stopRecording();
                return;
            }

            // 如果当前窗口不支持录音，尝试通过 iframe 取权限
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                await this.requestPermissionViaIframe();
                return;
            }

            // 如果当前窗口支持mediaDevices，使用当前窗口的录音功能
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = null;
            this.audioChunks = [];
            this.recordingDuration = 0;
            
            this.setupRecording(stream);

        } catch (error) {
            console.error('Error starting recording:', error);
            if (error.name === 'NotAllowedError') {
                await this.requestPermissionViaIframe();
            } else {
                alert(`启动录音失败：${error.message}`);
            }
        }
    }

    async requestPermissionViaIframe() {
        // 创建一个隐藏的 iframe
        if (!this.permissionIframe) {
            this.permissionIframe = document.createElement('iframe');
            this.permissionIframe.style.display = 'none';
            // 使用当前域名，避免跨域问题
            this.permissionIframe.src = window.location.origin;
            document.body.appendChild(this.permissionIframe);

            // 等待 iframe 加载完成
            await new Promise(resolve => {
                this.permissionIframe.onload = resolve;
            });
        }

        try {
            // 试在 iframe 中获取麦克风权限
            const stream = await this.permissionIframe.contentWindow.navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = null;
            this.audioChunks = [];
            this.recordingDuration = 0;
            
            this.setupRecording(stream);
        } catch (error) {
            console.error('Iframe permission request failed:', error);
            if (error.name === 'SecurityError') {
                // 如果是安全错误，可能需要用户手动授权
                alert('请在系统设置允许 Home Assistant 访问麦克风');
            } else {
                alert('无法获取麦克风权限，请确保设备支持录音功能');
            }
        }
    }

    // 将录音相关的设置抽取为单独的方法
    setupRecording(stream) {
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
        }

        this.recordingTimer = setInterval(() => {
            this.recordingDuration++;
            const recordButton = this.shadowRoot.getElementById('recordButton');
            const minutes = Math.floor(this.recordingDuration / 60);
            const seconds = this.recordingDuration % 60;
            recordButton.setAttribute('title', `录音中: ${minutes}:${seconds.toString().padStart(2, '0')}`);
        }, 1000);

        this.mediaRecorder = new MediaRecorder(stream, {
            mimeType: MediaRecorder.isTypeSupported('audio/webm') 
                ? 'audio/webm' 
                : 'audio/mp4',
            audioBitsPerSecond: 128000
        });

        this.audioChunks = [];
        this.recordingDuration = 0;

        this.mediaRecorder.addEventListener('dataavailable', (event) => {
            this.audioChunks.push(event.data);
        });

        this.mediaRecorder.addEventListener('stop', async () => {
            try {
                // 获取原始音频数据并转换为 WAV
                const audioBlob = new Blob(this.audioChunks, { 
                    type: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4' 
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
            } finally {
                // 清理资源
                stream.getTracks().forEach(track => track.stop());
            }
        });

        // 每秒钟生成一个数据块
        this.mediaRecorder.start(1000);
        this.isRecording = true;
        
        const recordButton = this.shadowRoot.getElementById('recordButton');
        const inputWrapper = this.shadowRoot.querySelector('.input-wrapper');
        
        if (recordButton) {
            recordButton.classList.add('recording');
            recordButton.classList.add('mic-button');
        }
        if (inputWrapper) {
            inputWrapper.classList.add('recording');
        }
    }

    async stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
            
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            const recordButton = this.shadowRoot.getElementById('recordButton');
            const inputWrapper = this.shadowRoot.querySelector('.input-wrapper');
            
            if (recordButton) {
                recordButton.classList.remove('recording');
                recordButton.classList.add('mic-button');
            }
            if (inputWrapper) {
                inputWrapper.classList.remove('recording');
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
    createMessageElement({ type, content, timestamp, showUserName, userName }) {
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
            this.ws.close();
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
        const channelData = new Float32Array(buffer.length);
        let pos = 0;
        
        for (let i = 0; i < buffer.numberOfChannels; i++) {
            const channel = buffer.getChannelData(i);
            for (let j = 0; j < buffer.length; j++) {
                if (i === 0) {
                    channelData[j] = channel[j];
                } else {
                    channelData[j] += channel[j];
                }
                
                if (i === buffer.numberOfChannels - 1) {
                    const sample = channelData[j] / buffer.numberOfChannels;
                    const val = Math.max(-1, Math.min(1, sample));
                    view.setInt16(pos + offset, val < 0 ? val * 0x8000 : val * 0x7FFF, true);
                    pos += 2;
                }
            }
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
                const timestamp = new Date().toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
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
                                text: chatResult.msg
                            })
                        });

                        if (!ttsResponse.ok) {
                            throw new Error(`语音合成请求失败: ${ttsResponse.status}`);
                        }

                        const ttsResult = await ttsResponse.json();

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
        const binaryString = window.atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    // 修改 playAudio 方法
    playAudio(audioUrl) {
        // 停止当前正在播放的音频
        this.stopCurrentAudio();

        const audio = new Audio();
        this.currentAudio = audio;
        this.isPlaying = true;
        
        // 添加音频事件监听器
        audio.addEventListener('error', (e) => {
            console.error('Audio playback error:', {
                error: e.target.error,
                code: e.target.error.code,
                message: e.target.error.message
            });
            this.isPlaying = false;
            this.addMessage('语音播放失败，点击播放按钮尝试手动播放', 'bot');
            this.createPlayButton(audioUrl);
        });

        audio.addEventListener('ended', () => {
            this.isPlaying = false;
            this.currentAudio = null;
            URL.revokeObjectURL(audioUrl);
        });

        // iOS Safari 需要设置这些属性
        audio.setAttribute('playsinline', 'true');
        audio.setAttribute('webkit-playsinline', 'true');
        audio.preload = 'auto';
        audio.src = audioUrl;

        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.error('Autoplay failed:', error);
                this.isPlaying = false;
                this.createPlayButton(audioUrl);
            });
        }
    }

    // 修改 createPlayButton 方法
    createPlayButton(audioUrl) {
        const messagesContainer = this.shadowRoot.getElementById('messages');
        const lastMessage = messagesContainer.lastElementChild;
        
        // 检查是否已经有播放按钮
        if (lastMessage && lastMessage.querySelector('.audio-play-button')) {
            return;
        }

        const playButton = document.createElement('button');
        playButton.className = 'audio-play-button';
        playButton.innerHTML = `
            <span class="play-icon">▶</span>
            <span class="play-text">点击播放语音</span>
        `;

        // 添加点击事件
        playButton.addEventListener('click', async (e) => {
            e.stopPropagation(); // 防止触发全局点击事件
            
            if (this.isPlaying && this.currentAudio) {
                // 如果正在播放，则停止
                this.stopCurrentAudio();
                return;
            }

            const audio = new Audio();
            this.currentAudio = audio;
            this.isPlaying = true;

            audio.setAttribute('playsinline', 'true');
            audio.setAttribute('webkit-playsinline', 'true');
            audio.src = audioUrl;

            try {
                await audio.play();
                playButton.innerHTML = `
                    <span class="play-icon">⏹</span>
                    <span class="play-text">停止播放</span>
                `;
                playButton.style.opacity = '0.5';
                
                audio.onended = () => {
                    this.isPlaying = false;
                    this.currentAudio = null;
                    playButton.innerHTML = `
                        <span class="play-icon">▶</span>
                        <span class="play-text">点击播放语音</span>
                    `;
                    playButton.style.opacity = '1';
                    URL.revokeObjectURL(audioUrl);
                };
            } catch (error) {
                console.error('Manual play failed:', error);
                this.isPlaying = false;
                this.currentAudio = null;
                this.addMessage('语音播放失败，请检查设备音频设置', 'bot');
            }
        });

        if (lastMessage) {
            lastMessage.appendChild(playButton);
        }
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

    // 添加音频控制方法
    stopCurrentAudio() {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.isPlaying = false;
            // 重置所有播放按钮的状态
            const playButtons = this.shadowRoot.querySelectorAll('.audio-play-button');
            playButtons.forEach(button => {
                button.innerHTML = `
                    <span class="play-icon">▶</span>
                    <span class="play-text">点击播放语音</span>
                `;
                button.style.opacity = '1';
            });
        }
    }

    // 添加历史消息加载方法
    async loadHistoryMessages(isInitial = false) {
        if (this.isLoading || (!this.hasMore && !isInitial)) return;
        
        try {
            this.isLoading = true;
            const messagesContainer = this.shadowRoot.getElementById('messages');
            
            // 仅在非初始加载时显示加载提示
            if (!isInitial) {
                const loadingTip = document.createElement('div');
                loadingTip.className = 'loading-tip';
                loadingTip.textContent = '正在加载消息...';
                messagesContainer.insertBefore(loadingTip, messagesContainer.firstChild);
            }
            
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
                // 移除加载提示
                const loadingTip = this.shadowRoot.querySelector('.loading-tip');
                if (loadingTip) {
                    loadingTip.remove();
                }
                
                // 更新总数
                this.totalCount = result.data.total_count;
                
                if (isInitial) {
                    // 清空现有消息和计数
                    messagesContainer.innerHTML = '';
                    this.currentPage = 1;
                    this.loadedCount = 0;
                }
                
                // 渲染消息
                if (result.data.data && result.data.data.length > 0) {
                    const fragment = document.createDocumentFragment();
                    const scrollHeight = messagesContainer.scrollHeight;
                    
                    // 更新已加载数量
                    this.loadedCount += result.data.data.length;
                    
                    result.data.data.reverse().forEach(msg => {
                        const messageElement = this.createMessageElement({
                            type: msg.message_type === 1 ? 'user' : 'bot',
                            content: msg.content,
                            timestamp: new Date(msg.created_at).toLocaleTimeString('zh-CN', {
                                hour: '2-digit',
                                minute: '2-digit'
                            }),
                            showUserName: msg.message_type === 1,  // 如果是用户消息则显示用户名
                            userName: msg.user_name  // 使用消息中的用户名
                        });
                        fragment.appendChild(messageElement);
                    });
                    
                    if (isInitial) {
                        messagesContainer.appendChild(fragment);
                        messagesContainer.scrollTop = messagesContainer.scrollHeight;
                    } else {
                        messagesContainer.insertBefore(fragment, messagesContainer.firstChild);
                        messagesContainer.scrollTop = messagesContainer.scrollHeight - scrollHeight;
                    }
                    
                    this.currentPage++;
                }
            }
        } catch (error) {
            console.error('加载历史消息失败:', error);
            const errorTip = document.createElement('div');
            errorTip.className = 'error-tip';
            errorTip.textContent = '加载历史消息失败，请重试';
            this.shadowRoot.getElementById('messages').insertBefore(
                errorTip,
                this.shadowRoot.getElementById('messages').firstChild
            );
        } finally {
            this.isLoading = false;
        }
    }

    // 初始化 WebSocket 连接
    initWebSocket() {
        if (this.ws) {
            this.ws.close();
        }

        try {
            // 在 URL 中添加 token 和用户名参数
            const wsUrl = new URL('wss://api.homingai.com/ws');
            wsUrl.searchParams.append('token', this.access_token);
            wsUrl.searchParams.append('user_name', this.currentUser || 'Unknown User');
            
            this.ws = new WebSocket(wsUrl.toString());
            
            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.wsReconnectAttempts = 0;
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleWebSocketMessage(data);
                } catch (error) {
                    console.error('Failed to parse WebSocket message:', error);
                }
            };

            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                this.handleWebSocketReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        } catch (error) {
            console.error('Failed to initialize WebSocket:', error);
            this.handleWebSocketReconnect();
        }
    }

    // 处理 WebSocket 消息
    handleWebSocketMessage(data) {
        // 根据消息类型处理不同的消息
        switch (data.message_type) {
            case 1: // 用户消息
                const messageElement = this.createMessageElement({
                    type: 'user',
                    content: data.content,
                    timestamp: new Date(data.created_at * 1000).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit'
                    }),
                    showUserName: true,  // 显示用户名
                    userName: data.user_name  // 使用服务器返回的用户名
                });
                
                const messagesContainer = this.shadowRoot.getElementById('messages');
                messagesContainer.appendChild(messageElement);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                break;
                
            case 2: // 机器人消息
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
                
            default:
                console.log('Unknown message type:', data.message_type);
        }
    }

    // 处理 WebSocket 重连
    handleWebSocketReconnect() {
        if (this.wsReconnectTimer) {
            clearTimeout(this.wsReconnectTimer);
        }

        if (this.wsReconnectAttempts < this.maxReconnectAttempts) {
            this.wsReconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.wsReconnectAttempts), 30000);
            
            this.wsReconnectTimer = setTimeout(() => {
                console.log(`Attempting to reconnect (${this.wsReconnectAttempts}/${this.maxReconnectAttempts})`);
                this.initWebSocket();
            }, delay);
        } else {
            console.error('Max reconnection attempts reached');
            this.addMessage('聊天室连接失败，请刷新页面重试', 'bot');
        }
    }
}

customElements.define('homingai-chat', HomingAIChat);