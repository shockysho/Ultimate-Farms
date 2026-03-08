# Ultimate Farms: End-to-End Implementation Plan

## Context

**What this is:** A complete, step-by-step build plan for the Ultimate Farms Meta-Compliance Operating System (MCOS) — a poultry farm management app for Gomoa Buduatta, Ghana.

**What this is NOT:** This has nothing to do with Demiurgos. That is a separate project.

**How to use this file:** Open a new Claude Code session, paste this plan, and say "Build this." Each stream is designed to be executed autonomously. Owner actions are collected at the very end as an onboarding checklist.

---

## What Already Exists

- **3 SQL schema files** (`src/db/schemas/`) — 30+ tables fully designed with triggers, constraints, and interlocks
- **Documentation** — `DESIGN_BLUEPRINT.md`, `ARCHITECTURE.md` defining all requirements
- **No backend code yet** — schemas are written but no API, no ORM, no server
- **No frontend code yet** — no React app, no PWA shell, nothing

---

## Tech Stack (Locked In)

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 20+, TypeScript, Express.js |
| ORM | Prisma (PostgreSQL) |
| Database | PostgreSQL 15+ |
| Cache/Queue | Redis + BullMQ |
| Frontend | React 18+, TypeScript, Vite |
| Styling | Tailwind CSS |
| Offline Storage | Dexie.js (IndexedDB wrapper) |
| PWA | Workbox (service worker) |
| State | Zustand |
| Infrastructure | Docker Compose, Caddy reverse proxy |
| CI/CD | GitHub Actions |
| File Storage | S3-compatible (MinIO for self-hosted) |

---

## Build Streams (Execute in Order)

### Stream 1: Project Foundation & Infrastructure

**Goal:** Monorepo structure, Docker environment, database running, CI pipeline.

1. Initialize monorepo structure:
   ```
   /
   ├── apps/
   │   ├── api/          # Express backend
   │   └── web/          # React PWA frontend
   ├── packages/
   │   └── shared/       # Shared types, constants, validation schemas
   ├── docker/
   │   ├── docker-compose.yml
   │   ├── Dockerfile.api
   │   ├── Dockerfile.web
   │   └── caddy/Caddyfile
   ├── src/db/schemas/   # (already exists)
   ├── .github/workflows/
   │   └── ci.yml
   ├── package.json      # Root workspace config
   └── turbo.json        # Turborepo config (or npm workspaces)
   ```

2. Create `docker-compose.yml`:
   - PostgreSQL 15 container (port 5432)
   - Redis 7 container (port 6379)
   - MinIO container (S3-compatible file storage, port 9000)
   - Caddy reverse proxy (port 80/443)
   - API container (port 3000)
   - Web container (port 5173 dev / 80 prod)

3. Create root `package.json` with npm workspaces pointing to `apps/*` and `packages/*`

4. Create GitHub Actions CI workflow:
   - Lint, type-check, test on every push
   - Build Docker images on main branch

5. Create `.env.example` with all required environment variables:
   ```
   DATABASE_URL=postgresql://farms:farms@localhost:5432/ultimate_farms
   REDIS_URL=redis://localhost:6379
   JWT_SECRET=<generated>
   S3_ENDPOINT=http://localhost:9000
   S3_ACCESS_KEY=minioadmin
   S3_SECRET_KEY=minioadmin
   S3_BUCKET=farm-uploads
   ```

**Verification:** `docker compose up` starts all services. PostgreSQL is accessible.

---

### Stream 2: Backend API — Core Setup

**Goal:** Express server running, Prisma connected, auth working, middleware in place.

1. Initialize `apps/api/`:
   - `package.json` with Express, Prisma, JWT, bcrypt, multer, BullMQ dependencies
   - `tsconfig.json`
   - Entry point: `src/index.ts`

2. Set up Prisma:
   - Create `prisma/schema.prisma` from existing SQL schemas (translate all 30+ tables)
   - Include all ENUMs, relations, constraints
   - Run `prisma migrate dev` to apply
   - Generate Prisma client

