# Ultimate Farms Mobile Application Design Document

## 1. Executive Summary

Ultimate Farms Mobile is the digital enforcement layer for a commercial layer poultry operation in Gomoa Buduatta, Ghana. The product is designed as a **control system disguised as a mobile app**: it enforces zero-trust operations, mandatory two-person verification, immutable truth trails, and automated escalation rules so the owner can run a 12,500-bird operation remotely and reliably.

The system is purpose-built for:
- Unreliable connectivity (offline-first with deterministic sync)
- Budget Android hardware (2GB RAM, Android 10+, low battery impact)
- Operational compliance over convenience (mechanical rules > human discretion)
- Exception-based remote management (owner handles Red/Orange exceptions, not routine operations)

### 1.1 Business baseline assumptions (for defaults and examples)
- Birds live: 12,500
- Installed facility capacity: 34,000
- Active cages: 5
- Typical production: ~350 crates/day
- Average selling price: ₵54/crate
- Daily gross at baseline: ~₵18,900
- Staffing footprint: ~10–12 staff

### 1.2 Product outcomes
- Enforce designed-day execution with auditable proof
- Eliminate single-actor handling of value transactions
- Provide owner farm-health comprehension in <10 seconds
- Auto-escalate compliance failures and performance anomalies
- Preserve operational continuity with intermittent network and power

---

## 2. Information Architecture

## 2.1 Role-centric sitemap

### 2.1.1 Common (all authenticated users)
1. Splash + Device Integrity Check
2. Login (Phone + OTP)
3. Session Unlock (PIN/Biometric)
4. Notification Center
5. Offline Queue & Sync Status
6. Profile + Device Management
7. SOP Help (role-filtered)

### 2.1.2 Owner
1. Owner Dashboard (RYG macro overview)
2. Alerts Inbox (P1/P2/P3)
3. Approvals Center (procurement/threshold/pardons)
4. Operations Analytics (production/feed/mortality/compliance)
5. Financial Oversight (cash reconciliation, expense exceptions, P&L)
6. Staff & Discipline Ledger
7. Reports (daily/weekly/monthly/custom)
8. Governance Settings (thresholds/pricing/role policy)

### 2.1.3 Glue Person (Operations Manager)
1. Operations Cockpit (today + exceptions)
2. Task Assignment Board
3. Reconciliation Hub (eggs/feed/cash)
4. Strike Issuance + Violation Triage
5. Spend Approval (<₵1,000)
6. Equipment & Maintenance Board
7. Staff Roster + Attendance Monitor
8. Weekly Report Submission

### 2.1.4 Site Commander (SC)
1. Designed Day Timeline (primary home)
2. Task Data Capture Forms
3. Verification Request Queue
4. Overdue/Skipped Task Center
5. Daily Reconciliation Screen
6. Daily Report Submission

### 2.1.5 Sales Officer (SO)
1. Daily Sales Targets Dashboard
2. Customer Registry + Tier View
3. Delivery Agreement (DA) Builder
4. Two-Person Order Count Verification
5. Payment Logging + Reconciliation
6. Cold Call Logger
7. Pipeline Board (Lead → Lost/Retained)

### 2.1.6 Field Staff / Support roles
1. My Tasks (minimal UI)
2. Task Execution Stepper
3. Verification Participation (assigned only)
4. Incident Reporting (photo/voice)
5. Attendance Check-in/Out

## 2.2 Navigation blueprint

### Owner / Glue / SO
- Bottom tabs: `Dashboard`, `Work`, `Alerts`, `Reports`, `More`
- Drill-down stack navigation with breadcrumb header
- Critical action modals require explicit confirmation text and step-up auth when needed

### SC
- Bottom tabs: `Timeline`, `Verify`, `Reconcile`, `Sync`

### Field/Support
- Bottom tabs: `My Tasks`, `Verify`, `Profile`
- Optional “Simple mode” hides non-essential details

## 2.3 Domain data model

### 2.3.1 Identity and security
- `users`
  - `user_id`, `full_name`, `phone_e164`, `role`, `status`, `pin_hash`, `biometric_enabled`, `created_at`
