"""Read-only calendar; bridge all-day ends are already exclusive dates."""

from datetime import datetime
from zoneinfo import ZoneInfo

from homeassistant.components.calendar import CalendarEntity, CalendarEvent
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from .client import JsonObject, calendar_fetch_window, event_bounds, event_values
from .coordinator import HearthCoordinator
from .entity import HearthEntity

PARALLEL_UPDATES = 1


def _as_event(item: JsonObject) -> CalendarEvent:
    start, end = event_values(item)
    return CalendarEvent(start=start, end=end, summary=item["title"], uid=item["id"])


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_add_entities([HearthCalendar(entry.runtime_data)])


class HearthCalendar(HearthEntity, CalendarEntity):
    _attr_name = "Calendar"
    _attr_translation_key = "calendar"
    _attr_supported_features = 0

    def __init__(self, coordinator: HearthCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.data['household']['id']}_calendar"
        self._range_failed = False
        self._range_freshness: str | None = None

    @property
    def available(self) -> bool:
        data = self.coordinator.data
        return (
            super().available
            and data.get("modules", {}).get("calendar", True)
            and not self._range_failed
            and data["permissions"]["shareCalendar"]
            and data["calendar"] is not None
            and data["calendar"]["freshness"] != "offline"
        )

    @property
    def extra_state_attributes(self) -> JsonObject:
        if not self.available:
            return {}
        projection = self.coordinator.data["calendar"]
        return {
            "freshness": projection["freshness"]
            if projection is not None
            else "offline",
            "range_freshness": self._range_freshness,
        }

    @property
    def event(self) -> CalendarEvent | None:
        if not self.available:
            return None
        now = dt_util.now()
        events = self.coordinator.data["calendar"]["events"]
        upcoming = [item for item in events if event_bounds(item, now.tzinfo)[1] > now]
        upcoming.sort(key=lambda item: event_bounds(item, now.tzinfo)[0])
        return _as_event(upcoming[0]) if upcoming else None

    @callback
    def _handle_coordinator_update(self) -> None:
        self._range_failed = False
        super()._handle_coordinator_update()

    async def async_get_events(
        self, hass: HomeAssistant, start_date: datetime, end_date: datetime
    ) -> list[CalendarEvent]:
        if not self.available:
            raise HomeAssistantError("Hearth calendar is unavailable")
        try:
            if (
                start_date.utcoffset() is None
                or end_date.utcoffset() is None
                or end_date <= start_date
            ):
                raise HomeAssistantError(
                    "Calendar bounds must be ordered and include a timezone"
                )
            household_zone = ZoneInfo(self.coordinator.data["household"]["timezone"])
            lower, upper = calendar_fetch_window(start_date, end_date, household_zone)
            result = await self.coordinator.async_calendar(lower, upper)
        except HomeAssistantError:
            self._range_failed = True
            self._range_freshness = "offline"
            self.async_write_ha_state()
            raise
        self._range_failed = False
        self._range_freshness = result["freshness"]
        # Date-only values are ordered/filtered at midnight in HA's query zone.
        # Timed ISO instants keep their actual offsets and are never date-shifted.
        events = [
            item
            for item in result["events"]
            if event_bounds(item, start_date.tzinfo)[1] > start_date
            and event_bounds(item, start_date.tzinfo)[0] < end_date
        ]
        events.sort(key=lambda item: event_bounds(item, start_date.tzinfo)[0])
        return [_as_event(item) for item in events]
