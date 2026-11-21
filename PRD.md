# PRD: MealStretch

**Budget-first meal planning for South African households.** Tell us how much you have and until when. We plan your suppers around this week's specials at the shops near you, and show you exactly what you'll save.

|  |  |
|---|---|
| **Owner** | Zolile Nonzapa |
| **Status** | Draft v1.0, ready for build |
| **Date** | 21 Nov 2026 |
| **Build tool** | Claude Code (see `CLAUDE.md` for build rules) |
| **Stack** | Next.js (App Router) on Vercel · Neon Postgres + PostGIS · Tailwind · Claude API |
| **Pilot areas** | Bluewater Bay (Gqeberha, Nelson Mandela Bay) and Somerset West (Helderberg, Cape Town), each with a 15 km store radius |

The product name, tagline and store subtitle live in one constant (`lib/brand.ts`). Never hard-code the name in components.

**Brand:** MealStretch · **Tagline:** "Stretch the rand to every meal." · **Store title:** MealStretch: Budget Meal Planner

## Contents

- Problem and opportunity
- Users
- Competitive context
- Product principles
- Goals and success metrics
- Scope
- User flows and screens
- Functional requirements
- Planning engine specification
- Price data pipeline
- Recipe library
- Data model
- API contracts
- Notifications and habit loop
- Non-functional requirements
- Analytics events
- Build phases for Claude Code
- Risks and open questions
- Glossary

## 1. Problem and opportunity

**The problem.** Most South African households plan food backwards. They shop first, then work out what to cook, then run out of money before payday. The PMBEJD Household Food Basket cost about R5,530 in July 2026, which is more than the national minimum wage. Food is often bought last, after transport and electricity.

**What exists today:**

- **Meal planners** (Meal Hack, Samsung Food, Mealime) start from taste and diet. Cost is an output, never a constraint you set.
- **Price comparison apps** (Grocify, EasiShop) compare prices but don't tell you what to cook.
- **Retailer AI assistants** (Checkers Pixie, Pick n Pay Penny, My Woolies Chef) plan meals, but only inside one store. They will never tell you a competitor is cheaper.
**The opportunity.** No product starts from "I have R800 until the 25th for five people." MealStretch makes **budget an input**, plans **around specials**, picks meals that **share packs** so less is wasted, and covers stores competitors don't (Shoprite, SPAR and others near the user), priced at branch level.

## 2. Users

### Primary persona: Thandi, household food manager

- Lives in Bluewater Bay, Gqeberha, 40, feeds 4 (herself, partner, two school-age children).
- Bigger shop on payday at Checkers or Pick n Pay, top-ups during the week at the nearest SPAR or Shoprite.
- Smartphone on contract or prepaid; uses WhatsApp daily.
- Has Xtra Savings and Smart Shopper cards but doesn't always know which specials apply.
- Household income is stable, but rising food, fuel, school and electricity costs mean the money runs short before month-end.
- **Job to be done:** "Keep proper suppers on the table every night until payday without overspending or wasting food."

### Secondary persona: Lwazi, young professional

- Lives alone or with a partner in Somerset West. Shops at Checkers, Woolworths Food or Pick n Pay.
- **Job to be done:** "Stop spending R150 a night on takeaways and stop throwing food away."

### Tertiary (Phase 2): stokvel organiser

- Runs a 20-member grocery stokvel and plans the December bulk buy.

### Non-users for MVP

- Dieters tracking macros. Fitness users. People wanting gourmet recipes.

## 3. Competitive context

From a hands-on teardown of Meal Hack (Nov 2026):

| **Meal Hack observation** | **MealStretch response** |
|---|---|
| No budget input anywhere in onboarding | Budget + "until when" is onboarding screen 1 |
| ~7 decisions + login before first plan | 3 taps, no login before first plan |
| Store silently defaults to PnP; real setting buried in Settings | Store chosen from location in onboarding, branch-level |
| Loyalty cards in Settings with a misleading "Enrol" button | One-tap "cards you have" in onboarding; show member and normal price |
| Shoprite "not available yet"; no Boxer/Usave/SPAR | Launch with every chain that has a branch within 15 km of the pilot areas (expected: Checkers, Shoprite, Pick n Pay, SPAR, Woolworths), confirmed by the store import |
| Specials applied after the plan (4% savings in test) | Specials drive meal selection (target ≥15%) |
| 50 list items for 7 one-person dinners; 380 g jalapeños for one recipe | Engine chooses meals that share packs (target ≤22 items for 7 suppers) |
| AI-generated aspirational recipes (guajillo salsa) | Curated SA budget recipe library, human-checked |
| Calories shown more prominently than rands | Rand per plate everywhere |
| Async plan generation (progress bar, push when ready) | Deterministic engine, plan on screen in <1 s |
| ✅ Good: protein "never offer" swap memory, price per plate, honest "can't price 3 items", push with total | **Adopt all four** |

## 4. Product principles

- **Rands first.** Every screen answers "what will this cost me?" before anything else.
- **Value before account.** A plan appears before we ask for anything personal.
- **One question per screen.** If a screen needs explaining, cut it.
- **Never lie about money.** Every price has a source and a date. Unknown prices are shown as unknown, never guessed. Savings are calculated against a defined baseline (§9.7).
- **Familiar food.** Meals people already cook, done cheaper. Not a cooking course.
- **Light on data and battery.** It must work on a R1,500 Android on 3G.
- **Habit through relief, not guilt.** No punishing streaks, no calorie shaming, no dark-pattern paywalls. Anything that saves money is free.

## 5. Goals and success metrics

### Pilot goals (first 90 days after launch, ~500 households)

| **Metric** | **Definition** | **Target** |
|---|---|---|
| **Activation** | Plan generated in first session ÷ new visitors who start onboarding | ≥ 60% |
| **Week-4 planning retention** | Users who generate a plan in week 4 ÷ users activated in week 0 | ≥ 25% |
| **Savings rate** | Mean (savings ÷ normal-price basket) across generated plans | ≥ 15% |
| **Budget fit** | Plans that come in at or under the user's budget | ≥ 85% |
| **List efficiency** | Median shopping list items for a 7-supper plan, household of 4 | ≤ 22 |
| **Time to first plan** | Median seconds from landing to plan on screen | ≤ 60 s |
| **Price trust** | % of receipt-verified items within 5% of our price | ≥ 90% |
| **Receipts** | Receipts uploaded per weekly-active user per month | ≥ 1 |

