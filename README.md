# Ultimate Farms - Meta-Compliance Operating System (MCOS)

A structural determinism engine for poultry farm operations that enforces discipline
through digital interlocks, making compliance the default path and deviation costly.

## What This Is

This is **not** a farm management tool. It is the **digital nervous system** for
Ultimate Farms -- rules embedded in code, not paper. The app replaces owner presence
with environment-enforced reliability.

### Three Pillars

1. **Physical Interlocks** - Digital gates that prevent process advancement without
   completing prerequisites
2. **Social + Economic Interlocks** - Collective liability tracking (Susu-compliance
   escrow model) with immediate payoff coupling
3. **Low-Bandwidth Visibility** - Proof-of-Work protocols with randomized audits

## Core Modules

| Phase | Module | Purpose |
|-------|--------|---------|
| 1 | Daily Production Brief | Holy Trinity KPIs: HDP%, FCR, Livability |
| 1 | Feed Operations | Aflatoxin Firewall, substitution calculator, dual-key issuance |
| 1 | Sales & Reconciliation | Cashless-first enforcement, daily cash match |
| 1 | Maintenance Tracking | Asset registry, PM calendar, MTTR tracking |
| 2 | Biosecurity Compliance | Boot exchange logging, zone access control, PPE verification |
| 2 | Rodent Control | Trap maps, entry point audits, bait station logs |
| 2 | Manure Management | Just-in-Time protocol, Time-on-Ground metrics |
| 3 | Feed Mill Dashboard | Batch formulation, cost-per-ton, FIFO enforcement |
| 3 | Dynamic Pricing | Channel analytics, contract management, margin control |
| 3 | Infrastructure Projects | Construction tracking, CapEx budget variance |

## Tech Stack

- **Backend:** Node.js + TypeScript, Express.js, PostgreSQL, Redis
- **Frontend:** React PWA (offline-first), Tailwind CSS
- **Offline:** IndexedDB via Dexie.js with background sync
- **Integrations:** WhatsApp Cloud API, MoMo API, IoT sensors

## Key Design Constraints

- **Offline-first:** Gomoa Buduatta has unreliable connectivity
- **Low-end devices:** PWA targeting phones with <=2GB RAM
- **Literacy variance:** Visual-heavy UI with icon navigation, Twi language support
- **Power instability:** Auto-save every 30 seconds, battery-optimized

## Project Structure

```
Ultimate-Farms/
├── docs/
│   ├── DESIGN_BLUEPRINT.md    # Full design specification
│   └── ARCHITECTURE.md        # Technical architecture details
├── src/
│   ├── config/                # App configuration
│   ├── db/
│   │   └── schemas/           # PostgreSQL migration schemas
│   │       ├── 001_core_mes.sql
│   │       ├── 002_financial.sql
│   │       └── 003_biosecurity_maintenance.sql
│   ├── middleware/             # Auth, RBAC, audit logging
│   ├── modules/
│   │   ├── production/        # Daily briefs, HDP calculations
│   │   ├── feed/              # Feed ops, substitution engine
│   │   ├── sales/             # Orders, reconciliation
│   │   ├── maintenance/       # Assets, tickets, PM schedules
│   │   ├── biosecurity/       # Zone access, boot exchange
│   │   ├── manure/            # Belt ops, Time-on-Ground
│   │   └── strategic/         # DEAS, pricing, projects
│   └── utils/                 # Shared utilities
├── .gitignore
└── README.md
```

## Database Schema

The Core 4 MES tables form the single source of truth:

1. **Flock Master** - Bird populations with mortality cascade auto-updates
2. **Production Log** - Egg collection with auto-calculated HDP% and fraud detection
3. **Mortality Events** - Bird loss tracking with causal attribution
4. **Feed Inventory** - Stock management with Aflatoxin Firewall enforcement

Additional schemas cover financial controls (append-only ledger, Susu-compliance escrow),
biosecurity (zone access, footbath logs), maintenance (asset registry, MTTR tracking),
and rodent/manure management.

## User Roles

| Role | Access Level |
|------|-------------|
| Owner / Systems Architect | Exception-only dashboard, <1 hr/week target |
| Glue Person / Compliance Officer | Full audit view, no operational power |
| Bird Whisperer / Technical Lead | Production analytics, feed formulas |
| Production Supervisors | Team task checklists, SOP access |
| Farm Hands / Operators | Task-specific mobile UI, photo capture |
| Storekeeper | Inventory management, issuance logging |

## Documentation

- [Design Blueprint](docs/DESIGN_BLUEPRINT.md) - Complete design specification
- [Technical Architecture](docs/ARCHITECTURE.md) - System architecture and tech decisions
