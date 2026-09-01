import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DEFAULT_SETTINGS, normalizeSettings, useSettingsStore } from './settingsStore'
import type { Settings } from '../types'
import { settingsApi } from '../api/client'
import { clearTileCache } from '../sync/tilePrefetcher'

vi.mock('../api/client', () => ({
  settingsApi: {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue(undefined),
    setBulk: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../sync/tilePrefetcher', () => ({
  clearTileCache: vi.fn().mockResolvedValue(undefined),
}))

// A fresh instance sends no value for a setting an admin hasn't defaulted, so DEFAULT_SETTINGS
// is what a brand-new user actually sees. These guard against the two regressions in the
// original bug: unit defaults that mix measurement systems (°F alongside kilometres), and a
// store default that silently disagrees with DisplaySettingsTab's fallback.
describe('settings defaults', () => {
  it('SETTINGS-DEFAULTS-001: the shipped unit defaults belong to one consistent system', () => {
    expect(DEFAULT_SETTINGS.temperature_unit).toBe('celsius')
    expect(DEFAULT_SETTINGS.distance_unit).toBe('metric')
    expect(DEFAULT_SETTINGS.time_format).toBe('24h')
  })

  it('SETTINGS-DEFAULTS-002: the store initialises from DEFAULT_SETTINGS, the same constant DisplaySettingsTab falls back to, so the two cannot drift apart', () => {
    const settings = useSettingsStore.getState().settings
    expect(settings.temperature_unit).toBe(DEFAULT_SETTINGS.temperature_unit)
    expect(settings.distance_unit).toBe(DEFAULT_SETTINGS.distance_unit)
    expect(settings.time_format).toBe(DEFAULT_SETTINGS.time_format)
  })

  it('SETTINGS-DEFAULTS-003: no CARTO key is shipped, so the field starts empty instead of undefined', () => {
    expect(DEFAULT_SETTINGS.carto_api_key).toBe('')
  })
})

// The CARTO key lives in its own setting and is appended at render time (#2054). Two things
// have to hold on the way out to the server: the key never gets frozen into the saved
// template, and a key change invalidates the tile cache, which is keyed by the full URL.
describe('settings tile template hygiene', () => {
  const initialState = useSettingsStore.getState()

  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState(initialState, true)
  })

  it('SETTINGS-TILE-001: a key pasted into the template is stripped before the template is stored', async () => {
    await useSettingsStore.getState().updateSetting(
      'map_tile_url',
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=pasted-secret',
    )
    const stored = useSettingsStore.getState().settings.map_tile_url
    expect(stored).toBe('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png')
    expect(stored).not.toContain('pasted-secret')
    expect(settingsApi.set).toHaveBeenCalledWith('map_tile_url', stored)
  })

  it('SETTINGS-TILE-002: a bulk save strips the key and normalizes the retired OSM shard host', async () => {
    await useSettingsStore.getState().updateSettings({
      map_tile_url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png?key=pasted-secret',
    })
    const stored = useSettingsStore.getState().settings.map_tile_url
    expect(stored).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png')
    expect(settingsApi.setBulk).toHaveBeenCalledWith({ map_tile_url: stored })
  })

  it('SETTINGS-TILE-003: changing the CARTO key drops the tile cache', async () => {
    await useSettingsStore.getState().updateSetting('carto_api_key', 'fresh-key')
    expect(clearTileCache).toHaveBeenCalledTimes(1)
  })

  it('SETTINGS-TILE-004: re-saving the same key leaves the cache alone', async () => {
    await useSettingsStore.getState().updateSetting('carto_api_key', 'fresh-key')
    vi.mocked(clearTileCache).mockClear()
    await useSettingsStore.getState().updateSetting('carto_api_key', 'fresh-key')
    expect(clearTileCache).not.toHaveBeenCalled()
  })

  it('SETTINGS-TILE-005: a bulk save clears the cache only when the key actually moves', async () => {
    await useSettingsStore.getState().updateSettings({ carto_api_key: 'fresh-key' })
    expect(clearTileCache).toHaveBeenCalledTimes(1)

    vi.mocked(clearTileCache).mockClear()
    await useSettingsStore.getState().updateSettings({ map_tile_url: '' })
    expect(clearTileCache).not.toHaveBeenCalled()
  })
})

