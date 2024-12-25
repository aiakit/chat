"""The HomingAI Chat integration."""
import logging
import aiohttp
from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.components.frontend import async_register_built_in_panel
from homeassistant.components.http import HomeAssistantView

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

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
                <meta name="apple-mobile-web-app-status-bar-style" content="black">
                <title>HomingAI Chat</title>
                <style>
                    body, html {{
                        margin: 0;
                        padding: 0;
                        height: 100%;
                        width: 100%;
                        overflow: hidden;
                        -webkit-overflow-scrolling: touch;
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
                    allow="microphone; camera; autoplay; fullscreen"
                    sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-modals"
                    webkit-playsinline
                    playsinline
                ></iframe>
                <script>
                    function isIOS() {{
                        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
                    }}

                    function requestMicrophoneAccess() {{
                        return navigator.mediaDevices.getUserMedia({{
                            audio: {{
                                echoCancellation: true,
                                noiseSuppression: true,
                                autoGainControl: true
                            }}
                        }});
                    }}

                    if (isIOS()) {{
                        // iOS 设备上的特殊处理
                        document.addEventListener('touchstart', function() {{
                            requestMicrophoneAccess()
                                .then(function(stream) {{
                                    stream.getTracks().forEach(track => track.stop());
                                    console.log('Microphone access granted');
                                }})
                                .catch(function(error) {{
                                    console.error('Microphone access error:', error);
                                }});
                        }}, {{once: true}});
                    }}

                    window.addEventListener('message', function(event) {{
                        if (event.origin === 'https://homingai.com') {{
                            if (event.data.type === 'requestMicrophonePermission') {{
                                requestMicrophoneAccess()
                                    .then(function(stream) {{
                                        event.source.postMessage({{
                                            type: 'microphonePermissionGranted',
                                            stream: stream
                                        }}, '*');
                                    }})
                                    .catch(function(error) {{
                                        event.source.postMessage({{
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

    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    if DOMAIN in hass.data:
        # 移除面板
        hass.components.frontend.async_remove_panel(DOMAIN)
        if entry.entry_id in hass.data[DOMAIN]:
            del hass.data[DOMAIN][entry.entry_id]
        if not hass.data[DOMAIN]:
            del hass.data[DOMAIN]
    return True