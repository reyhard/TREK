// FE-OAUTH-SCOPES-001 to FE-OAUTH-SCOPES-032
import { describe, it, expect } from 'vitest'
import { SCOPE_GROUPS, ALL_SCOPES, SCOPE_GROUP_NAMES, getScopeDisplay, getScopesByGroup, pluginScopeParts } from './oauthScopes'

describe('SCOPE_GROUPS', () => {
  it('FE-OAUTH-SCOPES-001: contains all expected scope keys', () => {
    const expected = [
      'trips:read', 'trips:write', 'trips:delete', 'trips:share',
      'places:read', 'places:write',
      'atlas:read', 'atlas:write',
      'packing:read', 'packing:write',
      'todos:read', 'todos:write',
      'budget:read', 'budget:write',
      'reservations:read', 'reservations:write',
      'collab:read', 'collab:write',
      'notifications:read', 'notifications:write',
      'vacay:read', 'vacay:write',
      'geo:read', 'weather:read',
    ]
    for (const scope of expected) {
      expect(SCOPE_GROUPS).toHaveProperty(scope)
    }
  })

  it('FE-OAUTH-SCOPES-002: each scope entry has labelKey, descriptionKey, groupKey', () => {
    for (const [scope, keys] of Object.entries(SCOPE_GROUPS)) {
      expect(keys.labelKey, `${scope} missing labelKey`).toBeTruthy()
      expect(keys.descriptionKey, `${scope} missing descriptionKey`).toBeTruthy()
      expect(keys.groupKey, `${scope} missing groupKey`).toBeTruthy()
    }
  })
})

describe('ALL_SCOPES', () => {
  it('FE-OAUTH-SCOPES-003: contains exactly 27 scopes', () => {
    expect(ALL_SCOPES).toHaveLength(27)
  })

  it('FE-OAUTH-SCOPES-004: matches Object.keys(SCOPE_GROUPS)', () => {
    expect(ALL_SCOPES).toEqual(Object.keys(SCOPE_GROUPS))
  })
})

describe('SCOPE_GROUP_NAMES', () => {
  it('FE-OAUTH-SCOPES-005: contains no duplicate group names', () => {
    expect(SCOPE_GROUP_NAMES).toHaveLength(new Set(SCOPE_GROUP_NAMES).size)
  })

  it('FE-OAUTH-SCOPES-006: contains expected groups', () => {
    const expected = [
      'oauth.scope.group.trips',
      'oauth.scope.group.places',
      'oauth.scope.group.packing',
      'oauth.scope.group.budget',
    ]
    for (const g of expected) {
      expect(SCOPE_GROUP_NAMES).toContain(g)
    }
  })
})

describe('getScopesByGroup', () => {
  const identity = (key: string) => key

  it('FE-OAUTH-SCOPES-007: groups all scopes under the correct group key', () => {
    const groups = getScopesByGroup(identity)
    // Every scope must appear exactly once across all groups
    const allScopesInGroups = Object.values(groups).flat().map(s => s.scope)
    expect(allScopesInGroups).toHaveLength(ALL_SCOPES.length)
    for (const scope of ALL_SCOPES) {
      expect(allScopesInGroups).toContain(scope)
    }
  })

  it('FE-OAUTH-SCOPES-008: each item has scope, label, description, group', () => {
    const groups = getScopesByGroup(identity)
    for (const items of Object.values(groups)) {
      for (const item of items) {
        expect(item.scope).toBeTruthy()
        expect(item.label).toBeTruthy()
        expect(item.description).toBeTruthy()
        expect(item.group).toBeTruthy()
      }
    }
  })

  it('FE-OAUTH-SCOPES-009: trips group contains trips:read and trips:write', () => {
    const groups = getScopesByGroup(identity)
    const tripsGroup = groups['oauth.scope.group.trips']
    expect(tripsGroup).toBeDefined()
    const scopeNames = tripsGroup.map(s => s.scope)
    expect(scopeNames).toContain('trips:read')
    expect(scopeNames).toContain('trips:write')
  })

  it('FE-OAUTH-SCOPES-010: uses translated group name as key', () => {
    const t = (key: string) => key === 'oauth.scope.group.trips' ? 'Trips' : key
    const groups = getScopesByGroup(t)
    expect(groups['Trips']).toBeDefined()
    expect(groups['oauth.scope.group.trips']).toBeUndefined()
  })
})

