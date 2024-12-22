from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.components.http import HomeAssistantView
from homeassistant.components.http.data_validator import RequestDataValidator
from aiohttp.web import Request, Response, HTTPFound
import voluptuous as vol

DOMAIN = "homingai_chat"

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = entry.data

    # 注册视图
    hass.http.register_view(HomingAIChatView)
    
    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data[DOMAIN].pop(entry.entry_id)
    return True

class HomingAIChatView(HomeAssistantView):
    url = "/homingai_chat"
    name = "homingai_chat"
    requires_auth = True

    async def get(self, request: Request):
        """Handle GET requests."""
        hass = request.app["hass"]
        
        # 获取保存的access_token
        entries = hass.config_entries.async_entries(DOMAIN)
        if not entries:
            return Response(status=404)
            
        access_token = entries[0].data.get("access_token")
        if not access_token:
            return Response(status=404)

        # 重定向到HomingAI Chat，并带上access_token
        return HTTPFound(f"https://homingai.com/chat?access_token={access_token}")