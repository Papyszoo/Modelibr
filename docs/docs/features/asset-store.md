---
description: Connect the optional companion asset store to browse your store library and import packs into Modelibr with one click. Modelibr stays local-first without it.
sidebar_position: 16
---

# Asset Store

The **Asset Store** tab connects your Modelibr instance to a companion asset
store: sign in with your store account, see the packs in your store library,
and import them into your local library with one click.

This is an **online surface**. Modelibr stays fully local-first - if the store
is unreachable, the page shows a single quiet status and nothing else in the
app is affected (see [Troubleshooting](/docs/features/troubleshooting)).

The Asset Store is built in and always connects to the hosted Asset Store -
Modelibr's fixed store address. There is nothing to configure.

## Signing in

Open the **Asset Store** tab from the New Tab page (Organize group) and sign
in with your store account. Your credentials and tokens talk **directly to
the store from your browser** - they never pass through your local Modelibr
backend.

Your session is kept on this machine so you stay signed in across restarts and
is scoped only to the Modelibr Store. **Sign out** clears it immediately.

## Importing a pack

Each library entry shows its preview, title, author, and size:

1. Click **Import** on a pack. The store issues a short-lived, single-asset
   import token, and your local backend pulls the pack's files directly from
   the store - the button shows live progress.
2. When the import finishes, click **Open in library** to jump to the
   imported pack.

Imports are **idempotent**: files you already have (matched by content hash)
are linked instead of re-downloaded, and re-importing a pack updates the
existing pack instead of creating a duplicate. Already-imported entries show
an **Imported ✓** badge with a **Re-import** action.

The imported pack records its provenance (store and asset id), keeps the
store's preview as its thumbnail, and merges the store's tags into your tag
library, where they join the same pool as tags you add yourself. Items that
carry a store taxonomy category arrive already organized: the import finds - or
creates - a category with that name in the matching asset type's category tree
and files the item under it. Re-importing a pack also fills in categories for
assets imported before the pack had category data - a category you assigned
yourself is never overwritten.

## Free and paid assets

Signing in matters most for **paid** packs. A paid pack imports only with your
own store session: the store issues a short-lived, asset-scoped token per
import, so the purchase stays yours and the files are pulled with your account.
A **free** pack is public, so it can be imported without one - which is also how
an AI agent can bring a free pack home by itself, but never a paid one.
