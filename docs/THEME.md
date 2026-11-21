# MealStretch UI theme: prompt for Claude Code

> **Paste into Claude Code:**
> `Read docs/THEME.md and apply it to the whole app. Then continue the build from the checkpoint in docs/progress.md.`

---

## Goal

Build the MealStretch design system and apply it to every screen. The look is based on the **Meal Hack app** (warm, calm, food-first): cream background, deep green, terracotta accents, soft rounded white cards, pill buttons and a floating bottom navigation bar.

We borrow the **design language** (palette family, spacing, shapes, layout patterns), not the brand. MealStretch must not be mistaken for Meal Hack, so follow the "Make it ours" rules in §6 strictly.

All brand values live in `lib/brand.ts` and `tailwind.config.ts` as tokens. Never hard-code a hex value in a component.

---

## 1. Design tokens

### Colours
| Token | Hex | Use |
|---|---|---|
| `bg` | `#FBF4EE` | App background (warm cream) |
| `surface` | `#FFFFFF` | Cards, sheets, inputs |
| `surface-muted` | `#F3EAE2` | Selected chip fill, subtle panels, skeletons |
| `border` | `#E9DED4` | Card and input borders, dividers |
| `primary` | `#1E4D3B` | Primary buttons, headings, bottom nav bar, active states |
| `primary-hover` | `#173D2F` | Pressed/hover |
| `primary-soft` | `#2F6B52` | Active tab pill inside the nav bar, secondary emphasis |
| `accent` | `#A6532E` | Terracotta: count badges, small highlights, onboarding titles |
| `savings` | `#C98A1B` | **MealStretch signature**: amber fill for the savings ring, icons and decorative accents (not for text) |
| `savings-text` | `#8A5A0F` | Amber for savings **text**: "−R20", "You save R118" (5.2:1 on `savings-soft`, 5.9:1 on white) |
| `savings-soft` | `#FBEFD6` | Background for savings chips and panels |
| `text` | `#22201E` | Body text |
| `text-muted` | `#6E655D` | Secondary text, captions, units |
| `danger` | `#B3261E` | Over-budget status, errors |
| `danger-soft` | `#FBE7E5` | Over-budget panel background |
| `success` | `#2E7D4F` | Under-budget tick, ticked list items |
| `info` | `#2F5DA8` | Small informational tags (e.g. "MEAL PLAN") |

Contrast: every text/background pair must meet WCAG AA (4.5:1 body, 3:1 large text). Add a unit test that checks the token pairs used for text. Checked so far: text/bg 14.9, text-muted/bg 5.2, primary/bg 8.8, white/primary 9.6, white/primary-soft 6.3, accent/white 5.4, savings-text/savings-soft 5.2, danger/danger-soft 5.5. **Never put `savings` (bright amber) text on light backgrounds**: it fails (2.6:1).

### Typography
- Headings: **Plus Jakarta Sans** (700, 800) via `next/font`, self-hosted, Latin subset only.
- Body/UI: **Inter** (400, 500, 600) via `next/font`.
- Scale (mobile): display 28/34 · h1 24/30 · h2 20/26 · h3 17/22 · body 16/24 · small 14/20 · caption 12/16.
- Money uses `font-variant-numeric: tabular-nums` so rands line up in lists.
- Headings on screens are `primary` green; body is `text`.

### Shape, spacing, elevation
- Radius: cards `24px`, inputs `16px`, chips and buttons `999px` (pill), images inside cards `16px`.
- Spacing: 4-pt grid; screen padding `20px`; gap between cards `12px`; inside cards `16–20px`.
- Shadows (soft and warm, never grey-black):
  - `shadow-card`: `0 1px 2px rgba(60,40,20,0.06), 0 4px 14px rgba(60,40,20,0.06)`
  - `shadow-float` (bottom nav, sheets): `0 8px 24px rgba(30,77,59,0.25)`
- Borders: `1px solid border` on cards that sit on the cream background.

### Motion
- 150–200 ms ease-out for presses, sheets and chips. Respect `prefers-reduced-motion`.
- Buttons scale to 0.98 when pressed.

---

## 2. Components to build (`components/ui/`)

Build these first, each in its own file with a small Storybook-style demo page at `/dev/ui` (dev only):

1. **Button**: variants `primary` (green fill, white text), `secondary` (white fill, green border and text), `ghost`, `danger`. Sizes `lg` (56 px, full width) and `md` (44 px). Pill shape. Loading state with spinner. Minimum touch target 44 px.
2. **Card**: white, radius 24, `shadow-card`, optional border; `CardHeader` / `CardBody` slots.
3. **Chip**: selectable pill. Unselected: white with border. Selected: `surface-muted` fill, `primary` border and text, check icon. Used for diets, days, avoid lists, loyalty cards and store filters.
4. **Badge**: small pill for counts (terracotta), status (`ACTIVE`, `SPECIAL`, `MEMBER PRICE`, `STALE`) and tags (`MEAL PLAN` in info blue).
5. **SavingsChip**: "−R20" pill with `savings-text` on `savings-soft`, the MealStretch signature for any saving.
6. **MoneyText**: renders integer cents via `formatRand`, tabular numbers, optional strikethrough for normal price.
7. **BottomNav**: floating pill bar in `primary`, 16 px from the screen edges and bottom (above the iOS safe area), `shadow-float`. Five items with icon + label: **Home · Plan · Tonight · List · Savings**. Active item: `primary-soft` pill behind icon and label. Icons: `lucide-react`.
8. **TopBar**: back button (circular, translucent white on photos, white with border on cream), title, optional right action.
9. **HeroCard**: full-bleed image or a solid `primary` panel with an overlay gradient, eyebrow badge ("UP NEXT"), title in white, a white pill primary action and a translucent secondary action. **Must work without an image**: use the solid green version when data-saver mode is on or the image fails.
10. **ShortcutTile**: square-ish card with icon in a soft circle, title and subtitle (e.g. "Cheaper week", "Use what I have", "Quick supper").
11. **StatRing**: donut showing savings %. The track is `surface-muted` and the fill is `savings`. The % is always shown as text in the centre (`savings-text`), so the ring is never the only signal. Accessible label.
12. **Sheet**: bottom sheet with grab handle, radius 28 on top corners, `shadow-float`, focus trap, closes on swipe-down and Escape.
13. **ListRow**: checkbox circle, name + size, price right-aligned, chevron; ticked state greys and strikes through.
14. **SectionHeader**: small uppercase muted label (e.g. "PLAN WEEK") or h3 title with an optional "See all" link.
15. **CoachMark**: tooltip card with title, text, dot stepper, Skip and Next/Done (green pill). Shown once per feature and stored in localStorage.
16. **EmptyState**, **Skeleton** (cream shimmer), **Toast**.

