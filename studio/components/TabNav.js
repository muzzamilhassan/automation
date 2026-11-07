'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';
import { cn } from '@/lib/utils';

export default function TabNav({
  tabs,
  activeTab,
  onChange,
  paramName = 'tab',
  className,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleSelect = useCallback(
    (id) => {
      if (onChange) onChange(id);
      if (paramName) {
        const next = new URLSearchParams(searchParams ? searchParams.toString() : '');
        next.set(paramName, id);
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      }
    },
    [onChange, paramName, pathname, router, searchParams]
  );

  return (
    <div
      role="tablist"
      aria-label="Sub navigation"
      className={cn(
        'flex items-center gap-1 border-b border-line pb-px overflow-x-auto no-scrollbar',
        className
      )}
    >
      {tabs.map((t) => {
        const selected = activeTab === t.id;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={selected}
            aria-controls={`tabpanel-${t.id}`}
            id={`tab-${t.id}`}
            onClick={() => handleSelect(t.id)}
            className={cn(
              'group relative flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors duration-150 ease-out cursor-pointer',
              selected
                ? 'text-ink'
                : 'text-muted hover:text-ink hover:bg-surface-2/60 rounded-t-lg'
            )}
          >
            {Icon ? (
              <Icon
                size={15}
                className={cn(
                  'transition-colors shrink-0',
                  selected ? 'text-accent' : 'text-faint group-hover:text-muted'
                )}
              />
            ) : null}
            <span>{t.label}</span>
            {t.badge != null && t.badge !== '' ? (
              <span
                className={cn(
                  'ml-1 text-[10.5px] font-bold px-1.5 py-0.2 rounded-full tnum',
                  t.badgeTone === 'bad'
                    ? 'bg-bad/15 text-bad'
                    : t.badgeTone === 'warn'
                    ? 'bg-warn/15 text-warn'
                    : selected
                    ? 'bg-accent/20 text-accent-ink dark:text-accent'
                    : 'bg-surface-2 text-faint'
                )}
              >
                {t.badge}
              </span>
            ) : null}

            {/* Active underline indicator */}
            {selected ? (
              <span className="absolute bottom-0 inset-x-0 h-[2px] bg-accent rounded-full animate-in fade-in duration-150" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