3. Create Express app structure:
   ```
   apps/api/src/
   ├── index.ts              # Server entry
   ├── app.ts                # Express app setup (cors, json, routes)
   ├── config/
   │   └── env.ts            # Validated env vars (zod)
   ├── middleware/
   │   ├── auth.ts           # JWT verification
   │   ├── rbac.ts           # Role-based access control
   │   ├── audit.ts          # Auto-log every write to audit_log
   │   ├── errorHandler.ts   # Global error handler
   │   └── validate.ts       # Zod request validation
   ├── lib/
   │   ├── prisma.ts         # Prisma client singleton
   │   ├── redis.ts          # Redis client
   │   ├── s3.ts             # MinIO/S3 client
   │   ├── queue.ts          # BullMQ queue setup
   │   └── token.ts          # Compliance token generator
   ├── routes/               # (built in Stream 3)
   └── services/             # (built in Stream 3)
   ```

4. Implement auth system:
   - `POST /api/auth/login` — PIN-based login (4-6 digit PIN, bcrypt)
   - `POST /api/auth/refresh` — Token refresh
   - JWT with role, userId, team in payload
   - 24hr access token, 7-day refresh token

5. Implement RBAC middleware:
   - Decorator/middleware that checks `req.user.role` against allowed roles per route
   - Role hierarchy: owner > compliance_officer > technical_lead > supervisor > operator/storekeeper

6. Implement audit middleware:
   - Auto-intercept all POST/PUT/PATCH/DELETE requests
   - Write to `audit_log` table with old_values, new_values, actor_id
   - Append-only (matches existing trigger)

7. Implement compliance token service:
   - Generate cryptographic tokens (crypto.randomBytes)
   - Check/consume tokens as digital gates
   - Expiry enforcement

**Verification:** `POST /api/auth/login` returns JWT. Protected routes reject unauthorized requests.

---

### Stream 3: Backend API — Module Endpoints (Phase 1)

**Goal:** All Phase 1 CRUD endpoints with business logic enforcement.

#### Module 3A: Flock Management
```
GET    /api/flocks              # List active flocks (with current_count, HDP)
GET    /api/flocks/:id          # Single flock detail
POST   /api/flocks              # Register new flock
PATCH  /api/flocks/:id          # Update flock (status, notes)
```
- Roles: owner, compliance_officer, technical_lead can create
- Auto-calculate age from `date_received` + `age_at_receipt_weeks`

#### Module 3B: Production Logging
```
GET    /api/production                    # List with filters (date, flock, collection_time)
GET    /api/production/daily-brief        # Today's Holy Trinity KPIs
POST   /api/production                    # Log egg collection
PATCH  /api/production/:id/verify         # Second-person verification
```
- Auto-calculate `hdp_percent` and `weight_variance_pct`
- Flag if weight variance > 2% (fraud alert)
- Auto-generate alert if HDP drops below threshold (88%)
- Holy Trinity endpoint returns: lay rate, mortality rate, feed consumption

#### Module 3C: Mortality Tracking
```
GET    /api/mortality                     # List with filters
POST   /api/mortality                     # Report mortality event
```
- Require photo proof-of-work (upload to S3)
- Flock count auto-decremented (existing DB trigger handles this)
- Auto-generate alert if daily mortality > 0.3%

#### Module 3D: Feed Operations (Aflatoxin Firewall)
```
GET    /api/feed/ingredients              # Current stock levels
POST   /api/feed/receipts                 # Receive feed delivery
PATCH  /api/feed/receipts/:id/qc          # Record aflatoxin test result
POST   /api/feed/issuances                # Issue feed to house (dual-key)
GET    /api/feed/consumption              # Feed consumption reports
```
- Aflatoxin Firewall: block stock update if `requires_aflatoxin_test=true` and QC not passed
- Dual-key issuance: `issued_by` ≠ `authorized_by` (enforced in DB + API)
- Compliance token required for feed mixing
- Auto-alert if feed price > 15% above benchmark

#### Module 3E: Sales & Cash Reconciliation
```
GET    /api/sales                         # List sales orders
POST   /api/sales                         # Create sale
PATCH  /api/sales/:id/verify-payment      # Verify MoMo payment
GET    /api/customers                     # Customer list
POST   /api/customers                     # Add customer
GET    /api/reconciliation/:date          # Daily reconciliation
POST   /api/reconciliation               # Submit reconciliation
```
- Cashless enforcement: cash requires `cash_override_reason` + approval
- Auto-calculate shrinkage: produced - sold - in_storage
- 100% daily match requirement
- Auto-alert on any cash mismatch

