import './ListHeader.css'

import type { ReactNode } from 'react'

export interface ListHeaderStat {
  /** PrimeIcons class, with or without `pi pi-` prefix. */
  icon?: string
  label: ReactNode
}

export interface ListHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  /** Inline statistics shown next to the title (e.g. counts). */
  stats?: ListHeaderStat[]
  /** Action area on the right side, typically buttons. */
  actions?: ReactNode
  /** `tab` is denser, suited for content rendered inside a tab panel. */
  variant?: 'page' | 'tab'
  className?: string
}

function normalizeIcon(icon: string): string {
  return icon.startsWith('pi ')
    ? icon
    : `pi ${icon.startsWith('pi-') ? icon : `pi-${icon}`}`
}

/**
 * Standard header used at the top of a list/grid view.
 *
 * Replaces the per-feature `*ListHeader` components — pass title, optional
 * subtitle, inline stats, and an actions slot. Layout, spacing, and
 * responsive collapse are handled here.
 */
export function ListHeader({
  title,
  subtitle,
  stats,
  actions,
  variant = 'page',
  className,
}: ListHeaderProps) {
  const classes = ['mod-list-header', `mod-list-header--${variant}`, className]
    .filter(Boolean)
    .join(' ')

  const HeadingTag = variant === 'tab' ? 'h2' : 'h1'

  return (
    <header className={classes}>
      <div className="mod-list-header__main">
        <HeadingTag className="mod-list-header__title">{title}</HeadingTag>
        {subtitle && <p className="mod-list-header__subtitle">{subtitle}</p>}
      </div>
      {(stats?.length || actions) && (
        <div className="mod-list-header__end">
          {stats && stats.length > 0 && (
            <div className="mod-list-header__stats">
              {stats.map((stat, idx) => (
                <span key={idx} className="mod-list-header__stat">
                  {stat.icon && (
                    <i className={normalizeIcon(stat.icon)} aria-hidden />
                  )}
                  {stat.label}
                </span>
              ))}
            </div>
          )}
          {actions && <div className="mod-list-header__actions">{actions}</div>}
        </div>
      )}
    </header>
  )
}
