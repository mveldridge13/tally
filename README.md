# Tally

**Split simply. Settle easily.**

Tally is a shared-money app: shared expenses, group balances and settlements. It is deliberately
**not** a budgeting app, so there are no budgets or personal finance dashboards.

Platform focus: **Android first**, including foldables (Galaxy Z Fold8). The Expo codebase is
cross-platform, so iOS is turned on later without a rewrite.

## Repository layout

```
apps/
  mobile/        Expo (SDK 58) + React Native + Expo Router + TanStack Query + Zustand
packages/
  shared/        Pure TypeScript used by the app: money helpers, split engine,
                 balance engine and breakdowns, PayID rules, Zod schemas (tested)
supabase/
  migrations/    The database: tables, Row Level Security, and the functions that
                 enforce the money rules
  tests/         Database tests against a local Supabase stack
scripts/         phone.sh, studio.sh, generate-icons.mjs
```

The backend is **Supabase** (Postgres, Auth, Row Level Security). The app talks to it directly;
every write goes through database functions that re-check the money rules.

## Core rules

- **Money is integer cents.** $125.50 is stored as `12550`. Columns are named `…_cents`.
- **Splits always sum to the total.** Leftover cents go to the largest fractional remainder,
  with ties going to whoever is listed first.
- **Percentages are basis points.** 33.33% is `3333`, and they must total `10000`.
- **Balances are derived, never stored.** Every group nets to zero.
- **History is kept.** Repayments are settlements and never edit an expense; expense edits are
  snapshotted; deletes are soft; corrected payments keep the original.
- **Each group has one currency.** Totals in different currencies are never added together.
- **Guests** can be added by name and claim their history when they join.
- **PayID** (Australia only) is shown so people can copy it; Tally never moves money.

## Getting started

Requirements: Node 22 LTS, the Android SDK (Android Studio), and Docker for the database tests.

```sh
npm install                 # installs the workspace and builds @tally/shared
cp apps/mobile/.env.example apps/mobile/.env   # add your Supabase URL and publishable key
```

Run on a phone over wireless debugging:

```sh
adb connect <phone-ip>:<port>   # Developer options → Wireless debugging
npm run phone                   # keeps port 8081 forwarded and starts the bundler
```

The first time, or after adding a native module, build and install a development build:

```sh
cd apps/mobile && npx expo run:android --device
```

## Database

```sh
npm run db:start        # local Supabase in Docker (first run downloads ~7 GB of images)
npm run test:db         # database tests: RLS, money rules, guests, payments, PayID
npx supabase db push --remote   # apply new migrations to the linked cloud project
npm run db:types        # regenerate the app's database types
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm test` | Shared engine tests |
| `npm run typecheck` | Typecheck every workspace |
| `npm run phone` | Port forwarding + bundler for a phone on wireless debugging |
| `npm run studio` | Open the Android project in Android Studio with Node on the PATH |
| `npm run icons` | Regenerate the app icon and splash from the logo |
| `npm run build:shared` | Rebuild the shared package after editing it |

## Test builds

A standalone APK (code bundled, talks to the cloud project) is built with
`cd apps/mobile/android && ./gradlew assembleRelease`. Builds go in `builds/`, which is not
committed. Tester instructions are in the project status document.

## Known pins

- `vitest` is pinned to 4.0.18: 4.1.x crashes `npm install` (`Cannot read properties of null (reading 'edgesOut')`).
- Currencies without decimals (such as JPY) aren't supported yet, because money is stored as cents.