#### Module 3F: Purchase Orders ("No PO, No Payment")
```
GET    /api/purchase-orders               # List POs
POST   /api/purchase-orders               # Create PO (draft)
PATCH  /api/purchase-orders/:id/approve   # Approve PO
PATCH  /api/purchase-orders/:id/receive   # Mark received (with photo)
PATCH  /api/purchase-orders/:id/pay       # Record payment
```
- Workflow: draft → approved → received → paid
- Cannot pay without approval (existing DB trigger)
- Price variance auto-calculated against benchmark

#### Module 3G: Maintenance & Assets
```
GET    /api/assets                        # Equipment registry
POST   /api/assets                        # Register asset
GET    /api/maintenance/schedule          # PM calendar
POST   /api/maintenance/schedule          # Create PM schedule
POST   /api/maintenance/tickets          # Report breakdown
PATCH  /api/maintenance/tickets/:id       # Update ticket (resolve)
```
- Asset criticality tiers (Tier 1 = critical, immediate alert on failure)
- Auto-calculate MTTR (Mean Time To Repair)
- PM schedule generates upcoming tasks
- Auto-alert on Tier 1 equipment failure

#### Module 3H: Alerts Engine
```
GET    /api/alerts                        # Unresolved alerts (owner dashboard)
PATCH  /api/alerts/:id/acknowledge        # Acknowledge alert
PATCH  /api/alerts/:id/resolve            # Resolve alert
GET    /api/alerts/config                 # Alert thresholds
PATCH  /api/alerts/config/:id            # Update threshold
```
- Background job (BullMQ) runs every 15 minutes checking all thresholds
- 7 pre-configured alert types (from existing `alert_config` seed data)
- Push to owner dashboard immediately on critical

#### Module 3I: File Uploads (Proof-of-Work)
```
POST   /api/uploads                       # Upload photo
GET    /api/uploads/:key                  # Get signed URL
```
- Multer for multipart upload
- Store in MinIO/S3
- Extract GPS from EXIF if available
- SHA-256 hash for immutability
- Max 5MB per photo

**Verification:** All endpoints respond correctly. Business rules enforced. Postman/Thunder Client collection created.

---

### Stream 4: Shared Package

**Goal:** Types and validation schemas shared between frontend and backend.

1. Create `packages/shared/`:
   ```
   packages/shared/
   ├── package.json
   ├── tsconfig.json
   └── src/
       ├── types/
       │   ├── user.ts          # User roles, UserDTO
       │   ├── flock.ts         # Flock types
       │   ├── production.ts    # Production log types
       │   ├── feed.ts          # Feed types
       │   ├── sales.ts         # Sales, customer types
       │   ├── maintenance.ts   # Asset, ticket types
       │   ├── alerts.ts        # Alert types
       │   └── index.ts         # Re-exports
       ├── validation/
       │   ├── schemas.ts       # Zod schemas for all entities
       │   └── index.ts
       └── constants/
           ├── roles.ts         # Role permissions map
           ├── alerts.ts        # Alert type constants
           └── index.ts
   ```

**Verification:** Both `apps/api` and `apps/web` can import from `@ultimate-farms/shared`.

---

### Stream 5: Frontend — Shell & Auth

**Goal:** React PWA running, login working, offline shell ready.

1. Initialize `apps/web/` with Vite + React + TypeScript:
   ```
   apps/web/
   ├── public/
   │   ├── manifest.json       # PWA manifest
   │   ├── sw.js               # Service worker (Workbox)
   │   └── icons/              # App icons (192x192, 512x512)
   ├── src/
   │   ├── main.tsx
   │   ├── App.tsx
   │   ├── router.tsx          # React Router v6 with role-based routes
   │   ├── api/
   │   │   ├── client.ts       # Axios instance with JWT interceptor
   │   │   └── hooks/          # React Query hooks per module
   │   ├── store/
   │   │   ├── auth.ts         # Zustand auth store
   │   │   └── sync.ts         # Zustand sync status store
   │   ├── db/
   │   │   └── dexie.ts        # IndexedDB schema (mirrors Prisma)
   │   ├── sync/
   │   │   └── engine.ts       # Offline sync engine (queue + retry)
   │   ├── components/
   │   │   ├── ui/             # Base components (Button, Input, Card, Modal, etc.)
   │   │   ├── layout/         # Shell, Sidebar, Header, BottomNav
   │   │   └── shared/         # PhotoCapture, AlertBadge, StatusChip
   │   ├── pages/              # (built in Stream 6)
   │   ├── hooks/
   │   │   ├── useAuth.ts
   │   │   ├── useOffline.ts
   │   │   └── useCamera.ts
   │   └── styles/
   │       └── tailwind.css
   ├── index.html
   ├── tailwind.config.ts
   ├── vite.config.ts
   └── package.json
   ```

