-- Ultimate Farms: Core 4 MES Database Schema
-- Manufacturing Execution System foundational tables
-- These tables form the single source of truth for all farm operations.

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE user_role AS ENUM (
    'owner',
    'compliance_officer',
    'technical_lead',
    'supervisor',
    'operator',
    'storekeeper'
);

CREATE TYPE flock_status AS ENUM (
    'active',
    'depleted',
    'sold',
    'quarantined'
);

CREATE TYPE mortality_cause AS ENUM (
    'disease',
    'heat_stress',
    'predator',
    'equipment_failure',
    'cannibalism',
    'unknown',
    'culled',
    'other'
);

CREATE TYPE alert_severity AS ENUM (
    'info',
    'warning',
    'critical'
);

CREATE TYPE feed_type AS ENUM (
    'starter',
    'grower',
    'pre_layer',
    'layer_phase1',
    'layer_phase2',
    'layer_phase3'
);

CREATE TYPE qc_status AS ENUM (
    'pending',
    'passed',
    'failed',
    'waived'
);

CREATE TYPE sync_status AS ENUM (
    'pending',
    'synced',
    'conflict',
    'failed'
);

-- ============================================================
-- TABLE 1: USERS
-- ============================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     VARCHAR(20) UNIQUE NOT NULL,
    full_name       VARCHAR(100) NOT NULL,
    role            user_role NOT NULL,
    team            VARCHAR(10),  -- 'A', 'B', 'C' for production teams
    pin_hash        VARCHAR(255),  -- bcrypt hash of 4-6 digit PIN
    phone_number    VARCHAR(20),
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    created_by      UUID REFERENCES users(id)
);

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_team ON users(team);
CREATE INDEX idx_users_active ON users(is_active) WHERE is_active = true;

