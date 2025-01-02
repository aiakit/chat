"""Storage handler for HomingAI Chat."""
import logging
from homeassistant.helpers.storage import Store
from homeassistant.core import HomeAssistant
from typing import Dict, Any

_LOGGER = logging.getLogger(__name__)

class HomingAIStorage:
    """Class to handle storage for HomingAI Chat."""
    
    def __init__(self, hass: HomeAssistant, version: int = 1) -> None:
        """Initialize storage."""
        self.hass = hass
        self._store = Store(hass, version, "homingai_chat")
    
    async def async_save_auth_info(self, auth_info: Dict[str, Any]) -> None:
        """Save auth info to storage."""
        await self._store.async_save({"auth_info": auth_info})
    
    async def async_load_auth_info(self) -> Dict[str, Any]:
        """Load auth info from storage."""
        data = await self._store.async_load()
        return data.get("auth_info", {}) if data else {} 