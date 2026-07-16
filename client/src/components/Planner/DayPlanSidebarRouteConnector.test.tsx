import { fireEvent, render, screen } from '../../../tests/helpers/render'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RouteSegment } from '../../types'
import { RouteConnector } from './DayPlanSidebarRouteConnector'

const seg: RouteSegment = {
  mid: [1, 1],
  from: [1, 1],
  to: [2, 2],
  distance: 3100,
  duration: 2460,
  walkingText: '41 min',
  drivingText: '9 min',
  distanceText: '3.1 km',
}

const transitAction = (onSelect = vi.fn()) => ({
  label: 'Plan public transit',
  ariaLabel: 'Plan public transit: Origin → Destination',
  onSelect,
})

describe('RouteConnector transit action', () => {
  it('keeps the connector display-only when no action is supplied', () => {
    render(<RouteConnector seg={seg} profile="walking" />)
    expect(screen.getByText('41 min')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('opens only after clicking and runs the selected action once', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(
      <RouteConnector
        seg={seg}
        profile="walking"
        transitAction={transitAction(onSelect)}
      />,
    )

    const trigger = screen.getByRole('button', {
      name: 'Plan public transit: Origin → Destination',
    })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await user.hover(trigger)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await user.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem')).toHaveLength(1)

    await user.click(screen.getByRole('menuitem', {
      name: 'Plan public transit',
    }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it.each([
    ['Enter', '{Enter}'],
    ['Space', ' '],
  ])('opens with %s and focuses the action', async (_keyName, key) => {
    const user = userEvent.setup()
    render(
      <RouteConnector
        seg={seg}
        profile="walking"
        transitAction={transitAction()}
      />,
    )

    const trigger = screen.getByRole('button', {
      name: 'Plan public transit: Origin → Destination',
    })
    trigger.focus()
    await user.keyboard(key)

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem')).toHaveFocus()
  })

  it('closes on Escape and restores focus to the trigger', async () => {
    const user = userEvent.setup()
    render(
      <RouteConnector
        seg={seg}
        profile="walking"
        transitAction={transitAction()}
      />,
    )

    const trigger = screen.getByRole('button', {
      name: 'Plan public transit: Origin → Destination',
    })
    await user.click(trigger)
    expect(screen.getByRole('menuitem')).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes when the user clicks outside', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <button>Outside</button>
        <RouteConnector
          seg={seg}
          profile="walking"
          transitAction={transitAction()}
        />
      </div>,
    )

    await user.click(screen.getByRole('button', {
      name: 'Plan public transit: Origin → Destination',
    }))
    await user.click(screen.getByRole('button', { name: 'Outside' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it.each(['scroll', 'resize'])('closes on capture-phase %s', async eventName => {
    const user = userEvent.setup()
    render(
      <RouteConnector
        seg={seg}
        profile="walking"
        transitAction={transitAction()}
      />,
    )

    await user.click(screen.getByRole('button', {
      name: 'Plan public transit: Origin → Destination',
    }))
    fireEvent(document, new Event(eventName, { bubbles: false }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('shrinks and clamps the menu within a viewport narrower than 226px', async () => {
    const user = userEvent.setup()
    const originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 180 })

    render(
      <RouteConnector
        seg={seg}
        profile="walking"
        transitAction={transitAction()}
      />,
    )

    await user.click(screen.getByRole('button', {
      name: 'Plan public transit: Origin → Destination',
    }))
    const menu = screen.getByRole('menu')
    expect(menu).toHaveStyle({ left: '8px', width: '164px' })
    expect(menu).toHaveStyle({ maxWidth: 'calc(100vw - 16px)' })

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
  })

  it('clamps using transform-independent menu dimensions while measuring the trigger bounds', async () => {
    const user = userEvent.setup()
    const originalWidth = window.innerWidth
    const originalHeight = window.innerHeight
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 240 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 120 })
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function () {
        if (this.getAttribute('role') === 'menu') {
          return {
            x: 0,
            y: 0,
            top: 0,
            right: 110,
            bottom: 38,
            left: 0,
            width: 110,
            height: 38,
            toJSON: () => ({}),
          }
        }
        return {
          x: 220,
          y: 80,
          top: 80,
          right: 240,
          bottom: 100,
          left: 220,
          width: 20,
          height: 20,
          toJSON: () => ({}),
        }
      })
    const offsetWidthSpy = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
      .mockImplementation(function () { return this.getAttribute('role') === 'menu' ? 220 : 0 })
    const offsetHeightSpy = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockImplementation(function () { return this.getAttribute('role') === 'menu' ? 76 : 0 })

    render(
      <RouteConnector
        seg={seg}
        profile="walking"
        transitAction={transitAction()}
      />,
    )
    await user.click(screen.getByRole('button', {
      name: 'Plan public transit: Origin → Destination',
    }))

    expect(screen.getByRole('menu')).toHaveStyle({
      boxSizing: 'border-box',
      left: '12px',
      top: '36px',
    })
    expect(rectSpy).toHaveBeenCalledTimes(1)

    rectSpy.mockRestore()
    offsetWidthSpy.mockRestore()
    offsetHeightSpy.mockRestore()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalHeight })
  })
})