- `devices`
  - `device_id`, `user_id`, `hardware_fingerprint`, `model`, `android_version`, `trust_level`, `last_seen_at`
- `sessions`
  - `session_id`, `user_id`, `device_id`, `issued_at`, `expires_at`, `revoked_at`

### 2.3.2 Operations and designed day
- `task_templates`
  - `template_id`, `name`, `scheduled_time`, `role_required`, `requires_verification`, `sla_minutes`
- `task_instances`
  - `task_id`, `template_id`, `date`, `assigned_user_id`, `status`, `started_at`, `submitted_at`, `verified_at`, `overdue_state`
- `task_evidence`
  - `evidence_id`, `task_id`, `evidence_type`, `local_path`, `remote_url`, `checksum_sha256`

### 2.3.3 Truth architecture
- `l1_entries` (self-reported)
- `l2_verifications` (peer-verified)
- `l3_system_checks` (system-verified)
- `value_transactions`
  - typed transactions (`egg_count`, `feed_move`, `cash_receipt`, `sales_count`)
- `discrepancy_cases`
  - `severity`, `variance_value`, `assigned_to`, `due_at`, `resolution_state`

### 2.3.4 Production
- `egg_collections`
  - `collection_id`, `pass_no`, `cage_id`, `trays_count`, `crates_equiv`, `broken_count`, `captured_at`
- `feed_movements`
  - `move_id`, `stock_in_kg`, `issued_kg`, `remaining_kg`, `days_remaining`, `captured_at`
- `mortality_logs`
  - `mortality_id`, `cage_id`, `bird_count`, `suspected_cause`, `captured_at`

### 2.3.5 Sales
- `customers`
  - `customer_id`, `name`, `tier`, `phone`, `location`, `status`, `overdue_days`
- `price_tiers`
  - `tier_id`, `tier_name`, `crate_price_ghs`, `effective_from`, `updated_by`
- `delivery_agreements`
  - `da_id` (`DA-YYYY-NNNN`), `customer_id`, `crates`, `unit_price_ghs`, `total_ghs`, `status`
- `order_count_verifications`
  - `counter1_user_id`, `counter2_user_id`, `verified_crates`
- `payments`
  - `payment_id`, `da_id`, `method`, `amount_ghs`, `reference`, `matched_state`

### 2.3.6 Finance and procurement
- `expenses`
  - `expense_id`, `category`, `amount_ghs`, `requestor_id`, `approval_state`, `authority_level`
- `purchase_orders`
  - `po_id`, `item`, `qty`, `estimated_cost_ghs`, `glue_approval`, `owner_approval`, `receive_state`
- `cash_reconciliation`
  - `recon_id`, `day`, `sales_cash_ghs`, `bank_deposit_ghs`, `variance_pct`, `status`

### 2.3.7 Discipline and compliance
- `strikes`
  - `strike_id`, `user_id`, `level` (`YELLOW|ORANGE|RED`), `reason_code`, `issuer_id`, `source_event_id`, `issued_at`
- `strike_rule_events`
  - auto-escalation traces and derived outcomes
- `policy_violations`
  - two-person violations, skipped tasks, tamper attempts

### 2.3.8 Equipment and maintenance
- `equipment`
  - `equipment_id`, `type`, `location`, `ryg_state`, `last_service_at`
- `maintenance_logs`
  - `maintenance_id`, `equipment_id`, `log_type`, `description`, `actor_id`, `logged_at`

### 2.3.9 System integrity and sync
- `audit_events` (append-only)
  - `event_id`, `actor_id`, `action`, `entity`, `entity_id`, `before_hash`, `after_hash`, `timestamp`, `device_id`
- `outbox_queue`
  - `queue_id`, `entity`, `local_entity_id`, `operation`, `priority`, `retry_count`, `last_error`
- `sync_checkpoints`
  - pull/push cursors and conflict stats