2. PWA setup:
   - `manifest.json` with app name, icons, theme color, `display: standalone`
   - Workbox service worker: cache-first for assets, network-first for API
   - Install prompt handling
   - Auto-save every 30 seconds to IndexedDB

3. Login page:
   - Employee ID + 4-6 digit PIN (large touch targets for phones)
   - PIN pad UI (numeric keypad, not text input)
   - Store JWT in memory + refresh token in httpOnly cookie
   - Auto-redirect based on role after login

4. App shell:
   - Bottom navigation (mobile-first, 4 tabs max)
   - Header with sync status indicator (green/yellow/red)
   - Role-based menu items
   - Offline banner when no connectivity

5. Offline sync engine:
   - Queue writes to IndexedDB when offline
   - Auto-sync when connection returns (navigator.onLine + periodic check)
   - Conflict resolution: server wins, user notified
   - Sync status per record (pending/synced/conflict/failed)

**Verification:** PWA installs on Android. Login works. App shows offline banner when disconnected.

---

### Stream 6: Frontend — Module Pages (Phase 1)

**Goal:** All Phase 1 screens built, connected to API, working offline.

#### 6A: Owner Dashboard (Exception-Only)
- **Route:** `/dashboard`
- **Role:** owner
- **Contents:**
  - Holy Trinity KPIs at top (Lay Rate %, Mortality %, Feed/Bird/Day)
  - Unresolved alerts list (color-coded: red=critical, yellow=warning)
  - Quick action buttons: Acknowledge, View Details
  - 7-day trend sparkline charts
  - "Everything OK" green state when no alerts
- **Design:** Maximum information density, minimum interaction needed. Target: <60 seconds to review.

#### 6B: Daily Production Brief
- **Route:** `/production`
- **Roles:** supervisor, operator, compliance_officer
- **Contents:**
  - Date selector (defaults to today)
  - Flock selector
  - Collection time selector (morning/midday/evening)
  - Egg count inputs by grade (normal, cracked, soft-shell, dirty)
  - Tray count + scale weight inputs
  - Auto-calculated HDP% display
  - Weight variance warning (>2% highlighted red)
  - Second-person verification button
  - Photo capture for proof-of-work
- **Design:** Large input fields, big buttons, visual feedback on save.

#### 6C: Feed Operations
- **Route:** `/feed`
- **Roles:** storekeeper, technical_lead, compliance_officer
- **Tabs:**
  1. **Stock Levels** — Current inventory with reorder indicators
  2. **Receive Delivery** — Form with supplier, quantity, QC status
  3. **Aflatoxin Test** — QC recording form (ppb input, pass/fail auto-calc)
  4. **Issue Feed** — Dual-key form (issuer scans, authorizer confirms)
- **Interlocks:** Cannot issue feed without passing QC if ingredient requires test. Visual "BLOCKED" state.

#### 6D: Mortality Reporting
- **Route:** `/mortality`
- **Roles:** supervisor, operator
- **Contents:**
  - Flock + house selector
  - Bird count input
  - Cause selector (visual icons for each cause)
  - Photo capture (mandatory)
  - GPS auto-captured from photo
  - Submit with confirmation modal showing flock impact
- **Design:** Quick entry, <30 seconds to report.

#### 6E: Sales & Customers
- **Route:** `/sales`
- **Roles:** supervisor, compliance_officer
- **Contents:**
  - New sale form (customer, trays, price, payment method)
  - MoMo payment verification (photo of confirmation)
  - Cash override form (requires reason + approval)
  - Customer list with search
  - Daily sales summary
- **Interlocks:** Cash path shows warning banner and requires extra steps.

#### 6F: Cash Reconciliation
- **Route:** `/reconciliation`
- **Roles:** compliance_officer, owner
- **Contents:**
  - Auto-populated from day's production + sales
  - Side-by-side: Expected vs Actual
  - Variance highlighted (green=balanced, red=mismatch)
  - Mismatch requires explanation text
  - Auto-escalate to owner if unbalanced
- **Design:** Cannot close day without reconciling.

#### 6G: Purchase Orders
- **Route:** `/purchase-orders`
- **Roles:** supervisor, compliance_officer, owner
- **Contents:**
  - PO creation form
  - Approval workflow (pending → approved → received → paid)
  - Receipt photo upload
  - Price benchmark comparison
