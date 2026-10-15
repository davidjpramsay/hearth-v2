"""Read-only counts; chore titles are attributes, never entity state."""

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .client import JsonObject
from .coordinator import HearthCoordinator
from .entity import HearthEntity

PARALLEL_UPDATES = 0


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_add_entities(
        HearthChoreCount(entry.runtime_data, kind) for kind in ("open", "completed")
    )


class HearthChoreCount(HearthEntity, SensorEntity):
    _attr_icon = "mdi:checkbox-marked-outline"
    _attr_native_unit_of_measurement = "chores"

    def __init__(self, coordinator: HearthCoordinator, kind: str) -> None:
        super().__init__(coordinator)
        self.kind = kind
        self._attr_name = "Open chores" if kind == "open" else "Completed chores"
        self._attr_translation_key = f"{kind}_chores"
        self._attr_unique_id = f"{coordinator.data['household']['id']}_{kind}_chores"

    @property
    def available(self) -> bool:
        data = self.coordinator.data
        return (
            super().available
            and data.get("modules", {}).get("chores", True)
            and data["permissions"]["shareChores"]
            and data["chores"] is not None
        )

    @property
    def native_value(self) -> int | None:
        return self.coordinator.data["chores"][self.kind] if self.available else None

    @property
    def extra_state_attributes(self) -> JsonObject:
        if not self.available:
            return {}
        chores = self.coordinator.data["chores"]
        attributes: JsonObject = {
            "local_date": chores["localDate"],
            "truncated": chores["truncated"],
        }
        if self.kind == "open":
            attributes["items"] = chores["items"]
        return attributes