## 2.4 Offline-first architecture and conflict policy
- Local store: encrypted SQLite + filesystem media cache
- Outbox-first writes: every write succeeds locally immediately
- Deterministic sync priorities:
  1) auth/permissions,
  2) alerts/tasks,
  3) value transactions + verifications,
  4) production logs,
  5) finance/sales,
  6) media evidence.
- Conflict strategy:
  - Immutable data: never overwritten; corrections create linked records.
  - Mutable references: server-authoritative; unresolved conflicts create review task.
  - Verification race: first valid verifier accepted; subsequent entries logged as note events.

---

## 3. Role-Based User Flows

## 3.1 Owner flow
1. Login → Owner Dashboard
2. View RYG cards (`HDP`, `Feed Days`, `Mortality`, `Cash Variance`, `Compliance`)
3. Tap a Yellow/Red card → metric detail trend (7/30-day)
4. Drill into underlying entries (L1/L2/L3)
5. Take action: approve/reject/escalate/assign investigation
6. Review Alerts Inbox by severity
7. Review weekly summary and acknowledge/sign-off

### Decision points and edge cases
- If offline: read cached dashboard; actions queue with “Pending dispatch” state.
- If Red alert pending >15 minutes unacknowledged: SMS fallback trigger.

## 3.2 Glue Person flow
1. Login → Operations Cockpit
2. Review overdue/skipped tasks and discrepancies
3. Assign or reassign work
4. Review policy violations and issue strikes
5. Approve spend requests <₵1,000; escalate higher values to owner
6. Run reconciliation (eggs/feed/cash)
7. Send weekly report to owner

### Decision points and edge cases
- If no verifier available: temporary hold state, auto-yellow after SLA breach.
- If strike threshold reached: auto-generated escalation cannot be bypassed.

## 3.3 Site Commander flow
1. Login → Designed Day timeline
2. Start scheduled task (or mark delay reason)
3. Capture L1 data
4. Request L2 verification from second user
5. Resolve discrepancies or escalate
6. Complete shift reconciliation
7. Submit daily report

### Decision points and edge cases
- If same user attempts both L1 and L2: hard block + violation event + auto-yellow.
- If device dies mid-entry: draft autosave and resume on relaunch.

## 3.4 Sales Officer flow
1. Login → target board
2. Select customer or create prospect
3. Generate DA with locked tier pricing
4. Trigger two-person count verification (counters cannot be SO)
5. Log payment method and references
6. Update pipeline stage and cold call outcomes

### Decision points and edge cases
- Price edit attempt by SO: blocked, logged, and surfaced to Glue as policy event.
- Payment mismatch > tolerance: create reconciliation exception.

## 3.5 Field Staff flow
1. Login/PIN
2. Open My Tasks
3. Execute task stepper
4. Submit completion + optional media evidence
5. Respond to verify requests when assigned

### Decision points and edge cases
- No network: all captures proceed; sync deferred.
- Unauthorized route access: deny + audit log event.

---

## 4. Screen Inventory & Specifications

> All screens include common states: loading skeleton, empty state, error state with retry, and offline badge where relevant.

## 4.1 Common screens

### 4.1.1 Splash + Device Integrity
- **Purpose:** startup checks (app version, storage, device trust)
- **Roles:** all
- **Layout:** logo, progress stack, diagnostics footer
- **Actions:** continue / support code copy
- **Offline:** allows entry if local session valid and policy unchanged

### 4.1.2 Login (Phone + OTP)
- **Data fields:** `phone_e164`, `otp_code`
- **Interactions:** send OTP, resend after countdown
- **Error states:** invalid OTP, rate limit, SMS delay
- **Offline:** locked unless active trusted session exists

### 4.1.3 Session Unlock (PIN/Biometric)
- **Purpose:** quick re-entry without OTP each time
- **Offline:** fully supported

### 4.1.4 Notification Center
- **Purpose:** filter and manage alerts by severity, module, date
- **Interactions:** acknowledge, assign, snooze (not for Red), open source record
- **Offline:** view cached and queue acknowledgements

