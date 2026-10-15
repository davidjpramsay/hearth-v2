"""Manual-install local Hearth integration with optional chore status control."""

from aiohttp import DummyCookieJar
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.aiohttp_client import async_create_clientsession

from .client import HearthClient
from .const import CONF_ALLOW_LOOPBACK_HTTP, CONF_AUTOMATION_KEY, CONF_URL, DOMAIN
from .coordinator import HearthCoordinator

PLATFORMS = [Platform.SELECT, Platform.SENSOR, Platform.CALENDAR, Platform.TODO]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Load a protected config entry and fetch before adding any entities."""
    session = async_create_clientsession(
        hass,
        verify_ssl=True,
        cookie_jar=DummyCookieJar(),
        trust_env=False,
    )
    client = HearthClient(
        session,
        entry.data[CONF_URL],
        entry.data[CONF_AUTOMATION_KEY],
        allow_loopback_http=entry.data.get(CONF_ALLOW_LOOPBACK_HTTP, False),
        household_id=entry.unique_id,
    )
    coordinator = HearthCoordinator(hass, entry, client)
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator
    household = coordinator.data["household"]
    dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={(DOMAIN, household["id"])},
        name=household["name"],
        manufacturer="Hearth",
        model="Hearth server",
    )
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload listeners/entities; HA cleans up the entry's dedicated session."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