describe('dynamic plugin scopes', () => {
  const identity = (key: string) => key

  it('parses and displays valid plugin read/write scopes', () => {
    expect(pluginScopeParts('plugin:mymap-sync:read')).toEqual({ pluginId: 'mymap-sync', access: 'read' })
    expect(getScopeDisplay('plugin:mymap-sync:write', identity)).toEqual({
      label: 'mymap-sync plugin access',
      description: 'Allow this client to read and write the mymap-sync plugin proxy',
      group: 'Plugin: mymap-sync',
    })
  })

  it('retains static translations and rejects malformed plugin scopes', () => {
    expect(getScopeDisplay('trips:read', identity).label).toBe('oauth.scope.trips:read.label')
    expect(pluginScopeParts('plugin:mymap_sync:read')).toBeNull()
    expect(getScopeDisplay('plugin:mymap_sync:read', identity).group).toBe('Other')
  })

  it('FE-OAUTH-SCOPES-011: pluginScopeParts rejects id with uppercase', () => {
    expect(pluginScopeParts('plugin:MyApp:read')).toBeNull()
  })

  it('FE-OAUTH-SCOPES-012: pluginScopeParts rejects id starting with digit', () => {
    expect(pluginScopeParts('plugin:2app:read')).toBeNull()
  })

  it('FE-OAUTH-SCOPES-013: pluginScopeParts rejects id shorter than 3 chars', () => {
    expect(pluginScopeParts('plugin:ab:read')).toBeNull()
  })

  it('FE-OAUTH-SCOPES-014: pluginScopeParts rejects id longer than 40 chars', () => {
    expect(pluginScopeParts('plugin:' + 'a'.repeat(41) + ':read')).toBeNull()
  })

  it('FE-OAUTH-SCOPES-015: pluginScopeParts rejects invalid access level', () => {
    expect(pluginScopeParts('plugin:app:delete')).toBeNull()
  })

  it('FE-OAUTH-SCOPES-016: pluginScopeParts accepts 3-char minimum id', () => {
    expect(pluginScopeParts('plugin:abc:read')).toEqual({ pluginId: 'abc', access: 'read' })
  })

  it('FE-OAUTH-SCOPES-017: pluginScopeParts accepts 40-char maximum id', () => {
    const id = 'a'.repeat(40)
    expect(pluginScopeParts(`plugin:${id}:write`)).toEqual({ pluginId: id, access: 'write' })
  })

  it('FE-OAUTH-SCOPES-018: pluginScopeParts accepts id with hyphens', () => {
    expect(pluginScopeParts('plugin:my-plugin-id:read')).toEqual({ pluginId: 'my-plugin-id', access: 'read' })
  })

  it('FE-OAUTH-SCOPES-019: pluginScopeParts returns null for empty string', () => {
    expect(pluginScopeParts('')).toBeNull()
  })

  it('FE-OAUTH-SCOPES-020: pluginScopeParts returns null for non-plugin static scope', () => {
    expect(pluginScopeParts('trips:read')).toBeNull()
  })

  it('FE-OAUTH-SCOPES-021: getScopeDisplay for plugin:read returns read description', () => {
    const display = getScopeDisplay('plugin:gmail:read', identity)
    expect(display.label).toBe('gmail plugin access')
    expect(display.description).toBe('Allow this client to read the gmail plugin proxy')
  })

  it('FE-OAUTH-SCOPES-022: getScopeDisplay for plugin:write returns read+write description', () => {
    const display = getScopeDisplay('plugin:gmail:write', identity)
    expect(display.description).toBe('Allow this client to read and write the gmail plugin proxy')
  })
})

