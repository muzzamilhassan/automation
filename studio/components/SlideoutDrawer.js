'use client';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ButtonUtility } from '@/components/untitledui/base/buttons/button-utility';

export default function SlideoutDrawer({
  open,
  onClose,
  title,
  description,
  width = 'max-w-lg', // max-w-md (448px), max-w-lg (512px), max-w-xl (576px), max-w-2xl (672px)
  children,
  footer,
}) {
  const drawerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    // Lock body scroll
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = orig;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Slideout Container */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div
          ref={drawerRef}
          className={cn(
            'w-screen bg-surface border-l border-line shadow-2xl flex flex-col pop-in animate-in slide-in-from-right duration-250 ease-out',
            width
          )}
        >
          {/* Header */}
          <div className="flex items-start justify-between px-6 py-4.5 border-b border-line shrink-0">
            <div>
              <h2 id="drawer-title" className="font-display text-[16px] font-bold text-ink tracking-tight">
                {title}
              </h2>
              {description ? (
                <p className="text-[12px] text-muted mt-0.5 leading-relaxed">
                  {description}
                </p>
              ) : null}
            </div>
            <ButtonUtility
              size="sm"
              color="tertiary"
              icon={X}
              onClick={onClose}
              aria-label="Close drawer"
              className="-mr-1.5 -mt-1"
            />
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {children}
          </div>

          {/* Footer */}
          {footer ? (
            <div className="px-6 py-4 border-t border-line bg-surface-2 shrink-0 flex items-center justify-end gap-2.5">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
