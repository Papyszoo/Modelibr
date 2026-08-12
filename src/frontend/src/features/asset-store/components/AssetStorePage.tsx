import './AssetStorePage.css'

import { Button } from 'primereact/button'
import { useEffect, useState } from 'react'

import {
  EmptyState,
  ErrorState,
  ListHeader,
  LoadingState,
} from '@/shared/components'
import { useAssetStoreAuthStore } from '@/stores/assetStoreAuthStore'

import { useStoreLibraryQuery } from '../api/queries'
import { logoutOfStoreSession } from '../lib/session'
import {
  getConfiguredStoreUrl,
  getStoreUrlConfigError,
} from '../lib/storeConfig'
import type { StoreLibraryItem } from '../types'
import { StoreLibraryGrid } from './StoreLibraryGrid'
import { StoreLoginForm } from './StoreLoginForm'
import { StorePackDetail } from './StorePackDetail'

/**
 * Asset Store tab — the user signs into the companion store, sees their
 * library, and imports packs into this Modelibr instance with one click.
 * Browsing/purchasing happens on the store site; this page is library +
 * import only. It is an OPTIONAL online surface: unconfigured, offline, or
 * store-down all degrade to one quiet feedback state.
 */
export function AssetStorePage() {
  const storeUrl = getConfiguredStoreUrl()
  const status = useAssetStoreAuthStore(state => state.status)
  const username = useAssetStoreAuthStore(state => state.username)
  const isLoggedIn = status === 'loggedIn'

  const [page, setPage] = useState(1)
  const [openPack, setOpenPack] = useState<StoreLibraryItem | null>(null)
  const library = useStoreLibraryQuery({ page })

  // A new session (possibly a different account) starts from page 1 — a
  // stale page index could point past the new library's last page. Signing out
  // also closes any open pack detail.
  useEffect(() => {
    if (!isLoggedIn) {
      setPage(1)
      setOpenPack(null)
    }
  }, [isLoggedIn])

  const headerActions = isLoggedIn ? (
    <>
      <span className="asset-store-user" data-testid="asset-store-user">
        <i className="pi pi-user" aria-hidden="true" />
        {username}
      </span>
      <Button
        label="Sign out"
        size="small"
        text
        onClick={() => logoutOfStoreSession()}
        data-testid="asset-store-logout"
      />
    </>
  ) : undefined

  const renderContent = () => {
    if (!storeUrl) {
      const configError = getStoreUrlConfigError()
      if (configError) {
        return (
          <EmptyState
            icon="pi-shopping-bag"
            title="Store URL rejected"
            message={`${configError} The configured value is ignored until it is fixed.`}
          />
        )
      }
      return (
        <EmptyState
          icon="pi-shopping-bag"
          title="Asset Store not configured"
          message="Set VITE_STORE_URL in your environment to connect this instance to an asset store. Everything else in Modelibr works without it."
        />
      )
    }

    if (!isLoggedIn) {
      return (
        <div className="asset-store-login-center">
          <StoreLoginForm />
        </div>
      )
    }

    if (openPack) {
      return (
        <StorePackDetail item={openPack} onBack={() => setOpenPack(null)} />
      )
    }

    if (library.isPending) {
      return <LoadingState message="Loading your store library…" />
    }

    if (library.isError) {
      return (
        <ErrorState
          title="Store unavailable"
          message="Could not load your store library. The store may be down, or you may be offline — your local assets are unaffected."
          onRetry={() => void library.refetch()}
        />
      )
    }

    const data = library.data
    if (!data || data.items.length === 0) {
      return (
        <EmptyState
          icon="pi-shopping-bag"
          title="Your store library is empty"
          message={
            <>
              Add packs to your library on the store site, then import them
              here.{' '}
              <a href={storeUrl} target="_blank" rel="noreferrer">
                Open the store
              </a>
            </>
          }
        />
      )
    }

    return <StoreLibraryGrid items={data.items} onOpenPack={setOpenPack} />
  }

  const totalPages = library.data?.totalPages ?? 0
  // The pager belongs to the library grid, not the pack detail.
  const showPager = isLoggedIn && !openPack && (totalPages > 1 || page > 1)

  return (
    <div className="asset-store-page" data-testid="asset-store-page">
      <ListHeader
        variant="tab"
        title="Asset Store"
        subtitle={storeUrl ?? undefined}
        stats={
          isLoggedIn && library.data
            ? [{ icon: 'pi-inbox', label: `${library.data.totalCount} items` }]
            : undefined
        }
        actions={headerActions}
      />
      <div className="asset-store-content">{renderContent()}</div>
      {showPager && (
        <div className="asset-store-pager" data-testid="asset-store-pager">
          <Button
            icon="pi pi-chevron-left"
            size="small"
            text
            disabled={page <= 1 || library.isFetching}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            aria-label="Previous page"
            data-testid="asset-store-prev-page"
          />
          <span>
            Page {page} of {Math.max(totalPages, page)}
          </span>
          <Button
            icon="pi pi-chevron-right"
            size="small"
            text
            disabled={page >= totalPages || library.isFetching}
            onClick={() => setPage(p => p + 1)}
            aria-label="Next page"
            data-testid="asset-store-next-page"
          />
        </div>
      )}
    </div>
  )
}