### Guardrails

- Crash-free sessions ≥ 99.5%.
- Plan engine p95 latency ≤ 800 ms server-side.
- Zero incidents of a price shown without a source and date.

## 6. Scope

### MVP (Phases 0–8, about 8 weeks)

- Location + store selection (main + top-up), loyalty cards
- Budget-first onboarding (3 screens), anonymous use
- Supper plans for 3–14 days within budget, built around specials
- Swap / remove / "make it cheaper", with protein never-swap memory
- Shopping list grouped by aisle, offline-capable, ticks
- Pantry memory (leftover pack quantities carried forward)
- Savings: per plan + lifetime counter
- Notifications: specials day, 16:00 "tonight", month-end
- Price data: retailer catalogue ingest (pluggable), admin leaflet upload with Claude vision extraction, admin price review
- Receipt scan → verified savings + branch price observations
- Optional account (Google or email magic link), household sharing link
- English + isiXhosa UI (Afrikaans P1, for Somerset West)
- Installable PWA

### Phase 2 (post-pilot)

- WhatsApp channel (plan, list and month-end messages; location pin → stores)
- Month mode: monthly bulk staples + weekly top-ups
- Stokvel mode (group bulk buy planning)
- isiZulu, Sesotho
- Usave, Boxer, Food Lover's (if not already in the pilot-area import)
- Breakfast/lunch planning
- Native app (Expo) if PWA push or install rates disappoint

### Explicitly out of scope

- Ordering, payment or delivery (we hand off to retailer apps at most)
- Calorie/macro tracking, weight goals
- User-generated recipes
- AI-invented recipes shown to users without human review

## 7. User flows and screens

### 7.1 First run (no account)

Landing ──▶ [O1 Where] ──▶ [O2 Shops + cards] ──▶ [O3 Household + budget] ──▶ [P1 Plan]

```
              GPS / search     main, top-up,          people, portions,           instant
                               loyalty cards           R amount, until date
```



**O1: Where do you shop from?** (built: `components/ShopLocation.tsx`)

- "Use my current location" (low-accuracy GPS) or search suburb/section/street.
- Denied permission → search box focused. No error screen.
**O2: Pick your shops**

- Chips: nearest branch per chain. List sorted by distance with walk time.
- Tap = main shop, second tap = top-up (optional).
- Below the list: **"Cards you have"** with toggle chips: Xtra Savings, Smart Shopper, Boxer Rewards, SPAR Rewards, WRewards. Wording is "I have this card ✓", never "Enrol".
**O3: Who and how much?**

- People: stepper (1–12). Optional expand: "Some eat more?" → light / average / big counts (default all average).
- **"How much for suppers?"** R amount, numeric keypad.
- **"Until when?"** chips: `7 days` · `Until the 25th` · `Until month-end` · `Pick a date` (3–14 days).
- Optional single row: "Anything you don't eat?" → pork / beef / fish / nuts / dairy chips. Everything else lives in Settings.
- CTA: **"Plan my suppers"**.

### 7.2 Plan screen (P1), the home screen once a plan exists

┌───────────────────────────────────────┐

│ Shopping near Bluewater Bay ▾          │

│ Checkers + SPAR                        │

├───────────────────────────────────────┤

│ 7 suppers · R58 a plate                │

│ R406 at Checkers · 2.1 km              │

│ You save R118 (23%) · 6 specials used  │

│ ✅ R194 left of your R600              │

│ [ See shopping list · 19 items ]       │

├───────────────────────────────────────┤

│ TONIGHT · Mon                          │

│ Curry mince & rice      R61/plate      │

│ 35 min · uses ½ the 1 kg mince         │

│ [Cook] [Swap] [Cheaper]                │

├───────────────────────────────────────┤

│ Tue  Chicken stew & pap    R52/plate   │

│ Wed  Pilchard fishcakes    R38/plate   │

│ ...                                    │

├───────────────────────────────────────┤

│ Steal of the week: 2kg chicken braai   │

│ pack R79.99 at Checkers (lowest 8 wks) │

└───────────────────────────────────────┘



Rules:

- The header always shows **total, per plate, savings in rands and %, and budget status**.
- If over budget: red status **"R44 over your R600"** + button **"Fit my budget"**, which re-runs the engine in cheaper mode (§9.6).
- Unpriced items: "2 items we can't price yet" link → list them. Never silently dropped.
- Price date: "Prices checked 21 Nov" small under the total.
- Each meal shows **rands per plate**, cook time, and a pack-sharing hint when relevant.

### 7.3 Meal actions

- **Swap** → bottom sheet with 3 alternatives, each with delta: `−R22`, `+R15`, `same`. Includes "Never suggest swapping my [chicken]" for protein swaps.
- **Cheaper** → one tap, the engine finds the cheapest valid replacement for this slot.
- **Remove** → slot cleared; list updates; ingredients no longer needed are removed and the user is told how much they saved.
- **Cook** → recipe view: ingredients scaled to household, steps, timer chips.

### 7.4 Shopping list (L1)

- Grouped by store (if top-up shop used), then by aisle category.
- Each line: product name, pack size, quantity, price, `SPECIAL` / `MEMBER PRICE` tags.
- "Already have it" swipe → moves to pantry, total updates.
- Sticky footer: **"Total R406 · 0/19 ticked"**.
- Works offline once loaded (service worker cache).
- Share: "Send list on WhatsApp" (plain-text deep link `https://wa.me/?text=`).

### 7.5 Savings (S1)

- Big number: **"You've saved R2,340 with MealStretch"** (lifetime, only goes up).
- Breakdown: specials, card prices, pack sharing, verified by receipts.
- "Scan a receipt" CTA.

### 7.6 Receipt scan (R1)

- Camera / upload → "Reading your slip…" → matched lines with ✓ / ? → "Confirmed: you paid R398. Normal price R471. **Saved R73.**"
- Unmatched lines are shown but don't count towards savings.

### 7.7 Account prompt

Triggered only by: saving a plan for next week, sharing with household, or a 2nd visit. Copy: "Keep your savings total and plans on any phone." Options: Google, email link. Skippable.

### 7.8 Settings

Location and shops · Loyalty cards · Household & portions · Foods we avoid · Proteins we never swap · Payday (day of month / grant date) · Notifications · Language · Data & privacy (export / delete).

