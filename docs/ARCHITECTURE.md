# Ultimate Farms: Technical Architecture

## Technology Stack

### Backend

- **Runtime:** Node.js with TypeScript
- **Framework:** Express.js (lightweight, well-suited for REST APIs)
- **Database:** PostgreSQL 15+ (primary), SQLite (offline client-side storage)
- **ORM:** Prisma (type-safe database access, migration management)
- **Authentication:** JWT with role-based access control (RBAC)
- **File Storage:** S3-compatible object storage for proof-of-work photos
- **Queue:** BullMQ with Redis for background job processing (sync, alerts, reports)

### Frontend

- **Framework:** React with TypeScript
- **UI Strategy:** Progressive Web App (PWA) for cross-device support
- **Offline Storage:** IndexedDB via Dexie.js for offline-first data persistence
- **State Management:** Zustand (lightweight, works well with offline sync)
- **UI Components:** Tailwind CSS with custom component library
- **Service Worker:** Workbox for caching, background sync, and push notifications

### Infrastructure

- **Deployment:** Docker containers on a VPS (Hetzner or DigitalOcean)
- **Reverse Proxy:** Caddy (automatic HTTPS, simple config)
- **Monitoring:** Uptime Kuma for service health, Grafana for KPI dashboards
- **CI/CD:** GitHub Actions for automated testing and deployment

---

## System Architecture Overview

```
+------------------------------------------------------------------+
|                        CLIENT LAYER                               |
|  +--------------------+  +--------------------+  +-----------+   |
|  | PWA (React + TWA)  |  | WhatsApp Bot       |  | SMS Gateway|  |
|  | - Offline-first    |  | - Photo capture    |  | - Alerts   |  |
|  | - IndexedDB cache  |  | - GPS verification |  | - Fallback |  |
|  +--------+-----------+  +--------+-----------+  +-----+-----+  |
+-----------|------------------------|-----------------------|------+
            |                        |                       |
            v                        v                       v
+------------------------------------------------------------------+
|                        API GATEWAY                                |
|  +------------------------------------------------------------+ |
|  | Express.js + JWT Auth + RBAC Middleware                      | |
|  | - Rate limiting                                             | |
|  | - Request validation (Zod schemas)                          | |
|  | - Audit logging (every write operation)                     | |
|  +------------------------------------------------------------+ |
+------------------------------------------------------------------+
            |
            v
+------------------------------------------------------------------+
|                     APPLICATION LAYER                             |
|  +-------------+  +-------------+  +-------------+              |
|  | Production  |  | Feed Ops    |  | Sales &     |              |
|  | Module      |  | Module      |  | Finance     |              |
|  +-------------+  +-------------+  +-------------+              |
|  +-------------+  +-------------+  +-------------+              |
|  | Maintenance |  | Biosecurity |  | Manure Mgmt |              |
|  | Module      |  | Module      |  | Module      |              |
|  +-------------+  +-------------+  +-------------+              |
|  +-------------+  +-------------+                               |
|  | Strategic   |  | Compliance  |                               |
|  | (DEAS)      |  | Engine      |                               |
|  +-------------+  +-------------+                               |
+------------------------------------------------------------------+
            |
            v
+------------------------------------------------------------------+
|                       DATA LAYER                                  |
|  +------------------+  +------------------+  +----------------+ |
|  | PostgreSQL       |  | Redis            |  | Object Storage | |
|  | - MES Core 4     |  | - Job queues     |  | - Photos       | |
|  | - Audit logs     |  | - Session cache  |  | - Documents    | |
|  | - Financial data |  | - Real-time data |  | - Receipts     | |
|  +------------------+  +------------------+  +----------------+ |
+------------------------------------------------------------------+
            |
            v
+------------------------------------------------------------------+
|                    INTEGRATION LAYER                              |
|  +------------------+  +------------------+  +----------------+ |
|  | MoMo API         |  | WhatsApp Cloud   |  | IoT Gateway    | |
|  | - Payment verify |  | - Photo ingest   |  | - Temp sensors | |
|  | - Webhooks       |  | - Notifications  |  | - Scale data   | |
|  +------------------+  +------------------+  +----------------+ |
+------------------------------------------------------------------+
```

---

## Offline-First Sync Architecture

### Design Principles

1. **Local-first writes:** All data entry writes to IndexedDB immediately
2. **Background sync:** Service worker syncs to server when connectivity available
3. **Conflict resolution:** Last-write-wins with server-side conflict log for review
4. **Sync queue:** FIFO queue in IndexedDB, processed sequentially on reconnect

