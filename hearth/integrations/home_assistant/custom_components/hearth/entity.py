"""Stable household and child-screen device identities."""

from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .client import JsonObject, screen_by_id
from .const import DOMAIN
from .coordinator import HearthCoordinator


class HearthEntity(CoordinatorEntity[HearthCoordinator]):
    _attr_has_entity_name = True

    @property
    def device_info(self) -> DeviceInfo:
        household = self.coordinator.data["household"]
        return DeviceInfo(
            identifiers={(DOMAIN, household["id"])},
            name=household["name"],
            manufacturer="Hearth",
            model="Hearth server",
        )


class HearthScreenEntity(HearthEntity):
    def __init__(self, coordinator: HearthCoordinator, screen_id: str) -> None:
        super().__init__(coordinator, context=screen_id)
        self.screen_id = screen_id

    @property
    def screen(self) -> JsonObject | None:
        return screen_by_id(self.coordinator.data, self.screen_id)

    @property
    def device_info(self) -> DeviceInfo:
        household_id = self.coordinator.data["household"]["id"]
        screen = self.screen
        return DeviceInfo(
            identifiers={(DOMAIN, f"{household_id}_screen_{self.screen_id}")},
            name=screen["name"] if screen else "Hearth screen",
            manufacturer="Hearth",
            model="Hearth screen",
            via_device=(DOMAIN, household_id),
        )