- **Interlocks:** "No PO, No Payment" — payment button disabled until received status.

#### 6H: Maintenance
- **Route:** `/maintenance`
- **Roles:** technical_lead, supervisor
- **Contents:**
  - Asset registry with status indicators
  - PM calendar (upcoming scheduled maintenance)
  - Breakdown report form
  - MTTR display per asset
  - Tier indicators (Tier 1 = red highlight if down)

#### 6I: Alerts Management
- **Route:** `/alerts`
- **Roles:** owner, compliance_officer
- **Contents:**
  - Alert feed (newest first)
  - Filter by severity, type, status
  - Acknowledge button (with timestamp)
  - Resolve button (with resolution notes)
  - Alert configuration (thresholds) for owner only

**Verification:** All screens render, connect to API, work offline (queue writes), display data correctly.

---

### Stream 7: Backend API — Phase 2 Modules

**Goal:** Biosecurity, rodent control, manure management endpoints.

#### 7A: Biosecurity
```
GET    /api/biosecurity/zones             # Zone list with PPE requirements
POST   /api/biosecurity/access            # Log zone entry/exit
POST   /api/biosecurity/footbath          # Log footbath chemical test
GET    /api/biosecurity/compliance        # Zone compliance report
```
- Boot exchange verification required for zone transitions
- Footbath chemical concentration testing (weekly)
- PPE color coding per zone

#### 7B: Rodent Control
```
POST   /api/rodent-control/log            # Log trap check
GET    /api/rodent-control/entry-points   # Entry point audit
GET    /api/rodent-control/report         # Monthly summary
```

#### 7C: Manure Management
```
POST   /api/manure/log                    # Log manure belt operation
GET    /api/manure/time-on-ground         # Time-on-ground metrics
```
- Target: <2 hours time-on-ground
- Crew coordination tracking

**Verification:** All Phase 2 endpoints functional with proper role enforcement.

---

### Stream 8: Frontend — Phase 2 Pages

**Goal:** Biosecurity, rodent control, manure management screens.

#### 8A: Biosecurity Dashboard
- **Route:** `/biosecurity`
- Farm zone map with color-coded status
- Entry/exit logging with boot exchange verification
- Footbath test recording
- Zone compliance percentage display

#### 8B: Rodent Control
- **Route:** `/rodent-control`
- Trap check logging with location
- Entry point audit form
- Monthly trend charts

#### 8C: Manure Management
- **Route:** `/manure`
- Belt operation logging
- Time-on-ground timer/tracker
- Crew assignment

**Verification:** Phase 2 screens work end-to-end.

---

### Stream 9: Backend API — Phase 3 Modules

**Goal:** Strategic optimization endpoints.

#### 9A: Feed Mill Dashboard
```
GET    /api/feed-mill/formulations        # Current formulations
POST   /api/feed-mill/batches             # Log production batch
GET    /api/feed-mill/cost-analysis       # Cost per kg analysis
```

#### 9B: Dynamic Pricing
```
GET    /api/pricing/market                # Market price data
POST   /api/pricing/rules                 # Set pricing rules
GET    /api/pricing/recommendations       # AI-suggested prices
```

#### 9C: Infrastructure Projects
```
GET    /api/projects                      # Project list
POST   /api/projects                      # Create project
PATCH  /api/projects/:id                  # Update progress
GET    /api/projects/:id/milestones       # Project milestones
```

**Verification:** Phase 3 endpoints functional.

---

### Stream 10: Frontend — Phase 3 Pages

**Goal:** Feed mill, pricing, and project tracking screens.

- **Feed Mill:** `/feed-mill` — Formulation viewer, batch logging, cost breakdown
- **Pricing:** `/pricing` — Market comparison, rule configuration, recommendations
- **Projects:** `/projects` — Kanban-style project tracker with milestones

**Verification:** Phase 3 screens work end-to-end.

---

### Stream 11: Compliance Escrow System

**Goal:** Full Susu-compliance escrow model working end-to-end.

1. Backend:
   ```
   GET    /api/escrow                       # Team escrow status
   POST   /api/escrow/violations            # Record violation
   POST   /api/escrow/release               # Release weekly escrow
   GET    /api/escrow/report                # Team compliance report
   ```
   - Auto-calculate deductions from violations
   - Weekly escrow release workflow
   - Team-level accountability

