import { createContext, useContext, useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Link, useLocation } from 'react-router'

/**
 * A menu button, built by hand rather than pulled from a library.
 *
 * The nav needs two of these — Catalog, and the account menu — and the tempting version
 * is a `div` that appears on `:hover`. That version is unusable: it cannot be opened from
 * a keyboard, it cannot be opened on a touch screen without a phantom first tap, it
 * announces nothing to a screen reader, and it vanishes the moment the pointer clips a
 * corner on the way down to the item somebody was aiming at. So this is the real thing,
 * to the WAI-ARIA menu-button pattern:
 *
 *  - a `<button aria-haspopup="menu" aria-expanded>` naming the menu it controls,
 *  - a container with `role="menu"` whose children are `role="menuitem"`,
 *  - **click to open**, never hover,
 *  - Escape closes it *and returns focus to the trigger*, which is the half everybody
 *    forgets and the half that decides whether a keyboard user is stranded,
 *  - ArrowDown/ArrowUp walk the items and wrap, Home/End jump to the ends,
 *  - Tab, a click anywhere outside, focus leaving the menu, or a navigation all close it.
 *
 * The items carry `tabIndex={-1}` and focus is moved for them — a menu is one tab stop
 * with arrows inside it, not eight tab stops. That is also why opening moves focus to the
 * first item: without it, a keyboard user opens a menu and their focus is still on the
 * button, with no way in.
 *
 * The panel stays mounted and is hidden with the `hidden` attribute rather than being
 * unmounted. `hidden` takes it out of the accessibility tree and out of the tab order
 * completely, so nothing is exposed that should not be, and the DOM position of the items
 * is stable — which is what lets the arrow-key handler find them without re-querying a
 * portal.
 */

const MenuContext = createContext<{ close: () => void } | null>(null)

/** No-op outside a Menu, so a stray `MenuLink` renders as a plain link rather than
 *  throwing — this is chrome, and chrome should not be able to white-screen the app. */
function useMenuClose(): () => void {
  const context = useContext(MenuContext)
  return context?.close ?? (() => {})
}

/**
 * A menu item, and specifically how it shows keyboard focus.
 *
 * It used to show it the same way it shows hover — a background change, with
 * `focus:outline-none` throwing the browser's own ring away. On this palette that state
 * change measures **1.74:1** against the panel, well under the 3:1 a focus indicator owes
 * a keyboard user, and no background fixes it: the value that finally reads as a change
 * (neutral-600, 3.09) drops the item's own text to 3.24. A ring is the only shape that
 * satisfies both, which is why the rest of the app already uses one.
 *
 * `brand-300` rather than the app's usual `brand-500`, and inset rather than outside:
 * the ring sits on the *focused* row, which is a lighter neutral-800, and brand-500 only
 * manages 2.34 against that. brand-300 measures 3.30 on the focused row and 5.73 on the
 * panel, so it holds wherever the roving focus lands.
 */
const ITEM_CLASS =
  'block w-full cursor-pointer px-3 py-2 text-left text-sm text-brand-800 hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-300 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:focus:bg-neutral-800'

export function MenuLink({
  to,
  children,
  testId,
}: {
  to: string
  children: ReactNode
  testId?: string
}) {
  const close = useMenuClose()
  return (
    <Link to={to} role="menuitem" tabIndex={-1} data-testid={testId} onClick={close} className={ITEM_CLASS}>
      {children}
    </Link>
  )
}

export function MenuButton({
  children,
  onClick,
  testId,
}: {
  children: ReactNode
  onClick: () => void
  testId?: string
}) {
  const close = useMenuClose()
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      data-testid={testId}
      onClick={() => {
        close()
        onClick()
      }}
      className={ITEM_CLASS}
    >
      {children}
    </button>
  )
}