### 4.1.5 Sync Status
- **Purpose:** visibility into pending queue and conflicts
- **Data:** queued count, last successful sync, blocked items
- **Interactions:** retry all, open conflict resolver

## 4.2 Owner screens

### 4.2.1 Owner Dashboard
- **Purpose:** <10 sec operational health overview
- **Layout:** top: date/site; center: five RYG KPI cards; bottom: exceptions list and trend sparklines
- **Example values:**
  - `HDP = 82.4% (YELLOW)`
  - `Mortality = 6 birds/day (RED)`
  - `Feed Days = 4.2 (RED)`
  - `Cash Variance = 3.1% (YELLOW)`
  - `Compliance = 96.2% (GREEN)`
- **Interactions:** tap card → drill down, quick action chips
- **Offline:** cached snapshots marked stale timestamp

### 4.2.2 Approvals Center
- **Data:** pending approvals with threshold indicators
- **Example:** `PO-2026-014 | Feed concentrate | ₵7,800 | awaiting owner`
- **Interactions:** approve/reject with reason, optional comment
- **Security:** step-up auth for high-value approvals

### 4.2.3 Staff Discipline Ledger
- **Data:** per staff strike timeline and active status
- **Interactions:** view rationale evidence, owner pardon (logged immutable)

## 4.3 Glue screens

### 4.3.1 Operations Cockpit
- **Purpose:** run day-to-day command center
- **Layout:** timeline status row, unresolved cases, staffing and equipment tiles
- **Interactions:** assign tasks, open discrepancy, issue strike, message SC

### 4.3.2 Strike Issuance
- **Fields:** `staff_id`, `strike_level`, `reason_code`, `evidence_ref`, `notes`
- **Behavior:** previews automatic consequence before submit
- **Restrictions:** no edits/deletes after submit

### 4.3.3 Reconciliation Hub
- **Sections:** eggs, feed, cash
- **Computed:** variance %, confidence score, anomaly hints
- **Actions:** confirm reconciled, open investigation

## 4.4 Site Commander screens

### 4.4.1 Designed Day Timeline
- **Purpose:** enforce daily schedule and status progression
- **Task states:** NOT_STARTED → IN_PROGRESS → AWAITING_VERIFICATION → VERIFIED_COMPLETE
- **Escalation hooks:** overdue >2h = Yellow; skipped = Orange

### 4.4.2 Task Form: Feed Issuance (06:00)
- **Fields:** `stock_before_kg`, `issued_kg`, `stock_after_kg`, `cage_allocation`
- **Validation:** weight continuity checks and range guards
- **Verification:** second user mandatory

### 4.4.3 Task Form: Egg Collection Passes (07:00/10:30/14:00)
- **Fields:** `pass_no`, `cage_counts`, `broken_eggs`, `total_trays`, `crates_equiv`
- **System checks:** expected range by cage and trend deviation

### 4.4.4 Health Walk (07:45)
- **Fields:** `mortality_count`, `abnormality_notes`, `cage_location`
- **Media:** photo/voice note evidence optional but encouraged

### 4.4.5 Shift Reconciliation (17:30)
- **Participants:** SC + Glue
- **Outputs:** day close status and unresolved exception count

### 4.4.6 Daily Report Submission (18:30)
- **Data:** auto-filled summary + SC commentary + sign-off
- **State:** submitted, verified by glue, acknowledged by owner

## 4.5 Sales screens

### 4.5.1 Customer List + Profile
- **Data:** tier, last order date, overdue days, status (`Retained`, `At Risk`)
- **Interactions:** create DA, log call, schedule follow-up

### 4.5.2 Create DA
- **Auto fields:** `da_id`, `tier_price`
- **Editable fields:** `customer`, `crates_qty`, `delivery_date`
- **Locked fields for SO:** `unit_price_ghs`
- **Example:** `DA-2026-0001`, `Gold tier`, `54 GHS/crate`, `120 crates`

### 4.5.3 Order Count Verification
- **Fields:** `counter1`, `counter2`, `verified_crates`
- **Constraint:** `counter1 != counter2`, both != SO