describe('settings migration', () => {
  it('SETTINGS-MIGRATE-001: old string dark_mode normalizes to boolean', () => {
    const old1 = normalizeSettings({ dark_mode: 'light' } as unknown as Partial<Settings>)
    expect(old1.dark_mode).toBe(false)
    const old2 = normalizeSettings({ dark_mode: 'dark' } as unknown as Partial<Settings>)
    expect(old2.dark_mode).toBe(true)
  })

  it('SETTINGS-MIGRATE-002: null dark_mode falls back to DEFAULT_SETTINGS.dark_mode', () => {
    const result = normalizeSettings({ dark_mode: null } as unknown as Partial<Settings>)
    expect(result.dark_mode).toBe(DEFAULT_SETTINGS.dark_mode)
  })

  it('SETTINGS-MIGRATE-002A: dark_mode auto is preserved as string', () => {
    const result = normalizeSettings({ dark_mode: 'auto' } as unknown as Partial<Settings>)
    expect(result.dark_mode).toBe('auto')
  })

  it('SETTINGS-MIGRATE-002B: dark_mode system is preserved as string', () => {
    const result = normalizeSettings({ dark_mode: 'system' } as unknown as Partial<Settings>)
    expect(result.dark_mode).toBe('system')
  })

  it('SETTINGS-MIGRATE-003: missing temperature_unit falls back to celsius', () => {
    const result = normalizeSettings({ map_tile_url: '' } as unknown as Partial<Settings>)
    expect(result.temperature_unit).toBe('celsius')
  })

  it('SETTINGS-MIGRATE-004: missing distance_unit falls back to metric', () => {
    const result = normalizeSettings({} as Partial<Settings>)
    expect(result.distance_unit).toBe('metric')
  })

  it('SETTINGS-MIGRATE-005: security-sensitive blur_booking_codes defaults to false when missing', () => {
    const result = normalizeSettings({} as Partial<Settings>)
    expect(result.blur_booking_codes).toBe(false)
  })

  it('SETTINGS-MIGRATE-006: map_always_show_routes is undefined when not set (materialized per-trip, not on settings load)', () => {
    const result = normalizeSettings({} as Partial<Settings>)
    expect(result.map_always_show_routes).toBeUndefined()
  })

  it('SETTINGS-MIGRATE-007: invalid temperature_unit string falls back to celsius', () => {
    const result = normalizeSettings({ temperature_unit: 'kelvin' } as unknown as Partial<Settings>)
    expect(result.temperature_unit).toBe('celsius')
  })

  it('SETTINGS-MIGRATE-008: invalid distance_unit string falls back to metric', () => {
    const result = normalizeSettings({ distance_unit: 'nautical' } as unknown as Partial<Settings>)
    expect(result.distance_unit).toBe('metric')
  })

  it('SETTINGS-MIGRATE-009: valid values pass through unchanged', () => {
    const result = normalizeSettings({ temperature_unit: 'fahrenheit', distance_unit: 'imperial', dark_mode: true })
    expect(result.temperature_unit).toBe('fahrenheit')
    expect(result.distance_unit).toBe('imperial')
    expect(result.dark_mode).toBe(true)
  })

  it('SETTINGS-MIGRATE-010: old object shape for mapbox_style survives', () => {
    const result = normalizeSettings({ mapbox_style: 'mapbox://styles/mapbox/standard' } as Partial<Settings>)
    expect(result.mapbox_style).toBe('mapbox://styles/mapbox/standard')
  })

  it('SETTINGS-MIGRATE-011: plugin security fields default to conservative values', () => {
    const result = normalizeSettings({} as Partial<Settings>)
    expect(result.llm_provider).toBeUndefined()
  })
})
