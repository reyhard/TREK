import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Car, Footprints, Hotel, TramFront } from 'lucide-react'
import type { RouteSegment } from '../../types'

export interface RouteConnectorTransitAction {
  label: string
  ariaLabel: string
  onSelect: () => void
}

/** Slim travel-time connector shown between two consecutive located stops in a day. */
export function RouteConnector({
  seg,
  profile,
  transitAction,
}: {
  seg: RouteSegment
  profile: 'driving' | 'walking'
  transitAction?: RouteConnectorTransitAction
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 210 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const actionRef = useRef<HTMLButtonElement>(null)
  const driving = profile === 'driving'
  const Icon = driving ? Car : Footprints
  const line = { flex: 1, height: 1, minHeight: 1, alignSelf: 'center', background: 'var(--border-primary)' }

  const close = (restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) queueMicrotask(() => triggerRef.current?.focus())
  }

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return
    const triggerBounds = triggerRef.current.getBoundingClientRect()
    const menuWidth = menuRef.current.offsetWidth
    const menuHeight = menuRef.current.offsetHeight
    const menuBounds = (!menuWidth || !menuHeight) ? menuRef.current.getBoundingClientRect() : null
    const viewportPadding = 8
    const width = Math.min(210, Math.max(0, window.innerWidth - viewportPadding * 2))
    const renderedWidth = menuWidth || menuBounds?.width || width
    const renderedHeight = menuHeight || menuBounds?.height || 0
    const maximumLeft = Math.max(viewportPadding, window.innerWidth - renderedWidth - viewportPadding)
    const maximumTop = Math.max(viewportPadding, window.innerHeight - renderedHeight - viewportPadding)
    const nextPosition = {
      top: Math.max(viewportPadding, Math.min(triggerBounds.bottom + 5, maximumTop)),
      left: Math.max(
        viewportPadding,
        Math.min(triggerBounds.left + triggerBounds.width / 2 - renderedWidth / 2, maximumLeft),
      ),
      width,
    }
    setPosition(current => (
      current.top === nextPosition.top &&
      current.left === nextPosition.left &&
      current.width === nextPosition.width
        ? current
        : nextPosition
    ))
  }, [open])

  useEffect(() => {
    if (!open) return
    actionRef.current?.focus()

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close(true)
    }
    const onViewportChange = () => close()

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onViewportChange, true)
    window.addEventListener('scroll', onViewportChange, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onViewportChange, true)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [open])

  const label = (
    <>
      <Icon size={11} strokeWidth={2} />
      <span>{seg.durationText ?? (driving ? seg.drivingText : seg.walkingText)}</span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span>{seg.distanceText}</span>
    </>
  )

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 14px', fontSize: 'calc(10.5px * var(--fs-scale-caption, 1))', color: 'var(--text-faint)', lineHeight: 1.2 }}>
        <div style={line} />
        {transitAction ? (
          <button
            ref={triggerRef}
            type="button"
            aria-label={transitAction.ariaLabel}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen(value => !value)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              flexShrink: 0,
              minHeight: 24,
              padding: '3px 7px',
              margin: '-3px -7px',
              border: 0,
              borderRadius: 7,
              background: open ? 'var(--bg-hover)' : 'transparent',
              color: open ? 'var(--text-primary)' : 'inherit',
              cursor: 'pointer',
              font: 'inherit',
              lineHeight: 'inherit',
              transition: 'background 120ms ease, color 120ms ease',
            }}
            onMouseEnter={event => {
              event.currentTarget.style.background = 'var(--bg-hover)'
              event.currentTarget.style.color = 'var(--text-primary)'
            }}
            onMouseLeave={event => {
              if (open) return
              event.currentTarget.style.background = 'transparent'
              event.currentTarget.style.color = 'inherit'
            }}
          >
            {label}
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {label}
          </div>
        )}
        <div style={line} />
      </div>

      {open && transitAction && ReactDOM.createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={transitAction.label}
          className="trek-popover-enter"
          style={{
            position: 'fixed',
            boxSizing: 'border-box',
            top: position.top,
            left: position.left,
            zIndex: 999999,
            width: position.width,
            maxWidth: 'calc(100vw - 16px)',
            padding: 4,
            border: '1px solid var(--border-primary)',
            borderRadius: 10,
            background: 'var(--bg-card)',
            boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            fontFamily: 'var(--font-system)',
          }}
        >
          <button
            ref={actionRef}
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              transitAction.onSelect()
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              minHeight: 36,
              padding: '8px 10px',
              border: 0,
              borderRadius: 7,
              background: 'transparent',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 'calc(12px * var(--fs-scale-body, 1))',
              fontWeight: 500,
              textAlign: 'left',
            }}
            onMouseEnter={event => {
              event.currentTarget.style.background = 'var(--bg-hover)'
            }}
            onMouseLeave={event => {
              event.currentTarget.style.background = 'transparent'
            }}
          >
            <TramFront size={13} className="text-content-faint" />
            <span>{transitAction.label}</span>
          </button>
        </div>,
        document.body,
      )}
    </>
  )
}

/**
 * The hotel's bookend legs for a day: a two-line connector naming the day's
 * accommodation with the drive to/from it. Rendered above the first place (the
 * morning departure from the hotel) and below the last place (the evening return),
 * when the "optimize from accommodation" setting is on and the day has a hotel.
 */
export function HotelRouteConnector({
  seg,
  profile,
  name,
  placement,
}: {
  seg: RouteSegment
  profile: 'driving' | 'walking'
  name: string
  placement: 'top' | 'bottom'
}) {
  const driving = profile === 'driving'
  const Icon = driving ? Car : Footprints
  const line = { flex: 1, height: 1, minHeight: 1, alignSelf: 'center', background: 'var(--border-primary)' }
  const hotelRow = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '0 14px', minWidth: 0 }}>
      <Hotel size={12} strokeWidth={1.8} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
      <span style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))', fontWeight: 600, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
        {name}
      </span>
    </div>
  )
  const travelRow = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 14px', fontSize: 'calc(10.5px * var(--fs-scale-caption, 1))', color: 'var(--text-faint)', lineHeight: 1.2 }}>
      <div style={line} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <Icon size={11} strokeWidth={2} />
        <span>{seg.durationText ?? (driving ? seg.drivingText : seg.walkingText)}</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>{seg.distanceText}</span>
      </div>
      <div style={line} />
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: placement === 'top' ? '2px 0 6px' : '6px 0 2px' }}>
      {placement === 'top' ? (
        <>
          {hotelRow}
          {travelRow}
        </>
      ) : (
        <>
          {travelRow}
          {hotelRow}
        </>
      )}
    </div>
  )
}
