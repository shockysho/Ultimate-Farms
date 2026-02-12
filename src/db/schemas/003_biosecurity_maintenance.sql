-- Ultimate Farms: Biosecurity & Maintenance Schema
-- Implements digital biosecurity enforcement and preventive maintenance tracking.

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE zone_type AS ENUM (
    'production',     -- egg houses
    'feed_mill',
    'storage',
    'processing',
    'quarantine',
    'admin',
    'external'
);

CREATE TYPE asset_tier AS ENUM (
    'tier1',          -- critical: egg belts, cooling pads, generators
    'tier2',          -- important: water pumps, ventilation fans
    'tier3'           -- standard: lighting, minor equipment
);

CREATE TYPE maintenance_type AS ENUM (
    'preventive',
    'corrective',
    'emergency'
);

CREATE TYPE ticket_status AS ENUM (
    'open',
    'in_progress',
    'waiting_parts',
    'completed',
    'cancelled'
);

-- ============================================================
-- TABLE: BIOSECURITY ZONES
-- ============================================================
CREATE TABLE biosecurity_zones (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_code       VARCHAR(10) UNIQUE NOT NULL,
    zone_name       VARCHAR(100) NOT NULL,
    zone_type       zone_type NOT NULL,
    ppe_color       VARCHAR(20),                      -- color-coded PPE for this zone
    requires_boot_exchange BOOLEAN DEFAULT true,
    requires_footbath BOOLEAN DEFAULT true,
    max_occupancy   INTEGER,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: ZONE ACCESS LOG
-- Entry/exit tracking for biosecurity compliance.
-- ============================================================
CREATE TABLE zone_access_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_id         UUID NOT NULL REFERENCES biosecurity_zones(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    entry_time      TIMESTAMPTZ NOT NULL,
    exit_time       TIMESTAMPTZ,
    duration_minutes INTEGER,                         -- auto-calculated on exit

    -- Boot exchange verification
    boot_exchange_verified BOOLEAN DEFAULT false,
    boot_exchange_photo_url TEXT,

    -- PPE verification
    ppe_verified    BOOLEAN DEFAULT false,
    ppe_photo_url   TEXT,

    -- Visitor info (if applicable)
    is_visitor      BOOLEAN DEFAULT false,
    visitor_name    VARCHAR(100),
    visitor_purpose TEXT,
    visitor_approved_by UUID REFERENCES users(id),

    sync_status     sync_status DEFAULT 'pending',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_zone_access_zone ON zone_access_log(zone_id);
CREATE INDEX idx_zone_access_user ON zone_access_log(user_id);
CREATE INDEX idx_zone_access_time ON zone_access_log(entry_time);
CREATE INDEX idx_zone_access_active ON zone_access_log(exit_time) WHERE exit_time IS NULL;

-- ============================================================
-- TABLE: FOOTBATH LOG
-- Chemical concentration testing for footbaths.
-- ============================================================
CREATE TABLE footbath_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_id         UUID NOT NULL REFERENCES biosecurity_zones(id),
    test_date       DATE NOT NULL,
    chemical_name   VARCHAR(100) NOT NULL,
    concentration_ppm NUMERIC(8,2) NOT NULL,
    target_ppm      NUMERIC(8,2) NOT NULL,
    is_within_spec  BOOLEAN GENERATED ALWAYS AS (
        concentration_ppm >= target_ppm * 0.9 AND concentration_ppm <= target_ppm * 1.1
    ) STORED,
    action_taken    TEXT,                              -- what was done if out of spec
    tested_by       UUID NOT NULL REFERENCES users(id),
    photo_url       TEXT,
    sync_status     sync_status DEFAULT 'pending',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_footbath_zone ON footbath_log(zone_id);
CREATE INDEX idx_footbath_date ON footbath_log(test_date);

-- ============================================================
-- TABLE: ASSETS (Equipment Registry)
-- ============================================================
CREATE TABLE assets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_code      VARCHAR(20) UNIQUE NOT NULL,      -- e.g., 'EQP-EB-001' (egg belt #1)
    asset_name      VARCHAR(150) NOT NULL,
    category        VARCHAR(50) NOT NULL,              -- 'egg_belt', 'cooling_pad', 'generator', etc.
    tier            asset_tier NOT NULL,
    location        VARCHAR(50) NOT NULL,              -- house/zone where installed
    manufacturer    VARCHAR(100),
    model_number    VARCHAR(100),
    serial_number   VARCHAR(100),
    install_date    DATE,
    warranty_expiry DATE,
    expected_lifespan_months INTEGER,
    status          VARCHAR(20) DEFAULT 'operational'
        CHECK (status IN ('operational', 'degraded', 'down', 'decommissioned')),
    last_maintenance_date DATE,
    next_maintenance_date DATE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    created_by      UUID NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_assets_tier ON assets(tier);
CREATE INDEX idx_assets_status ON assets(status);
CREATE INDEX idx_assets_next_maint ON assets(next_maintenance_date);

-- ============================================================
-- TABLE: MAINTENANCE SCHEDULE
-- Preventive maintenance calendar with auto-generated tasks.
-- ============================================================
CREATE TABLE maintenance_schedule (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id        UUID NOT NULL REFERENCES assets(id),
    maintenance_type maintenance_type NOT NULL,
    description     TEXT NOT NULL,
    frequency_days  INTEGER NOT NULL,                 -- interval between maintenance
    last_completed  DATE,
    next_due        DATE NOT NULL,
    assigned_to     UUID REFERENCES users(id),
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_maint_schedule_due ON maintenance_schedule(next_due);
CREATE INDEX idx_maint_schedule_asset ON maintenance_schedule(asset_id);

-- ============================================================
-- TABLE: MAINTENANCE TICKETS
-- Breakdown and maintenance work order tracking.
-- ============================================================
CREATE TABLE maintenance_tickets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_number   VARCHAR(20) UNIQUE NOT NULL,
    asset_id        UUID NOT NULL REFERENCES assets(id),
    maintenance_type maintenance_type NOT NULL,
    schedule_id     UUID REFERENCES maintenance_schedule(id),  -- NULL for unscheduled

    -- Issue details
    title           VARCHAR(200) NOT NULL,
    description     TEXT,
    reported_by     UUID NOT NULL REFERENCES users(id),
    reported_at     TIMESTAMPTZ DEFAULT NOW(),

    -- Assignment & tracking
    assigned_to     UUID REFERENCES users(id),
    status          ticket_status DEFAULT 'open',
    priority        INTEGER DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),  -- 1=highest

    -- Resolution
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    resolution_notes TEXT,
    parts_used      JSONB DEFAULT '[]'::jsonb,
    labor_hours     NUMERIC(6,2),

    -- MTTR calculation (auto from started_at to completed_at)
    mttr_minutes    INTEGER,

    -- Proof-of-work
    before_photo_url TEXT,
    after_photo_url  TEXT,

    sync_status     sync_status DEFAULT 'pending',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tickets_asset ON maintenance_tickets(asset_id);
CREATE INDEX idx_tickets_status ON maintenance_tickets(status);
CREATE INDEX idx_tickets_priority ON maintenance_tickets(priority) WHERE status != 'completed';

-- ============================================================
-- TABLE: RODENT CONTROL LOG
-- ============================================================
CREATE TABLE rodent_control_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inspection_date DATE NOT NULL,
    zone_id         UUID NOT NULL REFERENCES biosecurity_zones(id),

    -- Trap data
    traps_placed    INTEGER NOT NULL DEFAULT 0,
    traps_triggered INTEGER NOT NULL DEFAULT 0,
    rodents_caught  INTEGER NOT NULL DEFAULT 0,

    -- Bait stations
    bait_stations_checked INTEGER NOT NULL DEFAULT 0,
    bait_consumed_pct NUMERIC(5,2),

    -- Entry point audit
    entry_points_found INTEGER DEFAULT 0,
    entry_points_sealed INTEGER DEFAULT 0,
    entry_point_details JSONB DEFAULT '[]'::jsonb,    -- array of {location, type, status}

    -- Feed spillage
    feed_spillage_observed BOOLEAN DEFAULT false,
    spillage_location TEXT,
    spillage_cleaned BOOLEAN DEFAULT false,

    -- Proof-of-work
    photo_urls      JSONB DEFAULT '[]'::jsonb,        -- array of photo S3 keys

    inspected_by    UUID NOT NULL REFERENCES users(id),
    sync_status     sync_status DEFAULT 'pending',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rodent_date ON rodent_control_log(inspection_date);
CREATE INDEX idx_rodent_zone ON rodent_control_log(zone_id);

-- ============================================================
-- TABLE: MANURE MANAGEMENT LOG
-- Just-in-Time protocol and Time-on-Ground tracking.
-- ============================================================
CREATE TABLE manure_management_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    house_id        VARCHAR(10) NOT NULL,
    log_date        DATE NOT NULL,

    -- Belt operation timing
    belt_start_time TIMESTAMPTZ,
    belt_end_time   TIMESTAMPTZ,

    -- Aboboya crew coordination (Just-in-Time protocol)
    crew_ready_confirmed BOOLEAN DEFAULT false,
    crew_confirmed_by UUID REFERENCES users(id),
    crew_confirmed_at TIMESTAMPTZ,

    -- Time-on-Ground metric (target: <2 hours)
    manure_dropped_at TIMESTAMPTZ,
    manure_collected_at TIMESTAMPTZ,
    time_on_ground_minutes INTEGER,                   -- auto-calc from timestamps

    -- Clean Deck verification
    clean_deck_verified BOOLEAN DEFAULT false,
    clean_deck_photo_url TEXT,

    -- Moisture control
    roof_coverage_ok BOOLEAN DEFAULT true,
    moisture_issues_noted TEXT,

    recorded_by     UUID NOT NULL REFERENCES users(id),
    sync_status     sync_status DEFAULT 'pending',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_manure_date ON manure_management_log(log_date);
CREATE INDEX idx_manure_house ON manure_management_log(house_id);
CREATE INDEX idx_manure_tog ON manure_management_log(time_on_ground_minutes)
    WHERE time_on_ground_minutes > 120;  -- flag > 2 hours
