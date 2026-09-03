# Build 4 — skip the bundler entirely

## Why

Your new error came from code the single-file bundler generates at runtime, not
from anything in the app:

    Unexpected token '-'
    const declared variable 'sc' must have an initializer

That is a generated declaration built from a tag name (`sc-for` / `sc-if`, the
template's loop and conditional elements). It is inside the bundler's own
unpacking layer, so I cannot patch it from the app's side.

The fix is to stop bundling. GitHub Pages can serve the app as ordinary files,
which is exactly the code path that works in the editor — no generated code, no
unpacking step, and it loads faster.

## Upload these three, keeping the folders

    index.html
    support.js
    _ds/modernist-129e2e6c-b4a0-4c55-b006-8e8913ecc223/styles.css

Put them at the ROOT of tripplanapp (index.html replaces the bundled one you
uploaded before). The `_ds` path must be kept exactly — nested folders and all.

**Easiest way:** open the repo and press `.` to launch github.dev, then drag the
unzipped folder contents into the file tree. It preserves nested folders, which
the drag-and-drop upload page does not always do.

## Then

1. Delete the Home Screen icon if you added one.
2. Open `https://willstout87.github.io/tripplanapp/?v=4`
3. Confirm it loads, then Share -> Add to Home Screen.

## Checking it worked

The header chip should read **LIVE · 4 BAROMETER** and the four city cards
should show Rome $1,672, London $646, Honolulu $266, Cancun $1,294.

If a stylesheet fails to load you will see unstyled text — that means the `_ds`
folder did not land at the right path. Everything else would still work.