---

## 3. Screen patterns (apply to the PRD screens)

- **Home / Plan (PRD §7.2):** greeting line in green ("Good evening, Thandi 👋") with the location bar under it. Then the **plan summary card**, which must be rands first: big total, "R58 a plate", amber SavingsChip "You save R118 (23%)", budget status, StatRing, "See shopping list" primary button. Below it: "Tonight" HeroCard, then the day-by-day meal cards, then the Steal-of-the-week card on an amber-soft background.
- **Meal card:** white card. Left: day label, meal name (2 lines max), cost per plate in bold, time. Right: a 72 px rounded thumbnail (only when images are allowed). Action row: Swap · Cheaper · Remove as small green text buttons with icons.
- **Onboarding (O1–O3):** cream background; optional slim photo banner at the top with circular back/close buttons (skip the banner in data-saver mode); big green title; chips and steppers in white cards; sticky full-width green "Continue" button at the bottom with safe-area padding.
- **Shopping list:** store and aisle groups as cards with a header row (aisle name, subtotal, terracotta count badge), ListRows inside, sticky footer card with total and ticked count.
- **Sheets:** location picker, swap options and loyalty cards all use Sheet.
- **Savings screen:** big lifetime number in `savings-text`, StatRing, breakdown cards, "Scan a receipt" primary button.
- **Restyle the existing `components/ShopLocation.tsx`** with these components and tokens (it currently uses raw Tailwind colours).

---

## 4. Images and data use

- Food photos are optional decoration, never required for meaning.
- Plan list: no images by default (PRD §15). Thumbnails only on Wi-Fi or when the user turns them on in Settings ("Show food photos").
- Recipe view and the Tonight hero: one image ≤ 40 KB WebP, lazy-loaded, with a solid-colour fallback.
- Use **our own photos or properly licensed images only**. Never use Meal Hack's images.

---

## 5. Accessibility and quality

- Touch targets ≥ 44 px; visible focus rings (2 px `primary-soft` outline offset 2 px).
- Text scales to 200% without overlap; test the plan card and the list at large text.
- **Floating elements must never cover content.** Meal Hack's floating chat button overlaps prices and buttons, so we fix that:
  - no floating chat button in MVP;
  - pages get bottom padding equal to the nav height + safe area;
  - sticky footers sit above the bottom nav.
- Colour is never the only signal: savings show "−R20" text, over budget shows the word "over".
- Light mode only for MVP; build tokens so dark mode can be added later.

---

## 6. Make it ours (non-negotiable)

To avoid looking like a copy of Meal Hack (legal risk and user confusion):
1. **Logo, name, icon:** our own MealStretch wordmark and app icon. Do not reuse or imitate Meal Hack's logo, icon or illustrations.
2. **Signature colour:** amber `savings` for every money win. This is ours and should be visible on every main screen.
3. **Rands-first layout:** the plan summary card (total, per plate, savings, budget) is the hero, not a food photo. Calories are never more prominent than rands.
4. **Navigation:** our tabs are Home · Plan · Tonight · List · Savings (not their Home · Meal Plans · Smart Meal · Shopping · Settings). Settings lives behind the avatar/menu in the top bar.
5. **Copy:** write our own wording, in `messages/*.json`. Don't copy their text.
6. **No floating chat button** in MVP (fixes their overlap bug and keeps the UI calm).

---

## 7. Implementation steps

1. Add tokens to `tailwind.config.ts` (`theme.extend.colors`, `borderRadius`, `boxShadow`, `fontFamily`) and mirror the colours in `lib/brand.ts` (replace the current `colors` block with these values).
2. Load fonts with `next/font` in the root layout; set CSS variables.
3. Build the components in §2 with the `/dev/ui` demo page.
4. Restyle `components/ShopLocation.tsx` and any screens already built.
5. Apply the screen patterns in §3 to every screen built so far; screens in later phases must use these components from the start.
6. Tests:
   - token contrast unit test;
   - Playwright screenshot tests at 360 × 780 for: home/plan, meal card, shopping list, location sheet, onboarding O3, savings;
   - check that no element overlaps the bottom nav (assert bounding boxes in Playwright).
7. Run `pnpm typecheck && pnpm test && pnpm test:e2e`, show the output, commit `feat(ui): MealStretch design system`, log the theme in `docs/decisions.md`, update `docs/progress.md`, and continue the build from the checkpoint.
