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
    }

    async connectedCallback() {
        // 读取 token 文件
        try {
            const response = await fetch(`${this.basePath}/access_token.txt`);
            if (response.ok) {
                this.access_token = await response.text();
            } else {
                throw new Error('Failed to load token file');
            }
        } catch (error) {
            console.error('Failed to get access token:', error);
        }
        
        this.render();
        this.initializeEventListeners();
    }

    render() {
        const micClosePath = `${this.basePath}/mic_close.png`;
        const micWorkingPath = `${this.basePath}/mic_woking.png`;

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    padding: 16px;
                }

                .chat-container {
                    max-width: 800px;
                    margin: 0 auto;
                    background: var(--card-background-color, #fff);
                    border-radius: 12px;
                    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
                    height: calc(100vh - 120px);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }

                .chat-messages {
                    flex: 1;
                    overflow-y: auto;
                    padding: 20px;
                    scroll-behavior: smooth;
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
                    display: flex;
                    padding: 16px 20px;
                    border-top: 1px solid rgba(0, 0, 0, 0.08);
                    align-items: center;
                    background: #ffffff;
                    position: relative;
                    gap: 12px;
                }

                .input-wrapper {
                    flex: 1;
                    position: relative;
                    background: #f8f9fa;
                    transition: all 0.3s ease;
                }

                .input-wrapper:focus-within {
                    background: #ffffff;
                    box-shadow: 0 0 0 2px rgba(138, 43, 226, 0.1);
                }

                #messageInput {
                    width: 100%;
                    padding: 12px 16px;
                    border: 1px solid #e0e0e0;
                    font-size: 15px;
                    line-height: 1.5;
                    color: #333;
                    background: transparent;
                    transition: all 0.3s ease;
                    box-sizing: border-box;
                    outline: none;
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
    }

    initializeEventListeners() {
        const input = this.shadowRoot.getElementById('messageInput');
        const sendButton = this.shadowRoot.getElementById('sendButton');
        const recordButton = this.shadowRoot.getElementById('recordButton');
        const inputContainer = this.shadowRoot.querySelector('.input-container');

        const sendMessage = () => {
            const message = input.value.trim();
            if (message) {
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
        });

        sendButton.addEventListener('click', sendMessage);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });

        // 录音相关事件监听
        recordButton.addEventListener('click', () => this.toggleRecording());
        document.addEventListener('click', (e) => {
            if (this.isRecording && !recordButton.contains(e.target)) {
                this.stopRecording();
            }
        });
    }

    async toggleRecording() {
        if (!this.isRecording) {
            await this.startRecording();
        } else {
            await this.stopRecording();
        }
    }

    async startRecording() {
        try {
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
                alert('请在系统设置中允许 Home Assistant 访问麦克风');
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
                        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aW1lc3RhbXAiOiIyMDI0LTEyLTI0VDE4OjA1OjE3KzA4OjAwIiwidXNlcl9pZCI6IjY3NGM3YzM0YzkwZjJmNmE1M2NiNWFkNSIsImlzcyI6ImhhIiwic3ViIjoiYXNzaXN0IG9wZW4iLCJhdWQiOlsiaGEgdXNlciJdLCJleHAiOjQ4NDU0MzQ3MTcsIm5iZiI6MTczNTAzNDcxNywiaWF0IjoxNzM1MDM0NzE3LCJqdGkiOiI3MGNmNjIzMC1mZmUzLTRmZGQtODAzYS0xMjhlZmExMWJhYTYifQ.n5k62EG59TwMCA825XAsl3Fs6cvTBSO9coJtnjljXhY',
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
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', `${type}-message`);
        
        // 添加消息内容
        const messageContent = document.createElement('div');
        messageContent.classList.add('message-content');
        messageContent.textContent = text;
        messageElement.appendChild(messageContent);
        
        // 添加时间戳
        const timestamp = document.createElement('div');
        timestamp.classList.add('message-time');
        timestamp.textContent = new Date().toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });
        messageElement.appendChild(timestamp);
        
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
        try {
            // 1. 发送聊天消息
            const chatResponse = await fetch('https://api.homingai.com/ha/home/chat', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aW1lc3RhbXAiOiIyMDI0LTEyLTI0VDE4OjA1OjE3KzA4OjAwIiwidXNlcl9pZCI6IjY3NGM3YzM0YzkwZjJmNmE1M2NiNWFkNSIsImlzcyI6ImhhIiwic3ViIjoiYXNzaXN0IG9wZW4iLCJhdWQiOlsiaGEgdXNlciJdLCJleHAiOjQ4NDU0MzQ3MTcsIm5iZiI6MTczNTAzNDcxNywiaWF0IjoxNzM1MDM0NzE3LCJqdGkiOiI3MGNmNjIzMC1mZmUzLTRmZGQtODAzYS0xMjhlZmExMWJhYTYifQ.n5k62EG59TwMCA825XAsl3Fs6cvTBSO9coJtnjljXhY',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    content: message
                })
            });

            if (!chatResponse.ok) {
                throw new Error(`聊天请求失败: ${chatResponse.status}`);
            }

            const chatResult = await chatResponse.json();
            
            if (chatResult.code === 200 && chatResult.msg) {
                // 显示文本消息
                this.addMessage(chatResult.msg, 'bot');

                // 只有在需要语音合成时才请求 TTS
                if (needTTS) {
                    try {
                        const ttsResponse = await fetch('https://api.homingai.com/ha/home/tts', {
                            method: 'POST',
                            headers: {
                                'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aW1lc3RhbXAiOiIyMDI0LTEyLTI0VDE4OjA1OjE3KzA4OjAwIiwidXNlcl9pZCI6IjY3NGM3YzM0YzkwZjJmNmE1M2NiNWFkNSIsImlzcyI6ImhhIiwic3ViIjoiYXNzaXN0IG9wZW4iLCJhdWQiOlsiaGEgdXNlciJdLCJleHAiOjQ4NDU0MzQ3MTcsIm5iZiI6MTczNTAzNDcxNywiaWF0IjoxNzM1MDM0NzE3LCJqdGkiOiI3MGNmNjIzMC1mZmUzLTRmZGQtODAzYS0xMjhlZmExMWJhYTYifQ.n5k62EG59TwMCA825XAsl3Fs6cvTBSO9coJtnjljXhY',
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
                            const audioData = this.base64ToBuffer(ttsResult.body);
                            const audioBlob = new Blob([audioData], { type: 'audio/wav' });
                            const audioUrl = URL.createObjectURL(audioBlob);
                            this.playAudio(audioUrl);
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

    // 添加音频播放方法
    playAudio(audioUrl) {
        const audio = new Audio();
        audio.src = audioUrl;
        
        // 音频加载完成后播放
        audio.oncanplaythrough = () => {
            audio.play().catch(error => {
                console.error('Audio playback error:', error);
            });
        };

        // 播放结束后清理资源
        audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
        };

        // 错误处理
        audio.onerror = (error) => {
            console.error('Audio error:', error);
            URL.revokeObjectURL(audioUrl);
        };
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
}

customElements.define('homingai-chat', HomingAIChat);