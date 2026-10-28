"""Navigate only an already visible Hearth screen, reflecting observed state."""

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .client import screen_available
from .const import TAB_LABELS, TAB_MODULES
from .coordinator import HearthCoordinator
from .entity import HearthScreenEntity

PARALLEL_UPDATES = 1


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator = entry.runtime_data
    known: set[str] = set()

    @callback
    def add_screens() -> None:
        entities = []
        for screen in coordinator.data["screens"]:
            if screen["id"] not in known:
                known.add(screen["id"])
                entities.append(HearthTabSelect(coordinator, screen["id"]))
        if entities:
            async_add_entities(entities)

    add_screens()
    entry.async_on_unload(coordinator.async_add_listener(add_screens))


class HearthTabSelect(HearthScreenEntity, SelectEntity):
    _attr_name = "Visible tab"
    _attr_translation_key = "visible_tab"
    _attr_icon = "mdi:view-dashboard-outline"

    def __init__(self, coordinator: HearthCoordinator, screen_id: str) -> None:
        super().__init__(coordinator, screen_id)
        self._attr_unique_id = (
            f"{coordinator.data['household']['id']}_screen_{screen_id}_tab"
        )

    @property
    def options(self) -> list[str]:
        modules = self.coordinator.data.get("modules", {})
        approved = self.coordinator.data["permissions"].get("moduleIds", [])
        return [tab for tab in TAB_LABELS if modules.get(TAB_MODULES.get(tab), True)
                and (tab != "morning_routine" or "morningRoutine" in approved)]

    @property
    def available(self) -> bool:
        return super().available and screen_available(
            self.coordinator.data, self.screen
        )

    @property
    def current_option(self) -> str | None:
        # Cold start, pending commands and failed acknowledgement never supply
        # a default or the requested option in place of the observed route.
        option = self.screen["currentTab"] if self.available else None
        return option if option in self.options else None

    async def async_select_option(self, option: str) -> None:
        if option not in self.options:
            raise HomeAssistantError("That Hearth tab is turned off or unknown")
        if not self.available:
            raise HomeAssistantError("The Hearth screen is not visible and online")
        await self.coordinator.async_navigate(self.screen_id, option)
