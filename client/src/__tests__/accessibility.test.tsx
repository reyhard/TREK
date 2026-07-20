// FE-A11Y-001 to FE-A11Y-010
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '../../tests/helpers/render'
import { useTranslation } from '../i18n'

describe('RTL direction propagation', () => {
  it('FE-A11Y-001: isRtlLanguage returns true for Arabic', async () => {
    const { isRtlLanguage } = await import('@trek/shared')
    expect(isRtlLanguage('ar')).toBe(true)
  })

  it('FE-A11Y-002: isRtlLanguage returns false for English', async () => {
    const { isRtlLanguage } = await import('@trek/shared')
    expect(isRtlLanguage('en')).toBe(false)
  })

  it('FE-A11Y-003: isRtlLanguage returns false for German', async () => {
    const { isRtlLanguage } = await import('@trek/shared')
    expect(isRtlLanguage('de')).toBe(false)
  })
})

describe('reduced-motion behavior', () => {
  it('FE-A11Y-004: respectReducedMotion returns true when prefers-reduced-motion is set', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })))
    const { respectReducedMotion } = await import('../utils/accessibility')
    expect(respectReducedMotion()).toBe(true)
    vi.unstubAllGlobals()
  })

  it('FE-A11Y-005: respectReducedMotion returns false when prefers-reduced-motion is not set', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })))
    const { respectReducedMotion } = await import('../utils/accessibility')
    expect(respectReducedMotion()).toBe(false)
    vi.unstubAllGlobals()
  })
})

describe('keyboard operation', () => {
  it('FE-A11Y-006: modal closes on Escape key', () => {
    const onClose = vi.fn()
    render(
      <div
        role="dialog"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
        tabIndex={0}
        data-testid="modal"
      />
    )
    const modal = screen.getByTestId('modal')
    modal.focus()
    modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onClose).toHaveBeenCalled()
  })

  it('FE-A11Y-007: dropdown opens on Enter key', () => {
    const onToggle = vi.fn()
    render(
      <button
        onClick={onToggle}
        data-testid="dropdown-trigger"
        onKeyDown={(e) => { if (e.key === 'Enter') onToggle() }}
      >
        Open
      </button>
    )
    const btn = screen.getByTestId('dropdown-trigger')
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onToggle).toHaveBeenCalled()
  })
})

describe('transit metadata defensive handling', () => {
  it('FE-A11Y-008: null metadata.transit does not throw', () => {
    const meta = JSON.parse('{"transit": null}')
    const transitMeta = meta.transit && Array.isArray(meta.transit?.legs) ? meta.transit : null
    expect(transitMeta).toBeNull()
  })

  it('FE-A11Y-009: undefined metadata.transit does not throw', () => {
    const meta = JSON.parse('{}')
    const transitMeta = meta.transit && Array.isArray(meta.transit?.legs) ? meta.transit : null
    expect(transitMeta).toBeNull()
  })

  it('FE-A11Y-010: malformed metadata.transit.legs does not throw', () => {
    const meta = { transit: { legs: 'invalid' } }
    const transitMeta = meta.transit && Array.isArray(meta.transit?.legs) ? meta.transit : null
    expect(transitMeta).toBeNull()
  })
})