2. Frontend:
   - **Route:** `/escrow`
   - Team compliance scoreboard
   - Violation history
   - Escrow release approval (owner only)
   - Weekly payout summary

**Verification:** Full escrow cycle works: assign → track violations → calculate deductions → release.

---

### Stream 12: Reports & Analytics

**Goal:** Exportable reports and trend analysis.

1. Backend endpoints:
   ```
   GET    /api/reports/production           # Production trends (daily/weekly/monthly)
   GET    /api/reports/financial             # Revenue, costs, margins
   GET    /api/reports/compliance            # Compliance scores by team
   GET    /api/reports/maintenance           # Equipment uptime, MTTR
   GET    /api/reports/export/:type          # CSV/PDF export
   ```

2. Frontend:
   - **Route:** `/reports`
   - Chart library (Recharts) for trend visualization
   - Date range selectors
   - Export buttons (CSV download)
   - Print-friendly layout

**Verification:** Reports generate accurate data. CSV exports work.

---

### Stream 13: Background Jobs & Notifications

**Goal:** Automated monitoring and notification system.

1. BullMQ workers:
   - **Alert Scanner** (every 15 min): Check all thresholds, generate alerts
   - **Daily Brief Generator** (6am): Compile overnight data for morning review
   - **Sync Processor**: Process offline sync queue
   - **Escrow Calculator** (weekly): Calculate compliance deductions
   - **PM Reminder**: Check upcoming maintenance schedules

2. Notification channels:
   - In-app notifications (stored in DB, shown in header bell icon)
   - SMS via API stub (owner configures provider later)
   - Future: WhatsApp Business API stub

**Verification:** Alert scanner creates alerts when thresholds breached. Daily brief generates.

---

### Stream 14: Testing & Hardening

**Goal:** Comprehensive test coverage, security audit, performance optimization.

1. Backend tests (Vitest):
   - Unit tests for all services
   - Integration tests for all API endpoints
   - Business rule tests (aflatoxin firewall, dual-key, No PO No Payment)
   - Auth/RBAC tests

2. Frontend tests (Vitest + React Testing Library):
   - Component tests for all forms
   - Integration tests for critical workflows
   - Offline behavior tests

3. Security hardening:
   - Rate limiting on auth endpoints
   - Input sanitization (already handled by Prisma parameterized queries)
   - CORS configuration
   - Helmet.js security headers
   - PIN attempt lockout (5 attempts → 15 min lockout)

4. Performance:
   - Database query optimization (check indexes cover all common queries)
   - API response pagination (default 50, max 200)
   - Frontend lazy loading (code split by route)
   - Image compression before S3 upload

**Verification:** Test suite passes. No security vulnerabilities in automated scan.

---

### Stream 15: Deployment Configuration

**Goal:** Production-ready deployment setup.