### 4.5.4 Payment Logging
- **Methods:** MoMo, bank transfer, cash
- **Data:** transaction ref, amount, payer, timestamp
- **Reconciliation:** matching engine status chip

### 4.5.5 Cold Call Logger
- **Fields:** customer/prospect, outcome, next action date
- **Daily target chip:** e.g., `8 / 12 completed`

### 4.5.6 Pipeline Board
- **Stages:** Lead → Prospect → Customer → Retained / At Risk / Lost

## 4.6 Field/support screens

### 4.6.1 My Tasks
- **Layout:** large cards with icon + short text + single CTA
- **Low-literacy aids:** color status, icon language, optional audio prompts

### 4.6.2 Incident Report
- **Types:** equipment, security, sanitation, other
- **Inputs:** voice note + image + short tag

---

## 5. System Design

## 5.1 Alert and notification system

### 5.1.1 Taxonomy and channels
- **P1 Red:** immediate push + SMS fallback + persistent in-app badge
- **P2 Orange:** immediate push + in-app badge
- **P3 Yellow:** in-app + grouped push digest
- **Green:** dashboard-only state updates

### 5.1.2 Trigger matrix
| Condition | Escalation |
|---|---|
| HDP < 78% for 3 days | Red to Owner |
| HDP 78–85% | Yellow to Glue |
| Mortality > 5/day for 2 days | Red to Owner + Glue |
| Feed stock < 5 days | Red to Owner + Glue + SC |
| Task overdue > 2 hours | Yellow to SC |
| Task skipped | Orange to SC + Glue |
| Two-person rule violation | Yellow to violator, notify Glue |
| Cash mismatch > 5% | Orange to Glue + Owner |
| 3 Yellows in 30 days | Auto-Orange |
| 2 Oranges ever | Auto-Red |
| Equipment turns Red | Red to Glue + Owner |
| Payment overdue > 7 days | Yellow to SO + Glue |

### 5.1.3 Fatigue controls
- De-duplicate similar alerts within rolling windows
- Group Yellow into module digests
- Red alerts are never digested or delayed

## 5.2 Offline-first architecture details
- Core workflows fully functional offline:
  - task execution
  - attendance
  - L1 submission
  - L2 verification
  - DA creation
  - payment capture
- Sync queue uses priority + exponential retry
- Conflict resolver UI for mutable references only
- Visual indicators:
  - `Synced` (green check)
  - `Pending` (clock)
  - `Retrying` (spinner)
  - `Conflict` (amber warning)
  - `Blocked` (red lock)

## 5.3 Security and anti-fraud

### 5.3.1 Authentication
- Phone number + OTP (SMS)
- Local PIN unlock for repeated access
- Optional biometric unlock for trusted devices

### 5.3.2 RBAC matrix (high-level)
- Owner: full visibility + policy control
- Glue: operations control + discipline issuance (Y/O)
- SC: execution and reconciliation, no pricing or strike issuance
- SO: sales workflow, no pricing edits
- Field/support: own tasks only

### 5.3.3 Immutable audit trail
- Append-only audit events for every write, auth, and permission denial
- Hash-chain signatures across event batches
- Corrections reference original records, no destructive update

### 5.3.4 Device policy and sessions
- One active device per staff account by default
- Owner and Glue may have controlled multi-device exceptions
- Concurrent login policy: second login triggers first-session revoke (or owner-defined override)

### 5.3.5 Anti-tampering
- Rooted device warning and restricted mode
- Device clock anomaly detection
- Same-device dual-verification pattern alerts
- Photo evidence watermark: timestamp + user + record id

## 5.4 RYG dashboard system

### 5.4.1 Metric computations
- **HDP%** = eggs produced / live hens × 100
  - Green >85, Yellow 78–85, Red <78 (with 3-day persistence rule)
- **Feed days remaining** = stock_kg / avg_daily_use_kg
  - Green >10, Yellow 5–10, Red <5
- **Mortality daily**
  - Green ≤3, Yellow 4–5, Red >5 for 2 consecutive days
