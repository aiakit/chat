from homeassistant import config_entries
from homeassistant.core import HomeAssistant
import voluptuous as vol

DOMAIN = "homingai_chat"
DATA_SCHEMA = vol.Schema({
    vol.Required("access_token"): str,
})

class HomingAIChatConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1
    
    async def async_step_user(self, user_input=None):
        errors = {}
        
        if user_input is not None:
            # 保存access_token
            return self.async_create_entry(
                title="HomingAI Chat",
                data={"access_token": user_input["access_token"]}
            )

        return self.async_show_form(
            step_id="user",
            data_schema=DATA_SCHEMA,
            errors=errors,
        )