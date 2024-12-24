"""Config flow for HomingAI Chat integration."""
from __future__ import annotations

import logging
from typing import Any
import voluptuous as vol
import aiohttp
from urllib.parse import urlparse
import webbrowser

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult
import homeassistant.helpers.config_validation as cv
from homeassistant.helpers.network import get_url

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

API_GET_CODE = "https://api.homingai.com/ha/home/oauthcode"
API_VERIFY_AUTH = "https://api.homingai.com/ha/home/gettoken"
AUTH_URL = "https://homingai.com/oauth"

class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for HomingAI Chat."""

    VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        """Get the options flow for this handler."""
        return OptionsFlowHandler(config_entry)

    def __init__(self):
        """Initialize flow."""
        self.code = None
        self.state = None

    def _get_external_url(self) -> str:
        """Get external URL."""
        try:
            # Try to get external URL from HA configuration
            external_url = get_url(self.hass, allow_internal=False)
            _LOGGER.debug("Got external URL from HA: %s", external_url)
            
            if external_url:
                parsed = urlparse(external_url)
                # If it's not a local address, use this URL
                if not any(
                    parsed.hostname.startswith(prefix) 
                    for prefix in ('127.', '192.168.', '10.', 'localhost')
                ):
                    if parsed.port and parsed.port not in (80, 443):
                        return f"{parsed.hostname}:{parsed.port}"
                    return parsed.hostname

            # Try to get domain from request context
            if hasattr(self, 'context') and 'request' in self.context:
                request = self.context['request']
                
                # Check X-Forwarded-Host first (proxy scenarios)
                if 'X-Forwarded-Host' in request.headers:
                    return request.headers['X-Forwarded-Host'].split(':')[0]
                
                # Check Origin header
                if 'Origin' in request.headers:
                    origin = urlparse(request.headers['Origin'])
                    return origin.netloc or origin.hostname
                
                # Check Host header
                if 'Host' in request.headers:
                    return request.headers['Host'].split(':')[0]
                
                # Last resort: try to get from request URL
                if request.url:
                    parsed = urlparse(str(request.url))
                    if parsed.hostname and not any(
                        parsed.hostname.startswith(prefix)
                        for prefix in ('127.', '192.168.', '10.', 'localhost')
                    ):
                        if parsed.port and parsed.port not in (80, 443):
                            return f"{parsed.hostname}:{parsed.port}"
                        return parsed.hostname
            
            _LOGGER.warning("Could not determine external URL")
            return ""
            
        except Exception as err:
            _LOGGER.error("Failed to get external URL: %s", err)
            return ""

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle the initial step."""
        errors = {}
        auth_url = None

        # 只在首次加载或没有code时获取授权URL
        if not hasattr(self, 'code') or not self.code:
            try:
                domain = self._get_external_url()
                if not domain:
                    domain = "homeassistant.local:8123"
                _LOGGER.debug("Using domain for auth: %s", domain)
                async with aiohttp.ClientSession() as session:
                    request_data = {
                        "state": domain
                    }
                    
                    async with session.post(
                        API_GET_CODE,
                        json=request_data
                    ) as response:
                        result = await response.json()
                        if result.get("code") == 200:
                            self.code = result["data"]["code"]
                            self.state = result["data"]["state"]
                        else:
                            errors["base"] = "auth_error"
            except Exception as err:
                _LOGGER.error("Failed to get auth code: %s", err)
                errors["base"] = "auth_error"

        # 如果有code，生成auth_url
        if hasattr(self, 'code') and self.code:
            auth_url = f"{AUTH_URL}?code={self.code}&state={self.state}"

        if user_input is not None:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        API_VERIFY_AUTH,
                        json={
                            "code": self.code,
                            "state": self.state
                        }
                    ) as response:
                        result = await response.json()
                        if result.get("code") == 200:
                            return self.async_create_entry(
                                title="HomingAI Chat",
                                data={
                                    "access_token": result["data"]["access_token"]
                                }
                            )
                        else:
                            errors["base"] = "auth_verify_failed"
            except Exception as err:
                _LOGGER.error("Failed to verify auth: %s", err)
                errors["base"] = "auth_verify_failed"

        # 使用按钮样式的schema
        schema = vol.Schema({
            vol.Optional("submit", description="授权完成"): bool,
            vol.Optional("cancel", description="去授权"): bool,
        })

        risks_text = """
请注意以下风险提示：

1. 您的用户信息和设备信息将会存储在您的 Home Assistant 系统中，我们无法保证 Home Assistant 存储机制的安全性。您需要负责防止您的信息被窃取。

2. 此集成由HomingAI开发维护，可能会出现稳定性问题或其它问题，使用此集成遇到相关问题时，您应当向开源社区寻求帮助。

3. 在使用此集成前，请仔细阅读README。

4. 为了用户能够稳定地使用集成，避免接口被滥用，此集成仅允许在 Home Assistant 使用，详情请参考LICENSE。

[点击此处完成授权]({auth_url})
"""

        return self.async_show_form(
            step_id="user",
            data_schema=schema,
            errors=errors,
            description_placeholders={
                "risks": risks_text.format(auth_url=auth_url) if auth_url else risks_text
            }
        )