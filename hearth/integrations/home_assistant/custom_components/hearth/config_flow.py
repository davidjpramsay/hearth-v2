"""Validate the automation key without ever echoing it into forms or errors."""

from collections.abc import Mapping
from typing import Any

import probatio
from aiohttp import DummyCookieJar
from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.helpers.aiohttp_client import async_create_clientsession
from homeassistant.helpers.selector import (
    TextSelector,
    TextSelectorConfig,
    TextSelectorType,
)

from .client import (
    HearthAuthError,
    HearthClient,
    HearthConnectionError,
    HearthError,
    normalize_url,
)
from .const import CONF_ALLOW_LOOPBACK_HTTP, CONF_AUTOMATION_KEY, CONF_URL, DOMAIN


def _schema() -> probatio.Schema:
    return probatio.Schema(
        {
            probatio.Required(CONF_URL): TextSelector(
                TextSelectorConfig(type=TextSelectorType.URL)
            ),
            probatio.Required(probatio.Secret(CONF_AUTOMATION_KEY)): TextSelector(
                TextSelectorConfig(type=TextSelectorType.PASSWORD, autocomplete="off"),
            ),
            probatio.Optional(CONF_ALLOW_LOOPBACK_HTTP, default=False): bool,
        }
    )


class HearthConfigFlow(ConfigFlow, domain=DOMAIN):
    """One config entry per stable server-provided household ID."""

    VERSION = 1

    async def _validate(
        self, user_input: dict[str, Any]
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        allow_http = user_input.get(CONF_ALLOW_LOOPBACK_HTTP, False)
        if type(allow_http) is not bool:
            raise HearthError("Invalid loopback HTTP option")
        url = normalize_url(user_input[CONF_URL], allow_loopback_http=allow_http)
        # A flow owns this session, so detach it in finally. Never borrow a
        # cookie-bearing shared browser/provider session for this authority.
        session = async_create_clientsession(
            self.hass,
            verify_ssl=True,
            auto_cleanup=False,
            cookie_jar=DummyCookieJar(),
            trust_env=False,
        )
        try:
            state = await HearthClient(
                session,
                url,
                user_input[CONF_AUTOMATION_KEY],
                allow_loopback_http=allow_http,
            ).async_state()
        finally:
            session.detach()
        return state["household"], {
            CONF_URL: url,
            CONF_AUTOMATION_KEY: user_input[CONF_AUTOMATION_KEY],
            CONF_ALLOW_LOOPBACK_HTTP: allow_http,
        }

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        errors = {}
        if user_input is not None:
            try:
                household, data = await self._validate(user_input)
            except HearthAuthError:
                errors["base"] = "invalid_auth"
            except HearthConnectionError:
                errors["base"] = "cannot_connect"
            except HearthError:
                errors["base"] = "invalid_bridge"
            else:
                await self.async_set_unique_id(household["id"])
                self._abort_if_unique_id_configured()
                return self.async_create_entry(title=household["name"], data=data)
        return self.async_show_form(
            step_id="user", data_schema=_schema(), errors=errors
        )

    async def async_step_reauth(
        self, entry_data: Mapping[str, Any]
    ) -> ConfigFlowResult:
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        errors = {}
        if user_input is not None:
            try:
                household, data = await self._validate(user_input)
            except HearthAuthError:
                errors["base"] = "invalid_auth"
            except HearthConnectionError:
                errors["base"] = "cannot_connect"
            except HearthError:
                errors["base"] = "invalid_bridge"
            else:
                await self.async_set_unique_id(household["id"])
                self._abort_if_unique_id_mismatch()
                return self.async_update_reload_and_abort(
                    self._get_reauth_entry(), data_updates=data
                )
        entry = self._get_reauth_entry()
        return self.async_show_form(
            step_id="reauth_confirm",
            data_schema=self.add_suggested_values_to_schema(
                _schema(),
                {
                    CONF_URL: entry.data[CONF_URL],
                    CONF_ALLOW_LOOPBACK_HTTP: entry.data.get(
                        CONF_ALLOW_LOOPBACK_HTTP, False
                    ),
                },
            ),
            errors=errors,
        )
