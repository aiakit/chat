"""Config flow for HomingAI Chat integration."""
from __future__ import annotations

from typing import Any

from homeassistant import config_entries
import voluptuous as vol

DOMAIN = "homingai_chat"

DATA_SCHEMA = vol.Schema({
    vol.Required("access_token"): str,
})

class HomingAIChatConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for HomingAI Chat."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        """Handle the initial step."""
        errors = {}

        if user_input is not None:
            # 检查是否已经配置
            await self.async_set_unique_id(DOMAIN)
            self._abort_if_unique_id_configured()

            return self.async_create_entry(
                title="HomingAI Chat",
                data=user_input
            )

        return self.async_show_form(
            step_id="user",
            data_schema=DATA_SCHEMA,
            errors=errors,
        )