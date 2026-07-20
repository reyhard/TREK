export function respectReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

let focusRestoreTarget: HTMLElement | null = null

/**
 * Save the currently focused element before opening a modal/dialog.
 * Call this BEFORE opening the modal. The element must be focusable or
 * have a focusable child (for container-clicked elements).
 */
export function saveFocusForRestore(): void {
  if (typeof document === 'undefined') return
  const el = document.activeElement
  if (el && el instanceof HTMLElement) {
    focusRestoreTarget = el
  }
}

/**
 * Restore focus to the element saved by saveFocusForRestore().
 * Call this AFTER closing a modal/dialog.
 */
export function restoreFocus(): void {
  if (typeof window === 'undefined') return
  // Use rAF to let React finish unmounting before we try to focus
  requestAnimationFrame(() => {
    if (focusRestoreTarget) {
      focusRestoreTarget.focus({ preventScroll: true })
      focusRestoreTarget = null
    }
  })
}
