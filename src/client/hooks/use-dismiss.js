import * as React from 'react'

/**
 * Close the detail panel on a click outside it or on Escape.
 *
 * The panel has no close button: a click anywhere outside it dismisses it,
 * and Escape does the same for keyboard users. The listener is on the
 * document during capture so a click on a control that stops propagation
 * still closes the panel.
 * @param {object} args The open state, the panel root, and the setters that close the surfaces.
 * @param {boolean} args.open Whether the panel is open.
 * @param {object | null} args.rootRef Ref on the panel root element.
 * @param {boolean} args.modelMenuOpen Whether the model list is open on top of the panel.
 * @param {(next: boolean | ((value: boolean) => boolean)) => void} args.setOpen Sets the panel open state.
 * @param {(next: boolean | ((value: boolean) => boolean)) => void} args.setModelMenuOpen Sets the model list open state.
 */
export function useDismiss({ open, rootRef, modelMenuOpen, setOpen, setModelMenuOpen }) {
  // The root ref is read at event time, not as a dependency: the node is
  // attached after the effect runs, and its identity never re-arms this
  // listener.
  // biome-ignore lint/correctness/useExhaustiveDependencies: rootRef.current is a DOM node read at event time
  React.useEffect(() => {
    if (!open) return
    const onPointerDown = (event) => {
      const root = rootRef.current
      if (root && event.target instanceof Node && root.contains(event.target)) return
      setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      // The model list is the inner surface: Escape closes it first and
      // leaves the card open.
      if (modelMenuOpen) {
        setModelMenuOpen(false)
        return
      }
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, modelMenuOpen, setOpen, setModelMenuOpen])
}