- **Cash variance** = |cash_logged - cash_deposited| / cash_logged ×100
  - Green <2%, Yellow 2–5%, Red >5%

### 5.4.2 Drill-down hierarchy
1. Summary card
2. Metric trend view
3. Daily breakdown
4. Entry detail with L1/L2/L3 chain
5. Related audit events

### 5.4.3 Configuration governance
- Threshold edits require owner authority
- Every threshold change creates a versioned policy record

## 5.5 Reporting engine

### 5.5.1 Daily report template
- Date/site summary
- Designed day completion rate
- Production totals by pass/cage
- Feed issuance and remaining stock
- Mortality and health notes
- Open discrepancies
- Discipline events
- SC comments + Glue verification

### 5.5.2 Weekly summary template
- KPI trends (week-over-week)
- Top exceptions and unresolved reds/oranges
- Compliance and strike status rollup
- Customer receivables and overdue list
- Owner action checklist

### 5.5.3 Monthly P&L template
- Revenue (by customer tier/channel)
- COGS estimates (feed, medication)
- Operating expenses (labor, utilities, maintenance)
- Net operating result and variance vs prior month

### 5.5.4 Exports
- PDF (formal reports)
- CSV (raw analysis)
- WhatsApp-ready executive text summary

---

## 6. Visual Design Direction

## 6.1 Principles
- Clarity over decoration
- Fast scanning over dense prose
- Status-first UI (RYG always visible)
- Performance-first interactions

## 6.2 Color system (dark-first)
- Background: `#0B1220`
- Surface: `#111827`
- Text primary: `#F9FAFB`
- Text secondary: `#9CA3AF`
- Green: `#22C55E`
- Yellow: `#EAB308`
- Orange: `#F97316`
- Red: `#EF4444`

## 6.3 Typography and spacing
- Typeface: Inter / Roboto fallback
- Body minimum 14sp
- Heading scale: 18/22/28sp
- 8dp spacing grid with 48dp minimum touch targets

## 6.4 Component library
- KPI RYG cards
- Timeline row component
- Verification handoff modal
- Strike badge + timeline
- Sync status banner
- Audit event row
- Reconciliation variance chip
- DA summary card
- Payment method selector

## 6.5 Iconography and motion
- High-contrast line icons with filled status markers
- Minimal motion (<200ms transitions)
- No heavy animation dependencies on low-end devices

## 6.6 Accessibility and literacy accommodations
- Icon + short phrase patterns
- Optional audio cue for task steps
- High-contrast mode
- Large, consistent action placement

---

## 7. Technical Architecture Recommendation

## 7.1 Frontend
**Recommended:** Flutter Android app
- Strong performance on low-end devices
- Mature offline data plugins
- Good control of app size and rendering determinism

Alternative considered: React Native + SQLite, but selected Flutter for tighter performance consistency in constrained hardware profiles.

## 7.2 Backend
- Node.js + TypeScript API
- PostgreSQL primary datastore
- Redis queue for alerts/sync jobs/report generation
- Object storage for evidence media
- Worker service for rule evaluation and notification dispatch

## 7.3 API strategy
- REST API versioned (`/api/v1`)
- Command endpoints for writes, optimized query endpoints for dashboards
- Incremental sync endpoints using cursors/checkpoints
- Webhooks for MoMo/bank confirmations and SMS delivery receipts

## 7.4 Database strategy
- Cloud PostgreSQL (authoritative)
- Mobile encrypted SQLite (edge/offline)
- Append-only audit event tables
- Partitioning for large event volume as farm scales to 100k+ birds / multi-site

## 7.5 Hosting and reliability (Ghana context)
- Primary cloud region with reliable Africa latency (EU West candidate)
- CDN edge for static assets
- Scheduled backups + point-in-time recovery
- Queue-backed retries for transient network outages

## 7.6 Integrations
- OTP/SMS: provider with Ghana coverage (e.g., Hubtel/Africa’s Talking)
- MoMo API for payment verification
- Camera capture APIs for evidence upload
- Future IoT ingestion endpoint (scale/sensor camera feeds)

