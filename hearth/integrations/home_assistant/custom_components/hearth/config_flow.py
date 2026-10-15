"""Adult-approved device connection. A long credential is never typed or shown."""

import asyncio
from collections.abc import Mapping
from secrets import token_urlsafe
from typing import Any
from uuid import uuid4

import probatio
from aiohttp import DummyCookieJar
from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.helpers.aiohttp_client import async_create_clientsession
from homeassistant.helpers.selector import (
    TextSelector,
    TextSelectorConfig,
    TextSelectorType,
)

from .client import HearthClient, HearthConnectionError, HearthError, normalize_url
from .const import CONF_ALLOW_LOOPBACK_HTTP, CONF_AUTOMATION_KEY, CONF_URL, DOMAIN


def _schema() -> probatio.Schema:
    return probatio.Schema(
        {
            probatio.Required(CONF_URL): TextSelector(
                TextSelectorConfig(type=TextSelectorType.URL)
            ),
            probatio.Optional(CONF_ALLOW_LOOPBACK_HTTP, default=False): bool,
        }
    )


class HearthConfigFlow(ConfigFlow, domain=DOMAIN):
    """One config entry per stable household. Existing stored keys keep working."""

    VERSION = 1
    _pairing_task: asyncio.Task | None = None
    _pairing_code: str = ""
    _reauth: bool = False

    async def _start(self, user_input: dict[str, Any]) -> None:
        allow_http = user_input.get(CONF_ALLOW_LOOPBACK_HTTP, False)
        if type(allow_http) is not bool:
            raise HearthError("Invalid loopback HTTP option")
        url = normalize_url(user_input[CONF_URL], allow_loopback_http=allow_http)
        data = {
            CONF_URL: url,
            CONF_AUTOMATION_KEY: f"ha_{token_urlsafe(32)}",
            CONF_ALLOW_LOOPBACK_HTTP: allow_http,
        }
        session = async_create_clientsession(
            self.hass,
            verify_ssl=True,
            auto_cleanup=False,
            cookie_jar=DummyCookieJar(),
            trust_env=False,
        )
        client = HearthClient(
            session, url, data[CONF_AUTOMATION_KEY], allow_loopback_http=allow_http
        )
        try:
            pairing = await client.async_start_pairing(f"ha_pair_{uuid4().hex}")
        except BaseException:
            session.detach()
            raise

        async def wait():
            try:
                state = await client.async_wait_for_pairing(
                    pairing["id"], pairing["interval"]
                )
                return state["household"], data
            finally:
                session.detach()

        self._pairing_code = pairing["code"]
        self._pairing_task = self.hass.async_create_task(wait())

    async def _form(
        self, step: str, user_input: dict[str, Any] | None
    ) -> ConfigFlowResult:
        errors = {}
        if user_input is not None:
            try:
                await self._start(user_input)
            except HearthConnectionError:
                errors["base"] = "cannot_connect"
            except HearthError:
                errors["base"] = "invalid_bridge"
            else:
                return await self.async_step_pair()
        schema = _schema()
        if step == "reauth_confirm":
            entry = self._get_reauth_entry()
            schema = self.add_suggested_values_to_schema(
                schema,
                {
                    CONF_URL: entry.data[CONF_URL],
                    CONF_ALLOW_LOOPBACK_HTTP: entry.data.get(
                        CONF_ALLOW_LOOPBACK_HTTP, False
                    ),
                },
            )
        return self.async_show_form(step_id=step, data_schema=schema, errors=errors)

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        return await self._form("user", user_input)

    async def async_step_pair(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        if self._pairing_task is None:
            return self.async_abort(reason="pairing_failed")
        if not self._pairing_task.done():
            # HA cancels progress_task when the dialog closes, releasing this flow's session.
            return self.async_show_progress(
                step_id="pair",
                progress_action="approve",
                progress_task=self._pairing_task,
                description_placeholders={"code": self._pairing_code},
            )
        return self.async_show_progress_done(next_step_id="finish")

    async def async_step_finish(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        task = self._pairing_task
        self._pairing_task = None
        self._pairing_code = ""
        if task is None or task.cancelled():
            return self.async_abort(reason="pairing_failed")
        try:
            household, data = task.result()
        except HearthError:
            return self.async_abort(reason="pairing_failed")
        await self.async_set_unique_id(household["id"])
        if self._reauth:
            self._abort_if_unique_id_mismatch()
            return self.async_update_reload_and_abort(
                self._get_reauth_entry(), data_updates=data
            )
        self._abort_if_unique_id_configured()
        return self.async_create_entry(title=household["name"], data=data)

    async def async_step_reauth(
        self, entry_data: Mapping[str, Any]
    ) -> ConfigFlowResult:
        self._reauth = True
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        self._reauth = True
        return await self._form("reauth_confirm", user_input)