### Sync Flow

```
User Action
    |
    v
Write to IndexedDB (immediate, always succeeds)
    |
    v
Add to Sync Queue (pending_sync table)
    |
    v
Service Worker checks connectivity
    |
    +-- Online --> POST to API --> Mark synced --> Update local with server response
    |
    +-- Offline --> Retry on next connectivity event
```

### Conflict Handling

- **Append-only data** (production logs, mortality events): No conflicts possible
- **Mutable data** (flock counts, inventory): Server timestamp wins,
  client notified of resolution
- **Financial data:** Never auto-resolved; flagged for manual review

---

## Database Schema Strategy

### Core 4 MES Tables

See `src/db/schemas/` for detailed schema definitions:

- `flock_master` - Bird population tracking
- `production_log` - Daily egg production records
- `mortality_events` - Bird loss tracking
- `feed_inventory` - Feed stock and issuance

### Supporting Tables

- `users` - Staff accounts with role assignments
- `audit_log` - Immutable record of all write operations
- `sync_queue` - Offline sync state tracking
- `alerts` - Threshold violation records
- `compliance_tokens` - Digital gate/interlock state
- `proof_of_work` - Photo verification records
- `financial_transactions` - Append-only financial ledger

### Data Integrity Rules

1. All tables include `created_at`, `updated_at`, `created_by` columns
2. Financial tables are append-only (no UPDATE or DELETE)
3. All mutations logged to `audit_log` with actor, action, old/new values
4. Foreign keys enforced at database level
5. Cascading updates automated (e.g., mortality -> flock count adjustment)

---

## Security Architecture

### Authentication

- JWT tokens with 15-minute access token + 7-day refresh token
- PIN-based login for floor staff (4-6 digit PIN on trusted devices)
- Device registration required for mobile access
- Session invalidation on role change

### Authorization (RBAC)

```
Owner          -> ALL permissions
Compliance     -> READ all, WRITE audit notes, TRIGGER escalations
Technical Lead -> READ/WRITE production & feed, READ financial
Supervisor     -> READ/WRITE own team data, READ aggregate KPIs
Operator       -> WRITE assigned tasks only, READ own data
Storekeeper    -> READ/WRITE inventory, READ purchase orders
```

### Data Protection

- All API traffic over HTTPS (TLS 1.3)
- Database connections encrypted
- Photo uploads stripped of EXIF data after GPS extraction
- PII (staff details) encrypted at rest
- Financial data in separate schema with restricted access
- Automatic session timeout after 30 minutes of inactivity

---

## Alert Pipeline Architecture

```
Data Input (sensor / manual / calculated)
    |
    v
Threshold Evaluator
    |
    +-- Within bounds --> Log & continue
    |
    +-- Threshold crossed --> Create Alert record
                                |
                                v
                          Priority Router
                                |
                +---------------+---------------+
                |               |               |
                v               v               v
           CRITICAL         WARNING          INFO
           (SMS + Push)     (Push only)     (Dashboard)
           (Owner +         (Supervisor     (Logged for
            Compliance)      + Technical)    review)
```

### Alert Thresholds (Configurable)

All thresholds stored in `alert_config` table, editable by Owner role only.
Default values from the design blueprint serve as initial configuration.

---

## API Design Conventions

- RESTful endpoints following `/{module}/{resource}` pattern
- All responses wrapped in `{ data, meta, errors }` envelope
- Pagination via cursor-based pagination (not offset)
- Rate limiting: 100 req/min for operators, 1000 req/min for system accounts
- Request validation using Zod schemas shared between client and server
- API versioning via URL prefix (`/api/v1/`)

---

## Deployment Strategy

### Environment Setup

```
Production:  VPS with Docker Compose
Staging:     Same VPS, separate Docker network
Development: Local Docker Compose
```

### Container Architecture

```yaml
services:
  api:        Node.js Express application
  db:         PostgreSQL 15
  redis:      Redis 7 (queues + cache)
  caddy:      Reverse proxy + TLS
  worker:     Background job processor
  minio:      S3-compatible object storage
```

### Backup Strategy

- PostgreSQL: Automated daily backups with WAL archiving
- Object storage: Daily sync to offsite backup
- Retention: 30 days rolling, monthly snapshots for 1 year
- Recovery target: <4 hours RPO, <2 hours RTO