describe('Step 1: OAuth display requirements', () => {
  // Use a t function that returns meaningful translated text for known keys
  // and falls back to the key itself for unknown keys, to match real usage.
  const t = (key: string) => {
    const known: Record<string, string> = {
      'oauth.scope.geo:read.label': 'Maps, geocoding & transit',
      'oauth.scope.geo:read.description': 'Search locations, resolve map URLs, reverse geocode coordinates, and search public transit routes',
      'oauth.scope.places:read.label': 'View places & map data',
      'oauth.scope.places:read.description': 'Read places, day assignments, tags, and categories',
      'oauth.scope.group.geo': 'Geo',
      'oauth.scope.group.places': 'Places',
      'oauth.scope.group.weather': 'Weather',
    }
    return known[key] || key
  }

  it('FE-OAUTH-SCOPES-023: geo:read description includes maps, geocoding, and public transit', () => {
    const display = getScopeDisplay('geo:read', t)
    const desc = display.description.toLowerCase()
    expect(desc).toContain('search')
    expect(desc).toContain('map')
    expect(desc).toContain('geocod')
    expect(desc).toContain('transit')
  })

  it('FE-OAUTH-SCOPES-024: places:read does not claim transit provider search', () => {
    const display = getScopeDisplay('places:read', t)
    const desc = display.description.toLowerCase()
    expect(desc).toContain('place')
    expect(desc).not.toContain('transit')
    expect(desc).not.toContain('route')
  })

  it('FE-OAUTH-SCOPES-025: plugin scopes group by plugin ID and distinguish read/write', () => {
    const pluginRead = getScopeDisplay('plugin:travelbuddy:read', t)
    const pluginWrite = getScopeDisplay('plugin:travelbuddy:write', t)

    expect(pluginRead.group).toBe('Plugin: travelbuddy')
    expect(pluginWrite.group).toBe('Plugin: travelbuddy')

    const readDesc = pluginRead.description.toLowerCase()
    expect(readDesc).toContain('read')
    expect(readDesc).not.toContain('write')

    const writeDesc = pluginWrite.description.toLowerCase()
    expect(writeDesc).toContain('read and write')
  })

  it('FE-OAUTH-SCOPES-026: malformed plugin scopes render as unrecognized', () => {
    const display = getScopeDisplay('plugin:invalid!scope:read', t)
    expect(display.group).toBe('Other')
    expect(display.description).toBe('Unrecognized scope')
  })

  it('FE-OAUTH-SCOPES-027: unknown scopes render as unrecognized with scope name as label', () => {
    const display = getScopeDisplay('completely:unknown', t)
    expect(display.group).toBe('Other')
    expect(display.label).toBe('completely:unknown')
    expect(display.description).toBe('Unrecognized scope')
  })

  it('FE-OAUTH-SCOPES-028: getScopesByGroup deduplicates duplicate scopes', () => {
    const groups = getScopesByGroup(t, ['trips:read', 'geo:read', 'trips:read', 'geo:read'])
    const allScopes = Object.values(groups).flat().map(s => s.scope)
    expect(allScopes.filter(s => s === 'trips:read')).toHaveLength(1)
    expect(allScopes.filter(s => s === 'geo:read')).toHaveLength(1)
  })

  it('FE-OAUTH-SCOPES-029: same getScopeDisplay used for both static and dynamic client scope rendering', () => {
    const staticResult = getScopeDisplay('trips:read', t)
    expect(staticResult).toHaveProperty('label')
    expect(staticResult).toHaveProperty('description')
    expect(staticResult).toHaveProperty('group')

    const pluginResult = getScopeDisplay('plugin:test:read', t)
    expect(pluginResult).toHaveProperty('label')
    expect(pluginResult).toHaveProperty('description')
    expect(pluginResult).toHaveProperty('group')

    const unknownResult = getScopeDisplay('unknown:scope', t)
    expect(unknownResult).toHaveProperty('label')
    expect(unknownResult).toHaveProperty('description')
    expect(unknownResult).toHaveProperty('group')
  })

  it('FE-OAUTH-SCOPES-030: plugin scopes for different plugin IDs produce separate groups', () => {
    const aRead = getScopeDisplay('plugin:plugin-a:read', t)
    const bRead = getScopeDisplay('plugin:plugin-b:read', t)
    expect(aRead.group).not.toBe(bRead.group)
    expect(aRead.group).toBe('Plugin: plugin-a')
    expect(bRead.group).toBe('Plugin: plugin-b')
  })

  it('FE-OAUTH-SCOPES-031: getScopesByGroup with empty array returns empty groups', () => {
    const groups = getScopesByGroup(t, [])
    expect(Object.keys(groups)).toHaveLength(0)
  })

  it('FE-OAUTH-SCOPES-032: getScopeDisplay for weather:read returns valid display', () => {
    const display = getScopeDisplay('weather:read', t)
    expect(display.label).toBeTruthy()
    expect(display.description).toBeTruthy()
    expect(display.group).toBeTruthy()
  })
})
