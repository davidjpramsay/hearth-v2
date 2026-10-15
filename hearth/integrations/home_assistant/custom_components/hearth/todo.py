"""Today's existing chores: status updates only, with explicit adult permission."""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from homeassistant.components.todo import (
    TodoItem,
    TodoItemStatus,
    TodoListEntity,
    TodoListEntityFeature,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .client import parse_instant
from .coordinator import HearthCoordinator
from .entity import HearthEntity

PARALLEL_UPDATES = 0


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    async_add_entities([HearthChoresTodo(entry.runtime_data)])


class HearthChoresTodo(HearthEntity, TodoListEntity):
    _attr_name = "Today's chores"
    _attr_translation_key = "today_chores"
    _attr_icon = "mdi:clipboard-check-outline"
    _attr_supported_features = TodoListEntityFeature.UPDATE_TODO_ITEM

    def __init__(self, coordinator: HearthCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.data['household']['id']}_today_chores"

    @property
    def available(self) -> bool:
        data = self.coordinator.data
        chores = data["chores"]
        now = datetime.now(UTC)
        return (
            super().available
            and data["permissions"].get("controlChores", False)
            and data["permissions"]["shareChores"]
            and chores is not None
            and not chores["truncated"]
            and -5 <= (now - parse_instant(data["generatedAt"])).total_seconds() <= 30
            and chores["localDate"]
            == now.astimezone(ZoneInfo(data["household"]["timezone"]))
            .date()
            .isoformat()
        )

    @property
    def todo_items(self) -> list[TodoItem] | None:
        if not self.available:
            return None
        return [
            TodoItem(
                uid=chore["id"],
                summary=f"{chore['assignee']} · {chore['title']}",
                status=TodoItemStatus.COMPLETED
                if chore["state"] == "completed"
                else TodoItemStatus.NEEDS_ACTION,
            )
            for chore in self.coordinator.data["chores"]["items"]
            if not chore.get("locked", False)
            and chore["state"] in {"pending", "completed"}
        ]

    async def async_update_todo_item(self, item: TodoItem) -> None:
        if not self.available:
            raise HomeAssistantError(
                "Refresh today's chores and allow chore control in Hearth first"
            )
        original = next(
            (value for value in self.todo_items or [] if value.uid == item.uid), None
        )
        if original is None:
            raise HomeAssistantError("That chore is not available for changes")
        if (
            item.summary != original.summary
            or item.due is not None
            or item.description is not None
            or item.status
            not in {TodoItemStatus.COMPLETED, TodoItemStatus.NEEDS_ACTION}
        ):
            raise HomeAssistantError(
                "Hearth allows chore completion changes only, not editing chore details"
            )
        if item.status == original.status:
            return
        chores = self.coordinator.data["chores"]
        chore = next(value for value in chores["items"] if value["id"] == item.uid)
        await self.coordinator.async_set_chore_completion(
            chore["id"],
            chores["localDate"],
            item.status == TodoItemStatus.COMPLETED,
            chore["completionId"],
        )
