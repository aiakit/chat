# HomingAI Chat for Home Assistant

HomingAI Chat 是一个 Home Assistant 自定义组件，提供智能语音对话和文字聊天功能，让您可以通过自然语言与智能家居系统进行交互。

## 功能特点

- 🤖 智能对话：支持自然语言理解，可以进行智能家居控制和日常对话
- 🎙️ 语音交互：支持语音输入和语音播报
- 💬 文字聊天：支持文字输入方式
- 🏠 家居控制：可以通过对话控制智能家居设备
- 📱 移动适配：完美支持移动端和桌面端访问
- 🔒 安全可靠：使用授权token进行身份验证

## 安装方法

### HACS 安装

1. 确保已经安装了 [HACS](https://hacs.xyz/)
2. HACS > 溢出菜单 > 自定义存储库
[![Open your Home Assistant instance and show an integration.](https://my.home-assistant.io/badges/integration.svg)](https://my.home-assistant.io/redirect/integration/?domain=homingai_chat)

[![Open your Home Assistant instance and start setting up a new integration.](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=homingai_chat)

4. 类别选择：集成
5. 点击添加
6. 在 HACS 集成页面搜索 "HomingAI Chat"
7. 点击下载
8. 重启 Home Assistant


## 配置说明

1. 在 Home Assistant 的配置页面中添加集成
2. 搜索 "HomingAI Chat"
3. 按照提示完成配置
4. 配置完成后，可以在侧边栏找到 HomingAI Chat 入口

## 使用方法

### 文字对话
- 在输入框中输入文字
- 点击发送按钮或按回车键发送消息
- AI 将会理解您的需求并作出响应

### 语音对话
- 点击麦克风按钮开始录音
- 说出您的指令
- 松开按钮结束录音
- AI 将会语音回复（仅对简短回复进行语音播报）

### 智能家居控制示例
- "打开客厅的灯"
- "把温度调高两度"
- "现在几点了"
- "天气怎么样"

## ⚠️ 注意事项

- 首次使用需要授予麦克风权限
- 语音合成仅支持 20 字以内的回复
- 确保设备有可用的麦克风设备
- 建议在网络良好的环境下使用

## 🔧 故障排除

如果遇到问题，请先检查：

1. Home Assistant 版本是否满足要求
2. 浏览器是否支持麦克风访问
3. 网络连接是否正常
4. 查看 Home Assistant 日志中是否有错误信息

## 📝 问题反馈

如果您遇到任何问题或有改进建议，欢迎通过以下方式反馈：

- [提交 Issue](https://github.com/your-username/homingai-chat/issues)
- [发送邮件](mailto:your-email@example.com)

## 📄 许可证

本项目采用 Apache License2.0 许可证，详见 [LICENSE](LICENSE) 文件。

## 🔄 更新日志

### v1.0.0 (2024-12-28)
- ✨ 初始版本发布
- 🎉 支持语音对话功能
- 💬 支持文字聊天功能
- 🏠 支持智能家居控制
- 📱 优化移动端体验

## 🤝 贡献指南

欢迎提交 Pull Request 或创建 Issue。详见 [贡献指南](CONTRIBUTING.md)。

---