1. Production Docker Compose:
   - PostgreSQL with persistent volume + daily backup cron
   - Redis with AOF persistence
   - MinIO with persistent volume
   - API container (PM2 process manager)
   - Web container (Nginx serving static build)
   - Caddy for HTTPS (auto-cert via Let's Encrypt)

2. Database:
   - Prisma migrations ready to run
   - Seed data script (default users, alert configs, asset templates)
   - Backup script (pg_dump daily, 30-day retention)

3. Monitoring:
   - Health check endpoint (`GET /api/health`)
   - Docker healthchecks on all containers
   - Uptime Kuma config template

4. Seed data script:
   - Default owner account
   - Sample alert configurations (7 defaults from schema)
   - Sample asset templates for common equipment
   - Ghana-specific defaults (currency: GHS, timezone: Africa/Accra)

**Verification:** `docker compose -f docker-compose.prod.yml up` starts full production stack.

---

## Owner Onboarding Checklist

**Do these AFTER the system is fully built. This is everything you need to do to go live.**

### A. Server Setup (One-Time)

- [ ] **Get a server** — Any VPS with 2+ CPU, 4GB+ RAM, 40GB+ storage (Hetzner, DigitalOcean, or local)
- [ ] **Point your domain** — Set DNS A record for your domain to server IP
- [ ] **SSH into server** — Install Docker and Docker Compose
- [ ] **Clone the repo** — `git clone` the Ultimate Farms repo onto the server
- [ ] **Copy `.env.example` to `.env`** — Fill in production values:
  - [ ] Generate a strong `JWT_SECRET` (run: `openssl rand -hex 32`)
  - [ ] Set `DATABASE_URL` with a strong password
  - [ ] Set your domain in `CADDY_DOMAIN`
- [ ] **Run `docker compose -f docker-compose.prod.yml up -d`**
- [ ] **Run database migrations:** `docker exec api npx prisma migrate deploy`
- [ ] **Run seed script:** `docker exec api npx ts-node src/seed.ts`

### B. Create Your Users

- [ ] **Log in as owner** — Default credentials provided by seed script
- [ ] **Change your PIN** immediately
- [ ] **Create staff accounts:**
  - [ ] Compliance Officer (assign name, role, team, PIN)
  - [ ] Technical Lead
  - [ ] Supervisors (one per team/shift)
  - [ ] Operators
  - [ ] Storekeeper(s)
- [ ] **Set each person's phone number** for SMS alerts

### C. Configure Your Farm

- [ ] **Register your flocks:**
  - [ ] Flock code, breed, house, cage row
  - [ ] Date received, age at receipt, initial count
- [ ] **Register your feed ingredients:**
  - [ ] Maize, soybean meal, etc.
  - [ ] Mark which ones require aflatoxin testing
  - [ ] Set reorder levels
- [ ] **Register your equipment:**
  - [ ] Assign criticality tiers (Tier 1 = critical)
  - [ ] Set preventive maintenance schedules
- [ ] **Register your customers:**
  - [ ] Business name, phone, channel (wholesale/farm_gate/horeca/retail)
  - [ ] Set credit eligibility and limits if applicable
- [ ] **Define biosecurity zones:**
  - [ ] Zone names, PPE requirements, color codes

### D. Tune Your Alert Thresholds

- [ ] **Review default thresholds** (pre-configured from design blueprint):
  - [ ] Daily mortality > 0.3% → Critical
  - [ ] Temperature > 31°C for 30min → Critical
  - [ ] Lay rate < 88% → Warning
  - [ ] Cash mismatch > 0 → Critical
  - [ ] Tier 1 equipment down → Critical
  - [ ] Feed price > 15% above benchmark → Warning
  - [ ] Production drop > 2% vs 7-day avg → Warning
- [ ] **Adjust any thresholds** to match your farm's specific targets

### E. Set Up Staff Devices

- [ ] **Each staff member's phone:**
  - [ ] Open the app URL in Chrome
  - [ ] Tap "Add to Home Screen" (installs PWA)
  - [ ] Log in with their PIN
  - [ ] Verify camera works for proof-of-work photos
  - [ ] Test offline mode (turn off WiFi, submit a form, turn WiFi back on, verify sync)

### F. Set Up Escrow Pay Structure

- [ ] **Define base pay** per role
- [ ] **Define escrow percentage** (e.g., 20% held in compliance pool)
- [ ] **Define violation types** and deduction amounts
- [ ] **Set payout schedule** (weekly)

### G. Optional: External Integrations

- [ ] **SMS Provider** — Configure API key for SMS alerts (if desired)
- [ ] **Monitoring** — Set up Uptime Kuma to monitor `https://yourdomain.com/api/health`
- [ ] **Backups** — Verify daily database backup is running (`docker exec postgres pg_dump ...`)

### H. Go-Live Day

- [ ] **Morning briefing** with all staff:
  - [ ] Demo the app on a phone
  - [ ] Show each role their specific screens
  - [ ] Practice PIN login
  - [ ] Practice photo proof-of-work
  - [ ] Practice offline entry + sync
- [ ] **Run one full production cycle** with the app (morning egg collection → reconciliation)
- [ ] **Verify owner dashboard** shows today's data
- [ ] **You're live.** Monitor alerts for the first week.

---

## Success Criteria

| Metric | Target | How App Measures It |
|--------|--------|---------------------|
| Lay rate | ≥90% sustained | Auto-calculated HDP% per flock |
| Mortality | <0.5% monthly | Cumulative from mortality_events |
| Equipment uptime | ≥90% | (Total hours - downtime hours) / total hours |
| Cash reconciliation | 100% daily match | daily_reconciliation.is_balanced |
| Owner time | <1 hour/week | Exception-only dashboard |
| Sales channel | 70%+ wholesale | Channel distribution from sales_orders |
| Feed cost | 20% reduction | Feed mill cost analysis vs baseline |
| Biosecurity | Zero breaches | Zone access violations count |
| Staff fraud | Zero | Dual verification + audit trail anomalies |
