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

import { useStoreCatalogQuery, useStoreLibraryQuery } from '../api/queries'
import { logoutOfStoreSession } from '../lib/session'
import { STORE_URL } from '../lib/storeConfig'
import type { StoreLibraryItem } from '../types'
import { StoreLibraryGrid } from './StoreLibraryGrid'
import { StoreLoginForm } from './StoreLoginForm'
import { StorePackDetail } from './StorePackDetail'

/**
 * Asset Store tab. Anyone can browse the store's public catalog and import
 * FREE packs without an account - the same anonymous path the MCP agent import
 * uses. Signing in switches to your store library and unlocks paid packs and
 * account features; the login form is only surfaced where an account is
 * actually needed. Browsing/purchasing happens on the store site; this page is
 * catalog + library + import only. It is an online surface: offline or
 * store-down degrade to one quiet feedback state.
 */
export function AssetStorePage() {
  const storeUrl = STORE_URL
  const status = useAssetStoreAuthStore(state => state.status)
  const username = useAssetStoreAuthStore(state => state.username)
  const isLoggedIn = status === 'loggedIn'

  const [page, setPage] = useState(1)
  const [openPack, setOpenPack] = useState<StoreLibraryItem | null>(null)
  // Signed-out only: the page browses the public catalog by default and swaps
  // to the sign-in form when a store account is asked for (header action, a
  // paid pack's detail, or account features).
  const [showLogin, setShowLogin] = useState(false)

  const library = useStoreLibraryQuery({ page })
  const catalog = useStoreCatalogQuery({ page })
  const active = isLoggedIn ? library : catalog

  // Any session change starts from page 1 - a stale page index could point
  // past the new list's last page - and closes both the pack detail and the
  // sign-in view.
  useEffect(() => {
    setPage(1)
    setOpenPack(null)
    setShowLogin(false)
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
  ) : showLogin ? undefined : (
    <Button
      label="Sign in"
      size="small"
      text
      onClick={() => setShowLogin(true)}
      data-testid="asset-store-sign-in"
    />
  )

  const renderContent = () => {
    if (!isLoggedIn && showLogin) {
      return (
        <div className="asset-store-login-center">
          <div className="asset-store-login-stack">
            <StoreLoginForm />
            <Button
              label="Back to browsing"
              size="small"
              text
              onClick={() => setShowLogin(false)}
              data-testid="asset-store-login-back"
            />
          </div>
        </div>
      )
    }

    if (openPack) {
      return (
        <StorePackDetail
          item={openPack}
          onBack={() => setOpenPack(null)}
          onRequestSignIn={() => setShowLogin(true)}
        />
      )
    }

    if (active.isPending) {
      return (
        <LoadingState
          message={
            isLoggedIn
              ? 'Loading your store library…'
              : 'Loading the store catalog…'
          }
        />
      )
    }

    if (active.isError) {
      return (
        <ErrorState
          title="Store unavailable"
          message={
            isLoggedIn
              ? 'Could not load your store library. The store may be down, or you may be offline - your local assets are unaffected.'
              : 'Could not load the store catalog. The store may be down, or you may be offline - your local assets are unaffected.'
          }
          onRetry={() => void active.refetch()}
        />
      )
    }

    const data = active.data
    if (!data || data.items.length === 0) {
      return isLoggedIn ? (
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
      ) : (
        <EmptyState
          icon="pi-shopping-bag"
          title="No packs to show"
          message={
            <>
              The store catalog has no packs right now. Browse the store to find
              more.{' '}
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

  const totalPages = active.data?.totalPages ?? 0
  // The pager belongs to the listing surface, not the pack detail or sign-in.
  const showPager = !showLogin && !openPack && (totalPages > 1 || page > 1)

  return (
    <div className="asset-store-page" data-testid="asset-store-page">
      <ListHeader
        variant="tab"
        title="Asset Store"
        subtitle={storeUrl}
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
            disabled={page <= 1 || active.isFetching}
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
            disabled={page >= totalPages || active.isFetching}
            onClick={() => setPage(p => p + 1)}
            aria-label="Next page"
            data-testid="asset-store-next-page"
          />
        </div>
      )}
    </div>
  )
}
