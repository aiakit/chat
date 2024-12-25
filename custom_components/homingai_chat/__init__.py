"""The HomingAI Chat integration."""
import logging
import asyncio
import aiohttp
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.config_entries import ConfigEntry
from homeassistant.components.frontend import async_register_built_in_panel
from homeassistant.components.http import HomeAssistantView
import homeassistant.helpers.config_validation as cv
import voluptuous as vol

from .const import DOMAIN, SERVICE_VOICE_CHAT

_LOGGER = logging.getLogger(__name__)

# 服务schema定义
VOICE_CHAT_SCHEMA = vol.Schema({
    vol.Required("audio_data"): cv.string,
})

class HomingAIChatView(HomeAssistantView):
    """Handle HomingAI Chat web interface."""

    requires_auth = False
    name = "homingai_chat"
    url = "/homingai_chat"

    async def get(self, request):
        """Handle HomingAI Chat interface."""
        html = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
                <meta name="mobile-web-app-capable" content="yes">
                <meta name="apple-mobile-web-app-capable" content="yes">
                <title>HomingAI Chat</title>
                <style>
                    body, html {{
                        margin: 0;
                        padding: 0;
                        height: 100%;
                        width: 100%;
                        overflow: hidden;
                    }}
                    iframe {{
                        width: 100%;
                        height: 100%;
                        border: none;
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                    }}
                </style>
            </head>
            <body>
                <iframe 
                    src="https://homingai.com/chat"
                    allow="microphone; camera; fullscreen; display-capture; clipboard-read; clipboard-write; geolocation; web-share"
                    sandbox="allow-forms allow-popups allow-pointer-lock allow-same-origin allow-scripts allow-modals allow-downloads allow-presentation allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
                ></iframe>
                <script>
                    // 处理iframe通信
                    window.addEventListener('message', function(event) {{
                        if (event.origin === 'https://homingai.com') {{
                            // 处理来自iframe的消息
                            if (event.data.type === 'requestMicrophonePermission') {{
                                navigator.mediaDevices.getUserMedia({{ audio: true }})
                                    .then(function(stream) {{
                                        document.querySelector('iframe').contentWindow.postMessage({{
                                            type: 'microphonePermissionGranted',
                                            stream: stream
                                        }}, '*');
                                    }})
                                    .catch(function(error) {{
                                        document.querySelector('iframe').contentWindow.postMessage({{
                                            type: 'microphonePermissionDenied',
                                            error: error.message
                                        }}, '*');
                                    }});
                            }}
                        }}
                    }});
                </script>
            </body>
            </html>
        """
        return aiohttp.web.Response(text=html, content_type="text/html")

async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the HomingAI Chat component."""
    return True

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up HomingAI Chat from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = {}
    
    # 注册自定义视图
    hass.http.register_view(HomingAIChatView())
    
    # 注册iframe面板
    async_register_built_in_panel(
        hass,
        "iframe",
        "HomingAI Chat",
        "mdi:chat",
        DOMAIN,
        {
            "url": f"/homingai_chat?access_token={entry.data.get('access_token', '')}",
            "require_admin": False
        }
    )

    # 注册语音聊天服务
    async def handle_voice_chat(call: ServiceCall):
        """处理语音聊天服务调用."""
        audio_data = call.data["audio_data"]
        
        try:
            async with aiohttp.ClientSession() as session:
                # 发送音频数据到语音识别服务
                async with session.post(
                    "https://api.homingai.com/ha/home/stt",
                    data=audio_data,
                    headers={
                        "Content-Type": "audio/wav",
                        "Authorization": f"Bearer {entry.data.get('access_token')}"
                    }
                ) as response:
                    result = await response.json()
                    
                    if result.get("code") == 200:
                        text = result.get("text", "")
                        if text:
                            # 发送识别出的文本到聊天服务
                            async with session.post(
                                "https://api.homingai.com/ha/home/chat",
                                json={"content": text},
                                headers={
                                    "Authorization": f"Bearer {entry.data.get('access_token')}"
                                }
                            ) as chat_response:
                                chat_result = await chat_response.json()
                                if chat_result.get("code") == 200:
                                    return chat_result.get("msg", "")
                                else:
                                    _LOGGER.error("Chat error: %s", chat_result)
                                    raise Exception("Chat failed")
                        else:
                            raise Exception("No text recognized")
                    else:
                        _LOGGER.error("STT error: %s", result)
                        raise Exception("Speech recognition failed")
                        
        except Exception as err:
            _LOGGER.error("Voice chat error: %s", err)
            raise Exception(f"Voice chat failed: {err}")

    hass.services.async_register(
        DOMAIN,
        SERVICE_VOICE_CHAT,
        handle_voice_chat,
        schema=VOICE_CHAT_SCHEMA
    )

    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    if DOMAIN in hass.data:
        # 移除服务
        hass.services.async_remove(DOMAIN, SERVICE_VOICE_CHAT)
        
        # 移除面板
        hass.components.frontend.async_remove_panel(DOMAIN)
        if entry.entry_id in hass.data[DOMAIN]:
            del hass.data[DOMAIN][entry.entry_id]
        if not hass.data[DOMAIN]:
            del hass.data[DOMAIN]
    return True