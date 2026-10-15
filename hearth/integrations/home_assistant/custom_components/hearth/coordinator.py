"""One ten-second poll shared by every Hearth entity."""

import asyncio
import logging
from datetime import datetime, timedelta

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed, HomeAssistantError
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .client import (
    HearthAuthError,
    HearthClient,
    HearthConnectionError,
    HearthError,
    JsonObject,
)
from .const import DOMAIN, POLL_SECONDS

_LOGGER = logging.getLogger(__name__)


class HearthCoordinator(DataUpdateCoordinator[JsonObject]):
    """Serialize state reads with command acknowledgement, without optimism."""

    def __init__(
        self, hass: HomeAssistant, entry: ConfigEntry, client: HearthClient
    ) -> None:
        super().__init__(
            hass,
            _LOGGER,
            config_entry=entry,
            name=DOMAIN,
            update_interval=timedelta(seconds=POLL_SECONDS),
            always_update=True,
        )
        self.entry = entry
        self.client = client
        self._state_lock = asyncio.Lock()

    async def _async_update_data(self) -> JsonObject:
        async with self._state_lock:
            try:
                return await self.client.async_state()
            except HearthAuthError:
                raise ConfigEntryAuthFailed(
                    "Hearth requires a new automation key"
                ) from None
            except HearthError:
                raise UpdateFailed("Could not refresh the Hearth bridge") from None

    def _auth_failed(self) -> None:
        self.async_set_update_error(
            ConfigEntryAuthFailed("Hearth requires a new automation key")
        )
        self.entry.async_start_reauth(self.hass)

    async def async_navigate(self, screen_id: str, tab: str) -> None:
        async with self._state_lock:
            try:
                await self.client.async_navigate_and_wait(
                    screen_id, tab, self.async_set_updated_data
                )
            except HearthAuthError:
                self._auth_failed()
                raise HomeAssistantError("Hearth requires reauthentication") from None
            except HearthConnectionError:
                self.async_set_update_error(
                    UpdateFailed("Could not refresh the Hearth bridge")
                )
                raise HomeAssistantError("Could not reach the Hearth screen") from None
            except HearthError as err:
                raise HomeAssistantError(str(err)) from None

    async def async_calendar(self, start: datetime, end: datetime) -> JsonObject:
        try:
            return await self.client.async_calendar(start, end)
        except HearthAuthError:
            self._auth_failed()
            raise HomeAssistantError("Hearth requires reauthentication") from None
        except HearthError as err:
            raise HomeAssistantError(str(err)) from None

    async def async_set_chore_completion(
        self,
        occurrence_id: str,
        local_date: str,
        is_completed: bool,
        completion_id: str | None,
    ) -> None:
        """Keep the observed list until a validated command and state refresh succeed."""
        async with self._state_lock:
            try:
                await self.client.async_set_chore_completion(
                    occurrence_id,
                    local_date,
                    is_completed,
                    completion_id,
                )
                self.async_set_updated_data(await self.client.async_state())
            except HearthAuthError:
                self._auth_failed()
                raise HomeAssistantError("Hearth requires reauthentication") from None
            except HearthError:
                # A lost response may still have applied. Do not show an optimistic checkbox.
                self.async_set_update_error(
                    UpdateFailed("Refresh Hearth before changing more chores")
                )
                raise HomeAssistantError(
                    "Chore change could not be confirmed. Refresh Hearth before retrying."
                ) from None
