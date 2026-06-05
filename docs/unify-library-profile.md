# Library + Public Profile — Unify Plan

> Owner-facing collection management (`/library`) and the public-shelf showcase (`/u/[username]`) currently render the same underlying `user_collections` data with **different taxonomies, different stats, different tabs, and different UIs.** This is the spec to consolidate them.

Status: **design** (June 2026). Implementation planned for weekend cycle.

---

## The current divergence (every inconsistency we'll resolve)

### Terminology drift

| Concept | `/library` says | `/u/[username]` says | DB value |
|---|---|---|---|
| Books you don't yet own | **Wishlist** | **Wantlist** | `status = 'wishlist'` |
| Selling | **Mark For Sale** | **For Sale** | `status = 'for_sale'` |
| Books you own | **Collection** | **Owned** | `status = 'owned'` |

### Tab structure

- `/library`: **Collection / Wishlist** (2 tabs).
- `/u/[username]`: **Owned / Wantlist / For Sale / Activity** (4 tabs).

Owner has no Activity tab on the management view. Public viewer has no way to see *just* the owner's CSV/PDF tools (which is correct, but the unification model needs to account for it).

### Stats divergence

- `/library` shows: Books in Collection, Unique Series, Publishers, Total Owned, Total Wishlist, Newest Year in View.
- `/u/[username]` shows: Owned, Wantlist, For Sale, Collection Value, Slabbed; sidebar adds Era focus, Slab ratio, Top publishers, optional Cost basis (owner only).

**Same data, two different curations.** Some overlap (Owned count appears on both with subtly different framing), some divergent (the library has *no* collection-value stat; the public profile *has no* unique-series count).

### Action surfaces

- `/library`: CSV upload, CSV export, PDF export, Add Comic, GradeEditor inline on each row, Mark For Sale toggle.
- `/u/[username]`: Share Profile, Edit Profile, Message, Manage library (cross-link back).

---

## The unified model

**One surface, two modes.** Every user has a single collection page at `/library` (owner view) and `/u/[username]` becomes a *render mode* of the same surface when viewed by a non-owner OR by the owner with `?view=public` set.

### Routing decision

- `/u/[username]` — **public view** (visitors and search engines). Read-only. Shows the public-facing curation of the user's collection.
- `/library` — **owner view, private**. Requires auth + ownership. Shows management controls.
- `/library?view=public` — **owner previewing what visitors see.** Identical render to `/u/[username]` but the owner can hit `?view=manage` (or just remove the param) to swap back.

This keeps the SEO-friendly public URL, keeps the owner workbench at a stable URL, and adds the one-click preview the original spec calls for.

### Unified taxonomy (locked decisions)

| User-facing label | DB value | Verb form |
|---|---|---|
| **Owned** | `owned` | "Add to collection" |
| **Wantlist** | `wishlist` | "Add to wantlist" |
| **For Sale** | `for_sale` | "Mark for sale" |

Picked **Wantlist** over **Wishlist** to match Discogs and because it surfaces as a public asset (a list other collectors can see / sellers can react to). The DB `status` value stays `'wishlist'` — no schema migration, only string changes in the UI.

### Unified tab structure

| Tab | Owner view | Public view |
|---|---|---|
| **Owned** | ✓ (with grade editor, mark-for-sale, sort, filter) | ✓ (read-only grid, grade badges visible if owner allowed) |
| **Wantlist** | ✓ (with remove + privacy toggle) | ✓ if `show_wantlist`, hidden otherwise |
| **For Sale** | ✓ (with listing controls) | ✓ if `show_for_sale`, hidden otherwise |
| **Activity** | ✓ recent adds/edits | ✓ recent adds, no edit-level events |

### Unified stats strip

One canonical stats row, shown above the tabs on both views:

| Stat | Source | Visibility |
|---|---|---|
| Owned | `count(status='owned')` | always |
| Wantlist | `count(status='wishlist')` | always if `show_wantlist`, else hidden |
| For Sale | `count(status='for_sale')` | always if `show_for_sale`, else hidden |
| Slabbed | `count(slab_company IS NOT NULL)` | always |
| Collection Value | `sum(market_value)` or `sum(auto_market_value)` | always if `show_value`, else hidden |
| Unique Series | `count(distinct series_title)` | always |