## 8. Functional requirements

Format: **ID · requirement · acceptance criteria**. Priority: P0 = MVP must, P1 = MVP should, P2 = later.

### 8.1 Location and stores (LOC)

| **ID** | **P** | **Requirement** | **Acceptance criteria** |
|---|---|---|---|
| LOC-1 | P0 | Detect location via browser geolocation | Low accuracy, 10 s timeout; coords rounded to 3 dp before leaving the device; label resolved from `places` (no paid API) |
| LOC-2 | P0 | Search suburb / section / street | Debounced 250 ms; local DB results first; Google Places only for digits-in-query or <3 local results; session tokens used |
| LOC-3 | P0 | Nearby stores with auto-widening radius | 5 → 10 → 25 → 50 km until ≥3 results; nearest per chain returned |
| LOC-4 | P0 | Main + optional top-up shop | Persisted locally; synced to `user_shops` on sign-up |
| LOC-5 | P1 | "My shop isn't listed" report | Creates `branch_reports` row with retailer, note, coarse point |
| LOC-6 | P0 | Persistent location bar | Visible on plan and list screens; tap opens sheet at shops step |

LOC-1 to LOC-4 and LOC-6 are implemented in this repo; integrate and test them (Phase 1).

### 8.2 Onboarding (ONB)

| **ID** | **P** | **Requirement** | **Acceptance criteria** |
|---|---|---|---|
| ONB-1 | P0 | No account before first plan | Anonymous `household` created with a device UUID cookie (httpOnly, 1 year) |
| ONB-2 | P0 | Loyalty card selection | Chips for cards relevant to chosen shops; stored on household |
| ONB-3 | P0 | Household size + portion styles | Default all average; weights light 0.75 / average 1.0 / big 1.4 |
| ONB-4 | P0 | Budget amount + period | Integer rands; period 3–14 days; "until the 25th" computes days from payday setting (default 25) |
| ONB-5 | P1 | Quick avoid list | pork, beef, fish, nuts, dairy, gluten; maps to recipe exclusion tags |
| ONB-6 | P0 | Time to plan | Median ≤ 60 s in usability test; ≤ 3 screens after location |

### 8.3 Planning (PLN)

| **ID** | **P** | **Requirement** | **Acceptance criteria** |
|---|---|---|---|
| PLN-1 | P0 | Generate supper plan within budget | Engine per §9; deterministic for same inputs + seed |
| PLN-2 | P0 | Specials-driven selection | Specials reflected in objective; plan reports specials used |
| PLN-3 | P0 | Pack sharing | Engine accounts for leftover pack quantities; leftover shown per ingredient |
| PLN-4 | P0 | Variety constraints | No recipe repeated; same main protein ≤ 2× per 7 days; same starch ≤ 3× per 7 days |
| PLN-5 | P0 | Over-budget handling | Status shown + "Fit my budget" runs cheaper mode; if still over, show the gap and the cheapest possible plan |
| PLN-6 | P0 | Swap with deltas | 3 alternatives ranked by objective, price delta vs current |
| PLN-7 | P0 | "Cheaper" one-tap | Replaces slot with cheapest valid recipe; shows rands saved |
| PLN-8 | P0 | Remove meal | List and totals update; removed-only ingredients drop off |
| PLN-9 | P1 | Protein never-swap | Tapping "never suggest swapping" adds protein to household list; engine never proposes swaps away from it |
| PLN-10 | P0 | Unpriced ingredients | Never estimated; listed as "can't price yet"; excluded from totals with explicit note |
| PLN-11 | P0 | Pantry deduction | Pantry quantities consumed before buying |
| PLN-12 | P1 | Two-shop split | If top-up shop set: each item goes to the cheaper shop only if saving ≥ R5 per item and total split saving ≥ R30 (avoid trivial second trips) |
| PLN-13 | P1 | Natural-language tweak | "No fish this week", "quicker meals" → Claude parses to structured constraints (§9.8), engine re-runs |

### 8.4 Shopping list (LST)

| **ID** | **P** | **Requirement** | **Acceptance criteria** |
|---|---|---|---|
| LST-1 | P0 | Generated from plan | Pack-level lines (not recipe-level ingredients); quantities = packs to buy |
| LST-2 | P0 | Grouped by store then aisle | Aisle from `product_categories.aisle_order` |
| LST-3 | P0 | Tick off, offline | Tick state in IndexedDB, synced when online |
| LST-4 | P0 | "Already have it" | Moves to pantry, re-prices plan |
| LST-5 | P0 | Pantry staples toggle | Oil, salt, spices etc. excluded by default, shown as separate optional section with its own subtotal |
| LST-6 | P1 | Share to WhatsApp | Plain text: store, items, packs, total |

### 8.5 Savings (SAV)

| **ID** | **P** | **Requirement** | **Acceptance criteria** |
|---|---|---|---|
| SAV-1 | P0 | Per-plan savings | Baseline per §9.7; split into specials / member price / pack efficiency |
| SAV-2 | P0 | Lifetime counter | Sum of savings from plans marked "shopped" + receipt-verified savings; never double counts |
| SAV-3 | P0 | Mark plan as shopped | Prompt on list completion or 48 h after plan start |
| SAV-4 | P1 | Steal of the week | Biggest % special on an item used in ≥5 library recipes, at user's shops |

### 8.6 Receipts (RCP)

| **ID** | **P** | **Requirement** | **Acceptance criteria** |
|---|---|---|---|
| RCP-1 | P0 | Upload or photograph receipt | Image ≤ 2 MB after client-side compression; stored in Vercel Blob, private |
| RCP-2 | P0 | Extract lines with Claude vision | JSON schema output (§10.4); retailer, branch text, date, lines, total |
| RCP-3 | P0 | Match to products | Alias → fuzzy → unmatched queue; confidence stored |
| RCP-4 | P0 | Verified savings | Only matched lines with known normal price count |
| RCP-5 | P0 | Price observations | Matched lines create branch-level `price_observations` (source = receipt) |
| RCP-6 | P0 | POPIA | No card numbers or names stored; image deleted after 30 days; consent checkbox first time |

### 8.7 Admin (ADM)