-- ============================================================
-- TABLE 2: FLOCK MASTER (Core 4 - #1)
-- Single source of truth for bird populations.
-- Auto-updated via mortality cascades.
-- ============================================================
CREATE TABLE flock_master (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flock_code      VARCHAR(20) UNIQUE NOT NULL,  -- e.g., 'FL-2026-001'
    breed           VARCHAR(50) NOT NULL,          -- e.g., 'ISA Brown', 'Lohmann'
    house_id        VARCHAR(10) NOT NULL,          -- physical house identifier
    cage_row        VARCHAR(5),                    -- row within house
    date_received   DATE NOT NULL,
    age_at_receipt_weeks INTEGER NOT NULL,
    initial_count   INTEGER NOT NULL CHECK (initial_count > 0),
    current_count   INTEGER NOT NULL CHECK (current_count >= 0),
    status          flock_status DEFAULT 'active',
    expected_peak_week INTEGER,                    -- week of age for peak production
    depletion_date  DATE,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    created_by      UUID NOT NULL REFERENCES users(id),

    CONSTRAINT current_lte_initial CHECK (current_count <= initial_count)
);

CREATE INDEX idx_flock_status ON flock_master(status);
CREATE INDEX idx_flock_house ON flock_master(house_id);

-- ============================================================
-- TABLE 3: PRODUCTION LOG (Core 4 - #2)
-- Daily egg collection with auto-calculated HDP%.
-- Fraud detection via scale variance tolerance (+/-2%).
-- ============================================================
CREATE TABLE production_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flock_id        UUID NOT NULL REFERENCES flock_master(id),
    log_date        DATE NOT NULL,
    collection_time VARCHAR(10) NOT NULL,           -- 'morning', 'midday', 'evening'

    -- Egg counts by grade
    eggs_normal     INTEGER NOT NULL DEFAULT 0 CHECK (eggs_normal >= 0),
    eggs_cracked    INTEGER NOT NULL DEFAULT 0 CHECK (eggs_cracked >= 0),
    eggs_soft_shell INTEGER NOT NULL DEFAULT 0 CHECK (eggs_soft_shell >= 0),
    eggs_dirty      INTEGER NOT NULL DEFAULT 0 CHECK (eggs_dirty >= 0),
    eggs_total      INTEGER GENERATED ALWAYS AS (
        eggs_normal + eggs_cracked + eggs_soft_shell + eggs_dirty
    ) STORED,

    -- Weight verification (fraud detection)
    tray_count      INTEGER NOT NULL DEFAULT 0,     -- number of 30-egg trays
    scale_weight_kg NUMERIC(8,2),                   -- actual weighed
    expected_weight_kg NUMERIC(8,2),                -- calculated from count * avg egg weight
    weight_variance_pct NUMERIC(5,2),               -- auto-calculated, flag if > 2%

    -- HDP calculation (auto-calculated)
    hen_count       INTEGER NOT NULL,                -- snapshot of flock count at time of log
    hdp_percent     NUMERIC(5,2) GENERATED ALWAYS AS (
        CASE WHEN hen_count > 0
            THEN ROUND(
                (eggs_normal + eggs_cracked + eggs_soft_shell + eggs_dirty)::NUMERIC
                / hen_count * 100, 2
            )
            ELSE 0
        END
    ) STORED,

    recorded_by     UUID NOT NULL REFERENCES users(id),
    verified_by     UUID REFERENCES users(id),       -- second verification for fraud prevention
    sync_status     sync_status DEFAULT 'pending',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT unique_flock_date_time UNIQUE (flock_id, log_date, collection_time)
);

CREATE INDEX idx_production_date ON production_log(log_date);
CREATE INDEX idx_production_flock ON production_log(flock_id);
CREATE INDEX idx_production_hdp ON production_log(hdp_percent);
CREATE INDEX idx_production_variance ON production_log(weight_variance_pct)
    WHERE weight_variance_pct > 2.0;

-- ============================================================
-- TABLE 4: MORTALITY EVENTS (Core 4 - #3)
-- Bird loss tracking with causal attribution.
-- Triggers flock_master.current_count cascade update.
-- ============================================================
CREATE TABLE mortality_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flock_id        UUID NOT NULL REFERENCES flock_master(id),
    event_date      DATE NOT NULL,
    bird_count      INTEGER NOT NULL CHECK (bird_count > 0),
    cause           mortality_cause NOT NULL,
    cause_detail    TEXT,                            -- free-text for specifics
    house_id        VARCHAR(10) NOT NULL,
    cage_row        VARCHAR(5),

    -- Proof-of-work
    photo_url       TEXT,                            -- S3 key for verification photo
    photo_gps_lat   NUMERIC(10,7),
    photo_gps_lon   NUMERIC(10,7),
    photo_timestamp TIMESTAMPTZ,

    reported_by     UUID NOT NULL REFERENCES users(id),
    verified_by     UUID REFERENCES users(id),
    sync_status     sync_status DEFAULT 'pending',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mortality_date ON mortality_events(event_date);
CREATE INDEX idx_mortality_flock ON mortality_events(flock_id);
CREATE INDEX idx_mortality_cause ON mortality_events(cause);

-- Trigger: Auto-update flock_master.current_count on mortality insert
CREATE OR REPLACE FUNCTION update_flock_count_on_mortality()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE flock_master
    SET current_count = current_count - NEW.bird_count,
        updated_at = NOW()
    WHERE id = NEW.flock_id;

    -- Auto-deplete flock if count reaches zero
    UPDATE flock_master
    SET status = 'depleted',
        depletion_date = NEW.event_date,
        updated_at = NOW()
    WHERE id = NEW.flock_id AND current_count <= 0;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mortality_cascade
    AFTER INSERT ON mortality_events
    FOR EACH ROW
    EXECUTE FUNCTION update_flock_count_on_mortality();

-- ============================================================
-- TABLE 5: FEED INVENTORY (Core 4 - #4)
-- Mandatory Aflatoxin Firewall, dual-key issuance protocol.
-- ============================================================
CREATE TABLE feed_ingredients (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ingredient_name VARCHAR(100) UNIQUE NOT NULL,    -- e.g., 'Maize', 'Soybean Meal'
    unit            VARCHAR(20) NOT NULL DEFAULT 'kg',
    current_stock   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
    reorder_level   NUMERIC(12,2) NOT NULL DEFAULT 0,
    max_inclusion_pct NUMERIC(5,2),                  -- max % in any formulation
    requires_aflatoxin_test BOOLEAN DEFAULT false,   -- Aflatoxin Firewall flag
    aflatoxin_max_ppb INTEGER DEFAULT 20,            -- rejection threshold
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    created_by      UUID NOT NULL REFERENCES users(id)
);

CREATE TABLE feed_receipts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ingredient_id   UUID NOT NULL REFERENCES feed_ingredients(id),
    supplier_name   VARCHAR(100) NOT NULL,
    quantity        NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
    unit_price      NUMERIC(12,2) NOT NULL CHECK (unit_price > 0),
    total_cost      NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    receipt_date    DATE NOT NULL,
    batch_number    VARCHAR(50),
    po_number       VARCHAR(50) NOT NULL,            -- No PO, No Payment enforcement

    -- Aflatoxin Firewall: QC gate
    aflatoxin_test_ppb INTEGER,                      -- NULL if not required
    aflatoxin_qc_status qc_status DEFAULT 'pending',
    qc_tested_by    UUID REFERENCES users(id),
    qc_test_date    DATE,

    -- Proof-of-work
    receipt_photo_url TEXT,

    received_by     UUID NOT NULL REFERENCES users(id),
    verified_by     UUID REFERENCES users(id),       -- dual-key: second person
    sync_status     sync_status DEFAULT 'pending',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feed_receipts_ingredient ON feed_receipts(ingredient_id);
CREATE INDEX idx_feed_receipts_date ON feed_receipts(receipt_date);
CREATE INDEX idx_feed_receipts_qc ON feed_receipts(aflatoxin_qc_status)
    WHERE aflatoxin_qc_status = 'pending';

-- Trigger: Block issuance of ingredients that require aflatoxin test without passing QC
CREATE OR REPLACE FUNCTION enforce_aflatoxin_firewall()
RETURNS TRIGGER AS $$
DECLARE
    requires_test BOOLEAN;
BEGIN
    SELECT requires_aflatoxin_test INTO requires_test
    FROM feed_ingredients WHERE id = NEW.ingredient_id;

    IF requires_test AND (NEW.aflatoxin_qc_status IS NULL OR NEW.aflatoxin_qc_status != 'passed') THEN
        RAISE EXCEPTION 'AFLATOXIN FIREWALL: Ingredient requires passing aflatoxin test (<% ppb) before stock can be updated.',
            (SELECT aflatoxin_max_ppb FROM feed_ingredients WHERE id = NEW.ingredient_id);
    END IF;

    -- Update stock on receipt
    UPDATE feed_ingredients
    SET current_stock = current_stock + NEW.quantity,
        updated_at = NOW()
    WHERE id = NEW.ingredient_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_aflatoxin_firewall
    BEFORE INSERT ON feed_receipts
    FOR EACH ROW
    EXECUTE FUNCTION enforce_aflatoxin_firewall();

CREATE TABLE feed_issuances (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ingredient_id   UUID NOT NULL REFERENCES feed_ingredients(id),
    quantity        NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
    feed_type       feed_type NOT NULL,
    target_house    VARCHAR(10),
    issue_date      DATE NOT NULL,

    -- Dual-key issuance protocol
    issued_by       UUID NOT NULL REFERENCES users(id),    -- first key
    authorized_by   UUID NOT NULL REFERENCES users(id),    -- second key
    compliance_token VARCHAR(64),                           -- digital gate token

    sync_status     sync_status DEFAULT 'pending',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    -- Dual-key enforcement: issuer and authorizer must be different people
    CONSTRAINT dual_key_different CHECK (issued_by != authorized_by)
);

CREATE INDEX idx_feed_issuances_date ON feed_issuances(issue_date);
CREATE INDEX idx_feed_issuances_ingredient ON feed_issuances(ingredient_id);

-- Trigger: Deduct stock on issuance
CREATE OR REPLACE FUNCTION deduct_feed_stock()
RETURNS TRIGGER AS $$
DECLARE
    available NUMERIC;
BEGIN
    SELECT current_stock INTO available
    FROM feed_ingredients WHERE id = NEW.ingredient_id;

    IF available < NEW.quantity THEN
        RAISE EXCEPTION 'Insufficient stock: available=%, requested=%', available, NEW.quantity;
    END IF;

    UPDATE feed_ingredients
    SET current_stock = current_stock - NEW.quantity,
        updated_at = NOW()
    WHERE id = NEW.ingredient_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_deduct_feed_stock
    BEFORE INSERT ON feed_issuances
    FOR EACH ROW
    EXECUTE FUNCTION deduct_feed_stock();

-- ============================================================
-- TABLE 6: AUDIT LOG (Immutable)
-- Every write operation is logged here.
-- ============================================================
CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name      VARCHAR(100) NOT NULL,
    record_id       UUID NOT NULL,
    action          VARCHAR(10) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    actor_id        UUID NOT NULL REFERENCES users(id),
    old_values      JSONB,
    new_values      JSONB,
    reason          TEXT,
    ip_address      INET,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Append-only: no updates or deletes allowed on audit_log
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit log is immutable. UPDATE and DELETE operations are prohibited.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_immutable
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_modification();

CREATE INDEX idx_audit_table ON audit_log(table_name);
CREATE INDEX idx_audit_record ON audit_log(record_id);
CREATE INDEX idx_audit_actor ON audit_log(actor_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);

-- ============================================================
-- TABLE 7: ALERTS
-- Threshold violation records for exception-only dashboard.
-- ============================================================
CREATE TABLE alerts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_type      VARCHAR(50) NOT NULL,            -- e.g., 'mortality_spike', 'production_drop'
    severity        alert_severity NOT NULL,
    title           VARCHAR(200) NOT NULL,
    description     TEXT,
    metric_name     VARCHAR(100),
    metric_value    NUMERIC(12,4),
    threshold_value NUMERIC(12,4),
    source_table    VARCHAR(100),
    source_record   UUID,
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMPTZ,
    resolved_by     UUID REFERENCES users(id),
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_unresolved ON alerts(resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX idx_alerts_type ON alerts(alert_type);

-- ============================================================
-- TABLE 8: COMPLIANCE TOKENS
-- Digital gate/interlock state for Poka-Yoke enforcement.
-- ============================================================
CREATE TABLE compliance_tokens (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_type      VARCHAR(50) NOT NULL,            -- e.g., 'daily_brief_complete', 'feed_mixing_done'
    token_value     VARCHAR(64) NOT NULL UNIQUE,     -- cryptographic token
    issued_for_date DATE NOT NULL,
    issued_to       UUID NOT NULL REFERENCES users(id),
    prerequisite    VARCHAR(100) NOT NULL,            -- what was completed to earn this token
    consumed_by     VARCHAR(100),                     -- what workflow consumed this token
    consumed_at     TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tokens_date ON compliance_tokens(issued_for_date);
CREATE INDEX idx_tokens_type ON compliance_tokens(token_type);
CREATE INDEX idx_tokens_unconsumed ON compliance_tokens(consumed_at) WHERE consumed_at IS NULL;

-- ============================================================
-- TABLE 9: PROOF OF WORK
-- Photo verification records with GPS + timestamp.
-- ============================================================
CREATE TABLE proof_of_work (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_type       VARCHAR(50) NOT NULL,             -- e.g., 'boot_exchange', 'clean_deck', 'egg_collection'
    photo_url       TEXT NOT NULL,                     -- S3 key
    gps_latitude    NUMERIC(10,7),
    gps_longitude   NUMERIC(10,7),
    photo_timestamp TIMESTAMPTZ NOT NULL,
    device_id       VARCHAR(100),
    is_random_audit BOOLEAN DEFAULT false,             -- was this a random challenge?
    hash_sha256     VARCHAR(64) NOT NULL,              -- immutable hash of photo
    submitted_by    UUID NOT NULL REFERENCES users(id),
    verified_by     UUID REFERENCES users(id),
    verification_status VARCHAR(20) DEFAULT 'pending'
        CHECK (verification_status IN ('pending', 'accepted', 'rejected')),
    rejection_reason TEXT,
    sync_status     sync_status DEFAULT 'pending',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pow_task ON proof_of_work(task_type);
CREATE INDEX idx_pow_date ON proof_of_work(created_at);
CREATE INDEX idx_pow_pending ON proof_of_work(verification_status)
    WHERE verification_status = 'pending';

-- ============================================================
-- TABLE 10: ALERT CONFIGURATION
-- Owner-configurable thresholds for the alert engine.
-- ============================================================
CREATE TABLE alert_config (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_type      VARCHAR(50) UNIQUE NOT NULL,
    metric_name     VARCHAR(100) NOT NULL,
    threshold_value NUMERIC(12,4) NOT NULL,
    comparison      VARCHAR(5) NOT NULL CHECK (comparison IN ('>', '<', '>=', '<=', '=')),
    severity        alert_severity NOT NULL,
    duration_minutes INTEGER,                         -- how long condition must persist
    notify_roles    user_role[] NOT NULL,              -- which roles get notified
    is_active       BOOLEAN DEFAULT true,
    updated_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default alert thresholds from design blueprint
INSERT INTO alert_config (alert_type, metric_name, threshold_value, comparison, severity, duration_minutes, notify_roles) VALUES
    ('mortality_daily', 'daily_mortality_pct', 0.3, '>', 'critical', NULL, '{owner,compliance_officer}'),
    ('temperature_high', 'house_temperature_c', 31, '>', 'critical', 30, '{owner,compliance_officer,technical_lead}'),
    ('lay_rate_low', 'hdp_percent', 88, '<', 'warning', NULL, '{owner,technical_lead}'),
    ('cash_mismatch', 'cash_variance', 0, '>', 'critical', NULL, '{owner,compliance_officer}'),
    ('equipment_failure', 'tier1_asset_down', 1, '>=', 'critical', NULL, '{owner,compliance_officer,technical_lead}'),
    ('feed_price_spike', 'price_vs_benchmark_pct', 15, '>', 'warning', NULL, '{owner,technical_lead}'),
    ('production_drop', 'production_vs_7d_avg_pct', 2, '>', 'warning', NULL, '{owner,technical_lead}');
