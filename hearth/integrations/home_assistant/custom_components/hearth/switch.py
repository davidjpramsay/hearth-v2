"""Household module availability. Control remains usable while its feature is off."""

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import MODULE_LABELS
from .coordinator import HearthCoordinator
from .entity import HearthEntity

PARALLEL_UPDATES = 1


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator = entry.runtime_data
    added = False

    @callback
    def add_switches() -> None:
        nonlocal added
        if not added and coordinator.data["permissions"].get("controlModules", False):
            added = True
            async_add_entities(
                [HearthModuleSwitch(coordinator, module) for module in MODULE_LABELS]
            )

    add_switches()
    entry.async_on_unload(coordinator.async_add_listener(add_switches))


class HearthModuleSwitch(HearthEntity, SwitchEntity):
    _attr_icon = "mdi:toggle-switch-outline"
    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, coordinator: HearthCoordinator, module_id: str) -> None:
        super().__init__(coordinator)
        self.module_id = module_id
        self._attr_name = f"{MODULE_LABELS[module_id]} module"
        self._attr_unique_id = (
            f"{coordinator.data['household']['id']}_module_{module_id}"
        )

    @property
    def available(self) -> bool:
        return super().available and self.coordinator.data["permissions"].get(
            "controlModules", False
        )

    @property
    def is_on(self) -> bool | None:
        return (
            self.coordinator.data["modules"][self.module_id] if self.available else None
        )

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self._set(True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self._set(False)

    async def _set(self, enabled: bool) -> None:
        if not self.available:
            raise HomeAssistantError(
                "Approve module control on an adult Hearth phone first"
            )
        await self.coordinator.async_set_module(self.module_id, enabled)