| **ID** | **P** | **Requirement** | **Acceptance criteria** |
|---|---|---|---|
| ADM-1 | P0 | Admin area behind role check | `/admin`, allow-listed emails |
| ADM-2 | P0 | Leaflet upload → extraction → review | Claude extracts products, prices, valid dates; admin approves/edits before publish |
| ADM-3 | P0 | Unmatched product queue | Map raw names to `products`, create aliases |
| ADM-4 | P0 | Recipe editor | CRUD recipes + ingredients; publish flag; preview cost at a chosen branch |
| ADM-5 | P1 | Branch reports queue | Accept/reject; accepted creates/updates branch with `verified = true` |
| ADM-6 | P1 | Price health dashboard | Stale prices by retailer, coverage % of recipe ingredients per retailer |

### 8.8 Accounts and sharing (ACC)

| **ID** | **P** | **Requirement** | **Acceptance criteria** |
|---|---|---|---|
| ACC-1 | P0 | Anonymous household | Device UUID; all features work without an account |
| ACC-2 | P1 | Sign in with Google or email link | Auth.js; email via Resend; anonymous household merged on sign-in |
| ACC-3 | P1 | Household share link | Read + tick access to plan and list; revocable |
| ACC-4 | P0 | Data export + delete | Settings → JSON export; delete removes household, plans, receipts, observations' user link |

### 8.9 Language (I18N)

| **ID** | **P** | **Requirement** | **Acceptance criteria** |
|---|---|---|---|
| I18N-1 | P0 | All UI strings externalised | `next-intl`; no hard-coded copy in components |
| I18N-2 | P0 | English + isiXhosa | Human-reviewed isiXhosa strings before pilot |
| I18N-4 | P1 | Afrikaans | Human-reviewed Afrikaans strings (Somerset West) |
| I18N-3 | P1 | Recipe names + steps translatable | `recipe_translations` table |

## 9. Planning engine specification

The engine is a **pure TypeScript package** (`packages/engine`): no I/O, no network, no LLM. Given the same input and seed it returns the same plan. All money is **integer cents**; all quantities are **integer grams, millilitres or units**.

### 9.1 Inputs

```
type Cents = number;            // integer
type Qty = number;              // integer grams | ml | units (per ingredient.unit)
interface PlanRequest {
  days: number;                                   // 3..14 suppers
  household: { light: number; average: number; big: number }; // counts
  budgetCents: Cents | null;
  shops: { mainBranchId: number; topUpBranchId: number | null };
  loyalty: string[];                              // e.g. ['xtra_savings']
  exclusions: string[];                           // recipe tags to exclude: 'pork', 'fish', 'nuts' ...
  neverSwapProteins: string[];                    // ingredient ids
  pantry: { ingredientId: string; qty: Qty }[];
  pinned: { day: number; recipeId: string }[];    // user-locked slots
  blocked: string[];                              // recipe ids removed/disliked
  mode: 'balanced' | 'cheapest';
  maxCookMinutes: number | null;
  seed: number;
}
```



Plus a **price snapshot** loaded by the API layer before calling the engine:

```
interface PriceSnapshot {
  asOf: string;                                   // ISO date
  // per ingredient, the purchasable packs at each relevant branch
  offers: Record<string /*ingredientId*/, Offer[]>;
}
interface Offer {
  productId: number;
  branchId: number;
  packQty: Qty;                 // e.g. 1000 (g)
  priceCents: Cents;            // shelf price
  memberPriceCents: Cents | null; // loyalty price if card held, else null
  specialPriceCents: Cents | null; // non-member promo
  specialEndsOn: string | null;
  observedAt: string;
  source: 'catalogue' | 'leaflet' | 'receipt' | 'manual';
}
```

### 9.2 Effective price

For each offer: `effective = min(priceCents, specialPriceCents ?? ∞, (hasCard ? memberPriceCents : ∞) ?? ∞)`. **Normal price** for savings baseline = `priceCents` (shelf, no special, no card). Offers older than **21 days** are excluded. Offers older than **7 days** are used but flagged `stale` (UI: "price may have changed").

### 9.3 Portions

`servings = light × 0.75 + average × 1.0 + big × 1.4`, rounded up to the nearest 0.5. Recipe ingredient quantities are per 1 serving; scale by `servings`, round each up to the ingredient's `roundTo` (e.g. 50 g, 1 unit).

### 9.4 Pack selection (per ingredient)

Given required quantity `Q` (after pantry deduction) and offers at the target branch, choose a multiset of packs with total ≥ Q at minimum effective cost.

- Unbounded knapsack DP over quantity in steps of the ingredient's `roundTo`, capped at `Q + largestPack`.
- Tie-break: fewer packs, then less leftover.
- Output: packs to buy, cost, normal-price cost, leftover qty.
- No offers → ingredient `unpriced` (PLN-10).

### 9.5 Meal selection

**Objective (minimise):**

`J = basketCostCents`

```
  + λ_waste  × valueOfLeftoverCents        // leftovers that no other planned meal or pantry will use
  + λ_variety × varietyPenalty
  − λ_pref   × preferenceScore              // favourites, cuisines liked, quick meals if maxCookMinutes
```



Defaults: `balanced` → λ_waste 0.5, λ_variety 1500, λ_pref 800. `cheapest` → λ_waste 0.8, λ_variety 600, λ_pref 0. Leftover value counts at 100% for perishables (`ingredient.perishable = true`) and 20% for shelf-stable items (they go to pantry).

**Hard constraints:**

