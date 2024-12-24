from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.components.frontend import async_register_built_in_panel
from aiohttp import web
import logging

DOMAIN = "homingai_chat"
_LOGGER = logging.getLogger(__name__)

async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the HomingAI Chat component."""
    
    return True

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up HomingAI Chat from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = entry.data
    
    # 注册面板
    async_register_built_in_panel(
        hass,
        "iframe",
        "HomingAI Chat",
        "mdi:chat",
        DOMAIN,
        {
            "url": f"https://homingai.com/chat?access_token={entry.data.get('access_token', '')}",
            "_panel_custom": {
                "name": "iframe-panel",
                "embed_iframe": True,
                "trust_external": True
            }
        }
    )
    
    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data[DOMAIN].pop(entry.entry_id)
    return True