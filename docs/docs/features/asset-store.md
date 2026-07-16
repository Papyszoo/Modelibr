---
sidebar_position: 13
---

# Asset Store

The **Asset Store** tab connects your Modelibr instance to a companion asset
store: sign in with your store account, see the packs in your store library,
and import them into your local library with one click.

This is an **optional online surface**. Modelibr stays fully local-first —
when no store is configured, or the store is unreachable, the page shows a
single quiet status and nothing else in the app is affected.

## Configuring

Point your instance at a store by setting `VITE_STORE_URL` in your `.env`
before building/starting the frontend:

```bash
VITE_STORE_URL=https://your-store.example
```

`https` is required for remote stores; plain `http` is accepted only for a
store running on `localhost`.

## Signing in

Open the **Asset Store** tab from the New Tab page (Organize group) and sign
in with your store account. Your credentials and tokens talk **directly to
the store from your browser** — they never pass through your local Modelibr
backend and are kept in memory only, so you sign in again after restarting
the app.

## Importing a pack

Each library entry shows its preview, title, author, and size:

1. Click **Import** on a pack. The store issues a short-lived, single-asset
   import token, and your local backend pulls the pack's files directly from
   the store — the button shows live progress.
2. When the import finishes, click **Open in library** to jump to the
   imported pack.

Imports are **idempotent**: files you already have (matched by content hash)
are linked instead of re-downloaded, and re-importing a pack updates the
existing pack instead of creating a duplicate. Already-imported entries show
an **Imported ✓** badge with a **Re-import** action.

The imported pack records its provenance (store and asset id), keeps the
store's preview as its thumbnail, and maps store tags onto your per-asset-type
tag vocabularies.