- Recipe published, not excluded by tags, not blocked, ≤ maxCookMinutes.
- No recipe twice. Main protein ≤ 2 per 7 days (pro rata). Starch base ≤ 3 per 7 days.
- Pinned slots fixed.
- ≥ 1 meat-free supper per 7 days in `cheapest` mode (it's almost always the cheapest lever).
**Algorithm (must finish ≤ 300 ms for 14 days × 200 recipes):**

- **Candidate pruning:** score each recipe standalone (cost per serving at effective unit prices, pro-rata), keep the top 60 plus all recipes using ingredients on special.
- **Greedy build:** fill days in order. For each day pick the candidate with the lowest marginal `J`. Marginal cost accounts for leftovers from packs already bought: an ingredient whose leftover covers the need costs 0.
- **Local search:** for up to 400 iterations or 150 ms, try (a) replacing one slot with one of its top-15 alternatives, (b) swapping two slots' recipes. Accept if `J` decreases. Seeded PRNG for tie-breaks and iteration order.
- **Re-price** the final basket exactly with §9.4 (greedy used approximations).
- **Assign shops** (PLN-12) if a top-up shop is set.

### 9.6 Budget handling

- If `basketCents ≤ budgetCents`: done.
- Else re-run in `cheapest` mode. If still over: return the cheapest plan with `budget.status = 'over'` and `shortfallCents`. Also return the **max days affordable** within budget (binary search on `days`), so the UI can say "R600 covers 5 suppers. Want 5 instead of 7?"

### 9.7 Savings definition (must match UI copy exactly)

For the chosen branch(es):

- `normalCents` = Σ packs × shelf price (no specials, no card), **same packs** the engine chose.
- `paidCents` = Σ packs × effective price.
- `savingsCents = normalCents − paidCents`, split into `specials`, `member`.
- `packEfficiencyCents` (shown separately, not added to savings %): cost of buying each recipe's ingredients independently minus `paidCents`. This shows the value of pack sharing.
Never compare against another store's prices in the headline savings. Cross-store comparison is shown only as "R140 cheaper than Pick n Pay for the same list" when the same products/packs are priced at both.

### 9.8 LLM boundary

Claude is used **only** to:

- Parse natural-language tweaks into `PlanRequest` patches (structured JSON tool output, validated with Zod). Example: "no fish and quicker" → `{ exclusions:+['fish'], maxCookMinutes:30 }`.
- Extract leaflets and receipts (§10).
- Assist **admins** in drafting recipes and translations (always human-reviewed before publish).
Claude **never** outputs prices, totals, or recipes shown directly to users. Any LLM output that would change money is re-computed by the engine.

### 9.9 Output

```
interface PlanResult {
  meals: { day: number; date: string; recipeId: string; servings: number;
           costCents: Cents; perPlateCents: Cents; sharesWith: number[] /*days*/ }[];
  basket: { ingredientId: string; productId: number; branchId: number; packs: number;
            packQty: Qty; unitCents: Cents; normalUnitCents: Cents;
            tags: ('special'|'member'|'stale')[]; leftoverQty: Qty }[];
  unpriced: { ingredientId: string; neededQty: Qty; recipes: string[] }[];
  pantryStaples: { ingredientId: string; costCents: Cents | null }[];  // excluded from totals
  totals: { paidCents: Cents; normalCents: Cents; savingsCents: Cents;
            specialsCents: Cents; memberCents: Cents; packEfficiencyCents: Cents;
            perPlateCents: Cents; items: number };
  budget: { budgetCents: Cents | null; status: 'under' | 'over' | 'none';
            remainingCents: Cents | null; shortfallCents: Cents | null; maxAffordableDays: number | null };
  leftovers: { ingredientId: string; qty: Qty }[];   // → pantry when plan marked shopped
  specialsUsed: number;
  priceAsOf: string;
  engineVersion: string;
  seed: number;
}
```

### 9.10 Engine test requirements

- Unit tests for: pack DP (exact, overshoot, multi-pack, no offers), portion scaling, savings maths, variety constraints, determinism (same seed → identical output), budget fallback, pantry deduction.
- **Golden tests:** 5 fixture households × fixture price snapshot → snapshot plans committed to repo.
- **Property tests:** total = Σ lines; savings ≥ 0; no hard constraint violated; ≤ 300 ms.

## 10. Price data pipeline

### 10.1 Sources (in order of trust)

| **Source** | **Scope** | **How** | **Freshness** |
|---|---|---|---|
| `receipt` | Branch | User receipts (RCP) | Real-time, highest trust |
| `leaflet` | Chain or region | Admin uploads specials leaflets → Claude vision → review | Weekly |
| `catalogue` | Chain (online) | Pluggable importer per retailer | Daily |
| `manual` | Any | Admin entry | Ad hoc |

**Resolution rule** for an (ingredient, branch): use the most trusted observation within 7 days; else most recent within 21 days; else none.

### 10.2 Catalogue importers (pluggable)

- Interface `RetailerImporter { retailerId; fetchProducts(): AsyncIterable<RawProduct> }` in `lib/importers/`.
- **Legal gate:** importers that read retailer websites must not be enabled in production until the open question in §18 is resolved. Build the interface + a CSV importer first (admins can paste/upload price lists).

### 10.3 Product matching

- Exact alias match (`product_aliases.alias_norm`).
- Fuzzy: `pg_trgm` similarity ≥ 0.55 on normalised name **and** matching size (parsed "2kg", "750ml", "6s").
- Else → `unmatched_items` queue for admin.
Normalisation: lowercase, strip brand noise words, standardise units (`kg→g`, `l→ml`), parse multipacks (`6 x 410g`).

### 10.4 Claude extraction schema (leaflets + receipts)

Use the Messages API with a tool whose `input_schema` is:

`{`

```
  "type": "object",
  "required": ["document_type", "retailer", "lines"],
  "properties": {
    "document_type": { "enum": ["leaflet", "receipt"] },
    "retailer": { "type": "string" },
    "branch_text": { "type": ["string", "null"] },
    "date": { "type": ["string", "null"], "description": "ISO date of purchase or leaflet start" },
    "valid_until": { "type": ["string", "null"] },
    "total_cents": { "type": ["integer", "null"] },
    "lines": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["raw_name", "price_cents"],
        "properties": {
          "raw_name": { "type": "string" },
          "size_text": { "type": ["string", "null"] },
          "quantity": { "type": "number", "default": 1 },
          "price_cents": { "type": "integer" },
          "was_price_cents": { "type": ["integer", "null"] },
          "member_only": { "type": "boolean", "default": false },
          "confidence": { "type": "number" }
        }
      }
    }
  }
}
```



- Model IDs live in env (`CLAUDE_MODEL_VISION`, `CLAUDE_MODEL_FAST`). Use a Sonnet-class model for vision extraction and a Haiku-class model for tweak parsing.
- Validate with Zod. Reject lines where `price_cents ≤ 0` or > R5,000. Receipt: Σ lines must be within 2% of `total_cents`, otherwise mark `needs_review`.
- Strip personal data before storing (card numbers, names, phone numbers).

## 11. Recipe library

### 11.1 Launch set

**80 curated suppers** (minimum 60 for the pilot), weighted toward:

- pap / rice / samp / potato / pasta / bread bases
- chicken (portions, livers, feet, mince), beef mince & stewing beef, pilchards/tinned fish, eggs, beans/lentils/soya mince, boerewors/polony/viennas
- one-pot, ≤ 45 min, cheap appliances (2-plate stove), no oven required for ≥ 70%
Examples: curry mince & rice · chicken stew & pap · pilchard fishcakes & chakalaka · samp & beans (umngqusho) · soya mince bolognaise · cabbage & boerewors · chicken livers peri-peri & pap · egg & potato curry · beef stew & dumplings · lentil curry & rice · tuna pasta · chicken & veg pot · pap & wors with tomato gravy · spinach & pilchard stew · pasta with mince & tomato.

### 11.2 Rules

- Every ingredient maps to a canonical `ingredients.id` (e.g. `beef_mince`, `chicken_portions_mixed`, `maize_meal`, `onion`).
- Quantities per serving, in g/ml/units.
- Tags: `protein:<id>`, `starch:<id>`, `meat_free`, `contains:pork|beef|fish|nuts|dairy|gluten`, `one_pot`, `no_oven`, `kid_friendly`.
- `pantry_staple` ingredients (oil, salt, curry powder, stock cubes) flagged at ingredient level.
- Human-checked: cooked at least once by a tester before `published = true`.
Seed format: see `seed/recipes.sample.json`.

## 12. Data model

Existing (built): `retailers`, `branches`, `places`, `user_shops`, `user_saved_places`, `branch_reports`, `nearby_branches()` in `db/001_stores_location.sql`.

New tables (Phase 2 migration `db/002_core.sql`; write as Drizzle schema, see `CLAUDE.md`):

`-- Households (anonymous first; user link optional)`

```
households (
  id uuid pk default gen_random_uuid(),
  device_id uuid unique,                -- cookie for anonymous use
  user_id uuid null references users(id),
  light int not null default 0, average int not null default 1, big int not null default 0,
  loyalty text[] not null default '{}',
  exclusions text[] not null default '{}',
  never_swap_proteins text[] not null default '{}',
  payday_dom int null check (payday_dom between 1 and 31),
  language text not null default 'en',
  created_at timestamptz default now()
)
users (id uuid pk, email text unique, name text, created_at timestamptz)   -- Auth.js adapter tables as required
household_members_access (household_id, user_id, role text check (role in ('owner','member')), primary key(household_id,user_id))
share_links (token text pk, household_id uuid, created_at, revoked_at)
-- Catalogue
ingredients (
  id text pk,                            -- 'beef_mince'
  name text not null, unit text not null check (unit in ('g','ml','unit')),
  round_to int not null default 1,
  perishable boolean not null default true,
  pantry_staple boolean not null default false,
  category text not null                 -- 'meat','produce','dry','dairy','tinned','frozen','spices'
)
products (
  id bigserial pk, retailer_id text references retailers(id),
  ingredient_id text references ingredients(id),
  name text not null, brand text, pack_qty int not null, pack_unit text not null,
  category_id int references product_categories(id),
  is_house_brand boolean default false, active boolean default true
)
product_aliases (id bigserial pk, product_id bigint references products(id), alias_norm text not null, source text)
  -- gin trigram index on alias_norm
product_categories (id serial pk, name text, aisle_order int)
-- Prices
price_observations (
  id bigserial pk, product_id bigint references products(id),
  branch_id bigint null references branches(id),     -- null = chain-wide
  retailer_id text not null references retailers(id),
  price_cents int not null, member_price_cents int null, special_price_cents int null,
  special_ends_on date null,
  source text not null check (source in ('catalogue','leaflet','receipt','manual')),
  observed_at timestamptz not null, ingest_batch_id bigint null,
  created_at timestamptz default now()
)
  -- index (product_id, branch_id, observed_at desc); (retailer_id, observed_at desc)
current_prices  -- materialised view applying §10.1 resolution rule; refreshed after each ingest
ingest_batches (id bigserial pk, kind text, retailer_id text, uploaded_by uuid, status text, raw jsonb, created_at)
unmatched_items (id bigserial pk, batch_id bigint, raw_name text, size_text text, price_cents int, resolved_product_id bigint null, status text)
-- Recipes
recipes (
  id text pk, name text, description text, cook_minutes int, steps jsonb,
  tags text[], image_url text null, published boolean default false, version int default 1
)
recipe_ingredients (recipe_id text references recipes(id), ingredient_id text references ingredients(id),
  qty_per_serving int not null, optional boolean default false, primary key (recipe_id, ingredient_id))
recipe_translations (recipe_id, language, name, steps jsonb, primary key(recipe_id, language))
-- Plans
plans (
  id uuid pk, household_id uuid references households(id),
  start_date date, days int, request jsonb not null, result jsonb not null,
  engine_version text, seed int, price_as_of date,
  status text check (status in ('draft','active','shopped','archived')) default 'active',
  paid_cents int, normal_cents int, savings_cents int,
  created_at timestamptz default now()
)
list_ticks (plan_id uuid, line_key text, ticked boolean, updated_at timestamptz, primary key(plan_id, line_key))
pantry_items (household_id uuid, ingredient_id text, qty int, updated_at timestamptz, primary key(household_id, ingredient_id))
-- Receipts & savings
receipts (id uuid pk, household_id uuid, branch_id bigint null, retailer_id text, purchased_on date,
  total_cents int, image_url text, extraction jsonb, status text, created_at timestamptz,
  image_delete_after timestamptz)
receipt_lines (id bigserial pk, receipt_id uuid, raw_name text, product_id bigint null, qty numeric,
  price_cents int, normal_price_cents int null, match_confidence real)
savings_events (id bigserial pk, household_id uuid, kind text check (kind in ('plan_shopped','receipt_verified')),
  ref_id text, savings_cents int, created_at timestamptz, unique(kind, ref_id))
-- Notifications & analytics
push_subscriptions (id bigserial pk, household_id uuid, endpoint text unique, keys jsonb, created_at)
notification_log (id bigserial pk, household_id uuid, kind text, sent_at timestamptz, opened_at timestamptz null)
events (id bigserial pk, household_id uuid null, name text, props jsonb, created_at timestamptz default now())
```



## 13. API contracts

All routes under `app/api`. JSON in/out. Errors: `{ error: { code, message } }` with proper HTTP status. Validate every input with Zod. Household identified by `device_id` cookie or session.

| **Method** | **Route** | **Purpose** |
|---|---|---|
| GET | `/api/location` | Search / resolve / reverse **(built)** |
| GET | `/api/stores/nearby` | Nearby branches **(built)** |
| GET/PUT | `/api/household` | Read/update household profile, loyalty, exclusions, shops |
| POST | `/api/plans` | Body: partial `PlanRequest` (server fills from household) → `{ planId, result }` |
| GET | `/api/plans/:id` | Plan + result |
| POST | `/api/plans/:id/swap` | `{ day }` → 3 alternatives with deltas |
| POST | `/api/plans/:id/replace` | `{ day, recipeId \| 'cheapest' }` → updated result |
| DELETE | `/api/plans/:id/meals/:day` | Remove meal |
| POST | `/api/plans/:id/tweak` | `{ text }` → Claude parse → engine re-run → `{ patch, result }` |
| POST | `/api/plans/:id/shopped` | Mark shopped → savings_event + pantry leftovers |
| PUT | `/api/plans/:id/ticks` | Batch tick updates `{ lines: [{ key, ticked }] }` |
| GET/PUT | `/api/pantry` | Pantry items |
| POST | `/api/receipts` | multipart image → `{ receiptId, status }` (processing async, poll) |
| GET | `/api/receipts/:id` | Extraction + matching + verified savings |
| GET | `/api/savings` | Lifetime + breakdown |
| POST | `/api/push/subscribe` | Web push subscription |
| POST | `/api/reports/branch` | Missing/closed store report |
| * | `/api/admin/*` | Leaflets, unmatched queue, recipes, reports (role-gated) |

`POST /api/plans` example response (truncated):

`{`

```
  "planId": "8c1e...",
  "result": {
    "totals": { "paidCents": 40600, "normalCents": 52400, "savingsCents": 11800,
                "specialsCents": 8200, "memberCents": 3600, "packEfficiencyCents": 6100,
                "perPlateCents": 5800, "items": 19 },
    "budget": { "budgetCents": 60000, "status": "under", "remainingCents": 19400,
                "shortfallCents": null, "maxAffordableDays": null },
    "specialsUsed": 6,
    "priceAsOf": "2026-11-21"
  }
}
```



## 14. Notifications and habit loop

Channel: Web Push (PWA, iOS 16.4+ installed, Android Chrome). Phase 2: WhatsApp templates for the same moments.

| **Kind** | **When** | **Copy (example)** | **Deep link** |
|---|---|---|---|
| `specials_day` | Morning after new specials ingested for user's shops | "New specials are in. This week's 7 suppers: R598, R31 less than last week." | Plan regenerate preview |
| `tonight` | 16:00 local, days with a planned meal | "Tonight: curry mince & rice, 35 min." | Recipe |
| `month_end` | 7 and 3 days before payday, if a plan is active | "6 days to payday. Here are 6 suppers for R410." | Plan for remaining days |
| `payday` | Morning of payday | "Payday. Plan the next stretch in one tap." | Onboarding O3 prefilled |
| `receipt_nudge` | 24 h after plan marked shopped, if no receipt | "Snap your slip to confirm what you saved." | Receipt scan |

Rules:

- Max 1 notification per day except `tonight`. Quiet hours 20:00–07:00.
- Each kind can be switched off individually; the prompt asks permission after the first plan, with an explanation screen first.
- Log every send/open to `notification_log`.

## 15. Non-functional requirements

| **Area** | **Requirement** |
|---|---|
| **Performance** | First load JS ≤ 180 KB gz on plan route; LCP ≤ 2.5 s on throttled 3G (Lighthouse mobile); engine p95 ≤ 800 ms end-to-end server |
| **Data usage** | No images in plan list by default (recipe images load only in recipe view, ≤ 40 KB WebP); total first session ≤ 1.5 MB |
| **Offline** | Shopping list, current plan and recipes cached by service worker; ticks queued |
| **Devices** | Works on Android 9+ Chrome, iOS 16+ Safari; 360 px wide minimum; touch targets ≥ 44 px |
| **Accessibility** | WCAG 2.1 AA contrast; all controls labelled; font scaling to 200% without breaking layout |
| **Privacy (POPIA)** | Coarse location only; consent before receipts and push; data export + delete; receipt images auto-deleted after 30 days; privacy notice in plain English + isiXhosa; no third-party ad trackers |
| **Security** | All inputs Zod-validated; parameterised SQL only; admin routes role-checked server-side; rate limits on `/api/location` (Google cost), `/api/plans/*/tweak` and `/api/receipts` (Claude cost); secrets only in Vercel env |
| **Cost control** | Google Places gated (§8.1); Claude calls cached by content hash; per-household daily caps: 10 tweaks, 5 receipts |
| **Observability** | Structured logs with request id; Sentry (or Vercel monitoring) for errors; engine timings logged |
| **Attribution** | "© OpenStreetMap contributors" in store picker footer |

## 16. Analytics events

Stored in `events` (first-party, no third-party trackers). Props always include `household_id` (anonymous), `app_version`.

`onboarding_started` · `location_set {source}` · `shops_set {main_retailer, has_top_up}` · `cards_set {count}` · `budget_set {cents, days, people}` · `plan_generated {ms, paid_cents, savings_pct, items, status}` · `plan_over_budget {shortfall_cents}` · `fit_budget_tapped` · `meal_swapped {delta_cents}` · `meal_cheaper {saved_cents}` · `meal_removed` · `tweak_submitted {parsed_ok}` · `list_opened` · `list_item_ticked` · `list_completed` · `plan_marked_shopped` · `receipt_uploaded` · `receipt_verified {savings_cents, match_rate}` · `push_permission {granted}` · `notification_opened {kind}` · `account_created {method}` · `share_link_created`

Pilot dashboard (Phase 8): activation funnel, W1–W4 retention cohorts, savings distribution, budget fit rate, list size distribution, receipt match rate.

## 17. Build phases for Claude Code

Work **one phase at a time**. Each phase ends with: typecheck clean, tests green, acceptance criteria demonstrated, `docs/progress.md` updated. Don't start the next phase until the current one's Definition of Done is met.

### Phase 0: Repo foundation (0.5 day)

- Next.js App Router + TypeScript strict + Tailwind + pnpm; ESLint; Vitest; Zod; `next-intl` scaffold (en, xh).
- Drizzle ORM with Neon HTTP driver; migrations folder; `db/001_stores_location.sql` applied as migration 0001.
- `lib/brand.ts` (product name, colours). Env validation (`lib/env.ts` with Zod).
- **DoD:** `pnpm dev` runs; `pnpm typecheck && pnpm test` pass; CI workflow (GitHub Actions) runs both.

### Phase 1: Location & stores (1 day)

- Integrate existing `components/ShopLocation.tsx`, `app/api/location`, `app/api/stores/nearby`, `scripts/import-osm.ts`.
- Run importer against Neon for the Eastern Cape and Western Cape; manually verify every branch within 15 km of Bluewater Bay and Somerset West (`verified = true`).
- Add loyalty card chips to the shops step (ONB-2). Add `/api/reports/branch` (LOC-5).
- **DoD:** LOC-1…6 acceptance criteria pass; Playwright test: deny geolocation → search "Bluewater Bay" → pick a Checkers branch → persisted on reload.

### Phase 2: Catalogue, ingredients, recipes (2 days)

- Migration `0002_core` for catalogue, prices, recipes tables (§12).
- Seed: `seed/ingredients.json`, `seed/recipes.sample.json` → loader script `scripts/seed.ts`. Expand to ≥ 60 recipes (admin-authored; Claude may draft, a human must review).
- CSV price importer (`scripts/import-prices-csv.ts`) + `current_prices` materialised view + refresh function.
- **DoD:** every published recipe's ingredients have ≥ 1 product at Shoprite and Checkers in fixture data; resolution rule (§10.1) unit-tested.

### Phase 3: Planning engine (3 days)

- `packages/engine`: types (§9.1, §9.9), pack DP, portioning, greedy + local search, budget fallback, savings maths, seeded PRNG.
- Fixtures + golden tests + property tests (§9.10). Benchmark test asserting ≤ 300 ms.
- **DoD:** all engine tests pass; `pnpm bench:engine` prints p95 < 300 ms on 14 days × 200 recipes.

### Phase 4: Onboarding + plan screen (2 days)

- Anonymous household (ONB-1), O3 screen, `POST /api/plans`, plan screen (§7.2) with totals, budget status, per-plate, unpriced, price date.
- **DoD:** fresh device → plan on screen in ≤ 3 screens after location; over-budget path shows "Fit my budget" and works.

### Phase 5: Meal actions, list, pantry (2 days)

- Swap / Cheaper / Remove / Never-swap (PLN-6…9); shopping list (LST-1…5) with offline ticks; pantry (PLN-11, LST-4); mark shopped (SAV-3) → leftovers into pantry.
- **DoD:** Playwright: generate plan → swap Tue → tick 3 items offline → reload online → ticks persist; savings totals reconcile with lines.

### Phase 6: Savings, PWA, notifications (1.5 days)

- Savings screen + lifetime counter (SAV-1…4); manifest + service worker; web push (subscribe, send via `web-push`, Vercel Cron for `tonight`, `month_end`, `payday`, `specials_day`).
- **DoD:** installable PWA (Lighthouse PWA pass); notifications respect quiet hours and caps (unit tests on scheduler).

### Phase 7: Claude features: receipts, leaflets, tweaks (2.5 days)

- `lib/claude.ts` wrapper (tool-use JSON, Zod validation, content-hash cache, cost logging).
- Receipts (RCP-1…6), admin leaflet flow (ADM-2), unmatched queue (ADM-3), tweak parsing (PLN-13).
- **DoD:** 10 sample receipt photos (fixtures) extract with ≥ 90% line accuracy; totals check enforced; personal data stripped (test).

### Phase 8: Accounts, sharing, admin, pilot readiness (2 days)

- Auth.js (Google + Resend email link), anonymous merge (ACC-2), share links (ACC-3), export/delete (ACC-4).
- Admin: recipe editor (ADM-4), reports queue (ADM-5), price health (ADM-6). Events + pilot dashboard (§16). isiXhosa strings reviewed.
- **DoD:** end-to-end pilot checklist in `docs/pilot-checklist.md` all ticked.

## 18. Risks and open questions

| **#** | **Risk / question** | **Mitigation / owner** |
|---|---|---|
| 1 | **Legality of reading retailer websites for prices** (terms of use, Copyright/database rights, ECTA) | Get SA legal advice before enabling any web importer in production. MVP runs on leaflets + receipts + CSV/manual. Owner: Zolile |
| 2 | Price accuracy at the till | Branch-level receipts, staleness flags, "price may have changed" copy, never estimate unknowns |
| 3 | Retailers add budget planning to their apps | Our moat: cross-store neutrality, budget-first, mass-market stores, branch-level receipt data |
| 4 | Meal Hack adds Shoprite | Compete on budget input, pack-sharing engine, local recipes, WhatsApp, stokvel |
| 5 | PWA push on iOS needs install | Install prompt after first plan; WhatsApp in Phase 2 as the primary re-engagement channel |
| 6 | Recipe quality | Tester cooks every recipe before publish; thumbs up/down after cooking |
| 7 | Claude / Google costs | Caching, daily caps, local-first search, Haiku for parsing |
| 8 | Gaps or outdated stores in OpenStreetMap | Branch reports + manual verification of both pilot areas |
| 9 | **Open:** monetisation | Planned: labelled sponsored swaps (only when genuinely cheaper), R19–R29 Plus tier (stokvel, multi-household), anonymised price insights. Decide after pilot |
| 10 | **Open:** SMS/WhatsApp OTP for sign-in (many target users lack email habits) | Evaluate WhatsApp Cloud API auth templates in Phase 2 |
| 11 | **Open:** payday defaults (SASSA grant dates vs 25th) | Ask in Settings; default 25th; validate in pilot interviews |

## 19. Glossary

- **Branch:** a physical store (e.g. a specific Checkers in Somerset West).
- **Canonical ingredient:** recipe-level ingredient (`beef_mince`) mapped to many products.
- **Effective price:** cheapest of shelf, special and member price available to this household.
- **Normal price:** shelf price with no special and no card; the savings baseline.
- **Pack sharing:** choosing meals so one pack (e.g. 2 kg chicken) feeds several suppers.
- **Pantry staple:** cheap long-life items (oil, salt, spices) excluded from totals by default.
- **Top-up shop:** optional second store for items meaningfully cheaper there.
- **Stale price:** observation older than 7 days (shown with a warning); excluded after 21 days.