export function Menu({
  /** What the trigger looks like. The accessible name comes from this, so it has to
   *  contain real text — an icon alone would leave the button unnamed. */
  trigger,
  children,
  triggerTestId,
  menuTestId,
  /** Which edge the panel hangs from. The account menu is at the right edge of the bar,
   *  where a left-aligned panel would run off the screen. */
  align = 'left',
  triggerClassName = '',
}: {
  trigger: ReactNode
  children: ReactNode
  triggerTestId?: string
  menuTestId?: string
  align?: 'left' | 'right'
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const triggerId = useId()
  const { pathname } = useLocation()

  /** Read out of the DOM rather than tracked in state: the items are `children`, so the
   *  only honest list of them is the one the browser has. */
  function items(): HTMLElement[] {
    return Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
  }

  function focusItem(index: number) {
    const list = items()
    if (list.length === 0) return
    list[(index + list.length) % list.length].focus()
  }

  // Opening puts focus on the first item. Without this the menu opens behind the
  // keyboard user's focus and there is no way into it. `open` is the only dependency
  // that matters: `focusItem` reads the live DOM rather than closing over anything.
  useEffect(() => {
    if (open) focusItem(0)
  }, [open])

  // A menu that survives the navigation it caused would hang over the new page. Adjusted
  // during render rather than in an effect: an effect would paint the open menu over the
  // new route for one frame first, and React's own guidance for "reset state when
  // something changes" is exactly this shape.
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    setOpen(false)
  }

  // Anywhere outside, including the page behind the panel. `contains` covers the trigger
  // too, so the very click that opened the menu cannot immediately close it again.
  useEffect(() => {
    if (!open) return
    function onDocumentClick(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onDocumentClick)
    return () => document.removeEventListener('click', onDocumentClick)
  }, [open])

  function close() {
    setOpen(false)
  }

  /** Escape's version. Closing without this leaves focus on an element that has just
   *  been hidden, and the browser drops it to `<body>` — which is a keyboard user back
   *  at the top of the document with no idea where they are. */
  function closeAndRefocus() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      if (!open) return
      event.preventDefault()
      closeAndRefocus()
      return
    }

    // Not prevented: Tab should move on to whatever follows the menu, and only the
    // panel needs to get out of the way first.
    if (event.key === 'Tab') {
      if (open) setOpen(false)
      return
    }

    const list = items()
    const current = list.indexOf(document.activeElement as HTMLElement)

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (!open) setOpen(true)
        else focusItem(current === -1 ? 0 : current + 1)
        return
      case 'ArrowUp':
        event.preventDefault()
        if (!open) setOpen(true)
        else focusItem(current === -1 ? list.length - 1 : current - 1)
        return
      case 'Home':
        if (!open) return
        event.preventDefault()
        focusItem(0)
        return
      case 'End':
        if (!open) return
        event.preventDefault()
        focusItem(list.length - 1)
        return
      default:
        return
    }
  }

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (!open) return
        const next = event.relatedTarget as Node | null
        if (next && wrapperRef.current?.contains(next)) return
        setOpen(false)
      }}
    >
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        data-testid={triggerTestId}
        onClick={() => setOpen((value) => !value)}
        // The identical `btn btn-sm sm:btn-md btn-quiet` the nav's inactive entries wear: a menu
        // trigger sitting in that row and looking like something else was the old bar's
        // one visible seam.
        className={`btn btn-sm sm:btn-md btn-quiet text-xs uppercase tracking-wide focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${triggerClassName}`}
      >
        {trigger}
        {/* 0.75rem rather than 0.6: the caret is drawn by a monochrome symbol font now
            rather than by the UI sans it used to fall through to, and that font's ▾ has
            a smaller face on the same em — at 0.6rem it read as a full stop. */}
        <span aria-hidden="true" className="text-[0.75rem] leading-none">
          ▾
        </span>
      </button>

      <div
        ref={menuRef}
        id={menuId}
        role="menu"
        aria-labelledby={triggerId}
        hidden={!open}
        data-testid={menuTestId}
        // `mt-2` rather than `mt-1`: the panel now carries a 3-4px hard offset shadow of
        // its own, and at `mt-1` that shadow collided with the trigger's hover edge.
        className={`absolute z-20 mt-2 min-w-44 overflow-hidden rounded-xl border border-brand-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 ${
          align === 'right' ? 'right-0' : 'left-0'
        }`}
      >
        <MenuContext value={{ close }}>{children}</MenuContext>
      </div>
    </div>
  )
}