---

## 8. MVP Definition and Phasing

## 8.1 Phase 1 (MVP: minimum viable control system)
1. Authentication + RBAC + device binding
2. Designed Day timeline and task engine
3. Four-hand verification for value transactions
4. Mechanical strike system with auto-escalation
5. Owner dashboard with core RYG metrics
6. Alerting engine (push + SMS fallback for Red)
7. Offline queue/sync with immutable audit trail
8. Sales DA with locked tier pricing
9. Daily reconciliation and weekly summary reporting

**Acceptance gate:** owner can remotely detect and act on all critical exceptions with no onsite presence.

## 8.2 Phase 2 (full role coverage)
- Full CRM pipeline and cold-call targets
- Procurement matrix and larger finance controls
- Maintenance scheduling and equipment lifecycle
- Enhanced discrepancy investigations and root cause workflows

## 8.3 Phase 3 (intelligence and scale)
- IoT-assisted L3 checks
- ML anomaly detection (production, finance, compliance)
- Multi-site and benchmark dashboards
- Centralized policy orchestration across farms

---

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---:|---:|---|
| Prolonged connectivity outage | High | High | Full offline operation + queued sync + SMS fallback |
| Phone loss/theft | Medium | High | Device revoke, forced rebind, encrypted local storage |
| Staff collusion in verification | Medium | High | Pair-pattern anomaly detection + random audits |
| Alert fatigue | Medium | Medium | Dedup/grouping for Yellow, no digest for Red |
| Data quality inconsistency | Medium | High | Form constraints + SOP hints + media evidence |
| Owner unreachable during Red event | Low | High | Escalation chain to Glue + delegated emergency policy |
| Power outage impacts operations | High | Medium | Battery-efficient app + deferred sync |
| Strike disputes | Medium | Medium | Immutable evidence-linked strike ledger + owner pardon workflow |
| Sync conflict complexity | Medium | Medium | Immutable write model + explicit conflict resolver for mutable refs |

---

## 10. Appendices

## Appendix A: Data dictionary (priority fields)
- `hpd_percent` (float)
- `feed_days_remaining` (float)
- `mortality_count_daily` (integer)
- `cash_variance_percent` (float)
- `task_status` (enum)
- `strike_level` (enum)
- `verification_state` (enum)
- `sync_state` (enum)

## Appendix B: Escalation rule matrix
- HDP <78% for 3 days → Red (Owner)
- HDP 78–85% → Yellow (Glue)
- Mortality >5/day for 2 days → Red (Owner+Glue)
- Feed <5 days → Red (Owner+Glue+SC)
- Task overdue >2h → Yellow (SC)
- Task skipped → Orange (SC+Glue)
- Four-hand violation → Yellow (violator) + notify Glue
- Cash mismatch >5% → Orange (Glue+Owner)
- 3 Yellows/30 days → Auto Orange
- 2 Oranges ever → Auto Red
- Equipment Red → Red (Glue+Owner)
- Payment overdue >7 days → Yellow (SO+Glue)

## Appendix C: Permission matrix (condensed)
| Capability | Owner | Glue | SC | SO | Field | Support |
|---|---|---|---|---|---|---|
| View all dashboards | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Configure thresholds | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Assign tasks | ✅ | ✅ | Limited | ❌ | ❌ | ❌ |
| Issue strikes | ✅ | ✅ (Y/O) | ❌ | ❌ | ❌ | ❌ |
| Override/pardon strike | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Edit pricing tiers | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Create DA | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Verify value transaction | ✅ | ✅ | ✅ | Limited | Limited | Limited |
| Access own tasks | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## Appendix D: Designed Day timeline template
- 05:30 SC arrival and checks
- 05:45 Staff sign-in
- 06:00 Feed issuance (two-person)
- 07:00 Egg pass 1 (two-person)
- 07:45 Health walk
- 10:30 Egg pass 2
- 14:00 Egg pass 3
- 17:30 Daily reconciliation + feed verification
- 18:30 Daily report submission

