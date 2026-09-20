import { useEffect, type ReactNode } from 'react'

interface ModalProps {
  onClose: () => void
  children: ReactNode
  labelledBy?: string
  className?: string
}

export default function Modal({ onClose, children, labelledBy, className }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm modal-fade" onClick={onClose} />
      <div
        className={`relative card p-6 w-full max-w-lg modal-pop max-h-[85vh] overflow-y-auto ${className ?? ''}`}
      >
        {children}
      </div>
    </div>
  )
}