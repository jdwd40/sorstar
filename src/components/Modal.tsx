import { useEffect, useRef, type ReactNode } from 'react'

interface ModalProps {
  onClose: () => void
  children: ReactNode
  /** Id of the element naming this dialog. Required: an unnamed modal is
   *  announced by screen readers as just "dialog". */
  labelledBy: string
  /**
   * Whether Escape or a click on the backdrop closes it. Defaults to true.
   *
   * An interrupted journey's encounter is the one dialog that must not be
   * dismissable: the ship is between planets, and there is no state to return
   * to until the player has chosen. It still traps focus either way.
   */
  dismissable?: boolean
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Modal({ onClose, children, labelledBy, dismissable = true }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    // Lock background scroll while the modal is open; restore on close.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (dismissable) onClose()
        return
      }
      if (e.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusables = dialog.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (focusables.length === 0) {
        e.preventDefault()
        dialog.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      if (e.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last || !dialog.contains(active)) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      previouslyFocused?.focus()
    }
  }, [onClose, dismissable])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      {dismissable ? (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm modal-fade" onClick={onClose} />
      ) : (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm modal-fade" />
      )}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative card p-6 w-full max-w-lg modal-pop max-h-[85vh] overflow-y-auto outline-none"

      >
        {children}
      </div>
    </div>
  )
}