Sidebar (owner view AND public view, when data is visible):

- **Era focus** (dominant decade)
- **Top publishers** (top 5 by count)
- **Slab ratio** (% of collection that's slabbed)
- **Cost basis** — owner only (sum of `purchase_price`)

### Action surface — owner mode

The "manage" mode of `/library` keeps:
- CSV upload (with the tiered cap UX already shipped)
- CSV export (Pro-gated)
- PDF export (Pro-gated)
- Add Comic
- Per-row GradeEditor (Pro-gated for slab/cert/photo)
- Per-row Mark For Sale toggle
- Per-row Remove
- Sort + filter + grid/list toggle (already shipped)
- Search-within-library (already shipped)

Hidden in public mode. **Single toggle in the header:**

```
[ View as: ◉ Manage  ○ Public preview ]
```

Switching toggles a query param + re-renders the same component tree in public mode (controls hidden, public-only badges visible).

### Action surface — public mode

The public render adds:
- **Share Profile** (copy link)
- **Message** (if logged-in viewer, not owner)
- **Edit Profile** (only when viewer is owner — self-gates same way it does today)

---

## Implementation plan (weekend cycle)

### Phase 1 — Terminology + stats alignment (1–2 hrs)
Lowest-risk, highest-immediate-payoff. No structural changes; just string + count alignment.

- [ ] Rename "Wishlist" → "Wantlist" across `/library` UI strings (tab label, empty-state copy, modal text, share-button hint, button labels).
- [ ] Add `show_wantlist` / `show_value` / `show_for_sale` honoring on `/library` so the owner sees the *effect* of their privacy toggles (lets them validate before sharing).
- [ ] Add the Slabbed + Collection Value stats to `/library`'s stats row.
- [ ] Add Unique Series to `/u/[username]`'s stats row.
- [ ] Add Era focus / Slab ratio / Top publishers sidebar to `/library`.

### Phase 2 — Build the unified component (3–5 hrs)
Extract the render logic both pages currently duplicate into `<CollectionView mode="manage|public" />`.

- [ ] Create `src/components/CollectionView.js` taking `{ collection, profile, isOwner, mode }`.
- [ ] Move stats row + tab structure + grid render + sidebar from `/u/[username]/page.js` into `CollectionView`.
- [ ] Wire `/library/page.js` to render `<CollectionView mode="manage" />` and replace its current bespoke render.
- [ ] Wire `/u/[username]/page.js` to render `<CollectionView mode="public" />`.
- [ ] Verify both routes produce identical visual output for the same user's collection (mode-only differences: action controls visible/hidden).

### Phase 3 — Public-preview toggle (1 hr)
- [ ] Add header toggle on `/library` (owner only): "Manage / Public preview".
- [ ] `?view=public` query param switches the CollectionView mode prop without leaving the route.
- [ ] Persist the choice in localStorage so a reload keeps the chosen view.

### Phase 4 — Cleanup (1 hr)
- [ ] Delete duplicated stats computation in `/u/[username]/page.js`.
- [ ] Delete `getLibraryHref` / hydration logic that's now redundant.
- [ ] Audit cross-links: `/library` "Share my collection" → `/u/<username>`; `/u/<username>` "Manage library" → `/library`. Both stay; verify they read sensibly under the new taxonomy.

### Risks + mitigations

- **`show_wantlist` / `show_value` toggles already exist on `profiles`** but `/library` ignores them. Phase 1 surfaces them; verify the existing toggles still write correctly via `/api/profile/update` (or whatever it's called).
- **The hydrationCache module-scope `Map` in `/library/page.js`** is keyed by collection item id. The unified CollectionView must preserve hydration on view-mode toggles or the public-preview swap will flash placeholders.
- **`feedback_use_todo_checklists` user preference**: keep the TodoWrite checklist live across the build so the user can see progress.

### Out of scope for this unify

- Marketplace listing UI (Phase 4 of overall roadmap)
- Per-issue user-cover-photo flow refactor (separate concern)
- Mobile responsiveness audit on the unified surface (separate pass)
