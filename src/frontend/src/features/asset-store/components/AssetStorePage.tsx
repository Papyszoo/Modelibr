import './AssetStorePage.css'

import { Button } from 'primereact/button'

import {
  EmptyState,
  ErrorState,
  ListHeader,
  LoadingState,
} from '@/shared/components'
import { useAssetStoreAuthStore } from '@/stores/assetStoreAuthStore'

import { useStoreLibraryQuery } from '../api/queries'
import { logoutOfStoreSession } from '../lib/session'
import { getConfiguredStoreUrl } from '../lib/storeConfig'
import { StoreLibraryGrid } from './StoreLibraryGrid'
import { StoreLoginForm } from './StoreLoginForm'

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

  const library = useStoreLibraryQuery()

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
      return (
        <EmptyState
          icon="pi-shopping-bag"
          title="Asset Store not configured"
          message="Set VITE_STORE_URL in your environment to connect this instance to an asset store. Everything else in Modelibr works without it."
        />
      )
    }

    if (!isLoggedIn) {
      return <StoreLoginForm />
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

    const page = library.data
    if (!page || page.items.length === 0) {
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

    return <StoreLibraryGrid items={page.items} />
  }

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
    </div>
  )
}
