"""The HomingAI Chat integration."""
import os
from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.components.http import HomeAssistantView
from .const import DOMAIN

async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the HomingAI Chat component."""
    return True

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up HomingAI Chat from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    
    # Register static path for javascript and token file
    hass.http.register_static_path(
        "/homingai_chat",
        os.path.join(os.path.dirname(__file__), "custom_panels"),
        cache_headers=False
    )
    
    # Register the panel
    hass.components.frontend.async_register_built_in_panel(
        component_name="custom",
        sidebar_title="HomingAI Chat",
        sidebar_icon="mdi:chat",
        frontend_url_path="homingai-chat",
        config={
            "_panel_custom": {
                "name": "homingai-chat",
                "embed_iframe": True,
                "trust_external": False,
                "js_url": "/homingai_chat/homingai_chat.js",
                "module_url": "/homingai_chat/homingai_chat.js",
            },
            "homingai_token": entry.data.get("access_token", ""),
        },
        require_admin=False,
    )

    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    # Remove the panel
    try:
        hass.components.frontend.async_remove_panel("homingai-chat")
    except Exception as e:
        pass
    return True