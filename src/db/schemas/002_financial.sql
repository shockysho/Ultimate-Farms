-- Ultimate Farms: Financial Schema
-- Append-only ledger for fraud-proof financial tracking.
-- Implements cashless-first enforcement and "No PO, No Payment" workflow.

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE payment_method AS ENUM (
    'momo',          -- Mobile Money (primary)
    'bank_transfer',
    'cash',          -- requires override justification
    'credit'         -- pre-approved customers only
);

CREATE TYPE transaction_type AS ENUM (
    'sale',
    'purchase',
    'refund',
    'adjustment'
);

CREATE TYPE order_status AS ENUM (
    'pending',
    'confirmed',
    'fulfilled',
    'cancelled'
);

CREATE TYPE po_status AS ENUM (
    'draft',
    'approved',
    'received',
    'paid',
    'cancelled'
);

-- ============================================================
-- TABLE: CUSTOMERS
-- ============================================================
CREATE TABLE customers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_code   VARCHAR(20) UNIQUE NOT NULL,
    business_name   VARCHAR(150),
    contact_name    VARCHAR(100) NOT NULL,
    phone_number    VARCHAR(20) NOT NULL,
    channel         VARCHAR(20) NOT NULL CHECK (channel IN ('wholesale', 'farm_gate', 'horeca', 'retail')),
    momo_number     VARCHAR(20),
    credit_eligible BOOLEAN DEFAULT false,
    credit_limit    NUMERIC(12,2) DEFAULT 0,
    outstanding_balance NUMERIC(12,2) DEFAULT 0,
    total_purchases NUMERIC(14,2) DEFAULT 0,
    last_purchase_date DATE,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    created_by      UUID NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_customers_channel ON customers(channel);
CREATE INDEX idx_customers_active ON customers(is_active) WHERE is_active = true;

-- ============================================================
-- TABLE: SALES ORDERS (Append-only financial data)
-- ============================================================
CREATE TABLE sales_orders (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number    VARCHAR(20) UNIQUE NOT NULL,      -- auto-generated: SO-YYYYMMDD-NNN
    customer_id     UUID NOT NULL REFERENCES customers(id),
    order_date      DATE NOT NULL,
    status          order_status DEFAULT 'pending',

    -- Product details
    eggs_trays      INTEGER NOT NULL CHECK (eggs_trays > 0),
    egg_grade       VARCHAR(20) DEFAULT 'normal',
    unit_price      NUMERIC(10,2) NOT NULL CHECK (unit_price > 0),
    total_amount    NUMERIC(12,2) GENERATED ALWAYS AS (eggs_trays * unit_price) STORED,

    -- Payment enforcement
    payment_method  payment_method NOT NULL,
    payment_reference VARCHAR(100),                   -- MoMo transaction ID / bank ref
    payment_receipt_url TEXT,                          -- photo of MoMo confirmation
    payment_verified BOOLEAN DEFAULT false,
    payment_verified_by UUID REFERENCES users(id),

    -- Cash override (high-friction path)
    cash_override_reason TEXT,                         -- required if payment_method = 'cash'
    cash_override_approved_by UUID REFERENCES users(id),

    recorded_by     UUID NOT NULL REFERENCES users(id),
    sync_status     sync_status DEFAULT 'pending',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    -- Cashless enforcement: cash requires explicit justification
    CONSTRAINT cashless_enforcement CHECK (
        payment_method != 'cash' OR cash_override_reason IS NOT NULL
    )
);

CREATE INDEX idx_sales_date ON sales_orders(order_date);
CREATE INDEX idx_sales_customer ON sales_orders(customer_id);
CREATE INDEX idx_sales_unverified ON sales_orders(payment_verified) WHERE payment_verified = false;

-- Prevent modification of completed sales
CREATE OR REPLACE FUNCTION protect_completed_sales()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'fulfilled' AND NEW.status != 'fulfilled' THEN
        RAISE EXCEPTION 'Cannot modify fulfilled sales orders. Create an adjustment instead.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protect_sales
    BEFORE UPDATE ON sales_orders
    FOR EACH ROW
    EXECUTE FUNCTION protect_completed_sales();

-- ============================================================
-- TABLE: PURCHASE ORDERS ("No PO, No Payment" enforcement)
-- ============================================================
CREATE TABLE purchase_orders (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_number       VARCHAR(20) UNIQUE NOT NULL,      -- auto-generated: PO-YYYYMMDD-NNN
    supplier_name   VARCHAR(150) NOT NULL,
    supplier_phone  VARCHAR(20),
    description     TEXT NOT NULL,
    category        VARCHAR(50) NOT NULL,              -- 'feed', 'equipment', 'consumables', etc.

    -- Financial
    estimated_amount NUMERIC(12,2) NOT NULL CHECK (estimated_amount > 0),
    actual_amount   NUMERIC(12,2),
    market_benchmark NUMERIC(12,2),                    -- for price comparison alerts
    price_variance_pct NUMERIC(5,2),                   -- auto-calc: (actual - benchmark) / benchmark * 100

    status          po_status DEFAULT 'draft',

    -- Approval chain
    requested_by    UUID NOT NULL REFERENCES users(id),
    approved_by     UUID REFERENCES users(id),
    approved_at     TIMESTAMPTZ,

    -- Receipt verification
    receipt_photo_url TEXT,                             -- mandatory photo of goods received
    received_by     UUID REFERENCES users(id),
    received_at     TIMESTAMPTZ,

    -- Payment tracking
    payment_method  payment_method,
    payment_reference VARCHAR(100),
    paid_at         TIMESTAMPTZ,
    paid_by         UUID REFERENCES users(id),

    sync_status     sync_status DEFAULT 'pending',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_po_status ON purchase_orders(status);
CREATE INDEX idx_po_date ON purchase_orders(created_at);

-- Enforce: no payment without PO approval
CREATE OR REPLACE FUNCTION enforce_po_before_payment()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.paid_at IS NOT NULL AND NEW.status != 'received' THEN
        RAISE EXCEPTION 'NO PO, NO PAYMENT: Purchase order must be in "received" status before payment.';
    END IF;
    IF NEW.paid_at IS NOT NULL AND NEW.approved_by IS NULL THEN
        RAISE EXCEPTION 'NO PO, NO PAYMENT: Purchase order must be approved before payment.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_po_payment_enforcement
    BEFORE UPDATE ON purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION enforce_po_before_payment();

-- ============================================================
-- TABLE: DAILY CASH RECONCILIATION
-- ============================================================
CREATE TABLE daily_reconciliation (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reconciliation_date DATE UNIQUE NOT NULL,

    -- Production side
    total_eggs_produced INTEGER NOT NULL,
    total_eggs_sold     INTEGER NOT NULL,
    eggs_in_storage     INTEGER NOT NULL,
    shrinkage_count     INTEGER GENERATED ALWAYS AS (
        total_eggs_produced - total_eggs_sold - eggs_in_storage
    ) STORED,

    -- Financial side
    expected_revenue    NUMERIC(12,2) NOT NULL,        -- from sales orders
    actual_momo_received NUMERIC(12,2) NOT NULL DEFAULT 0,
    actual_cash_received NUMERIC(12,2) NOT NULL DEFAULT 0,
    actual_bank_received NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_received      NUMERIC(12,2) GENERATED ALWAYS AS (
        actual_momo_received + actual_cash_received + actual_bank_received
    ) STORED,
    variance            NUMERIC(12,2),                 -- expected - total_received

    -- Status
    is_balanced         BOOLEAN DEFAULT false,
    mismatch_reason     TEXT,                          -- required if not balanced
    escalated           BOOLEAN DEFAULT false,
    escalated_to        UUID REFERENCES users(id),

    reconciled_by       UUID NOT NULL REFERENCES users(id),
    verified_by         UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reconciliation_date ON daily_reconciliation(reconciliation_date);
CREATE INDEX idx_reconciliation_unbalanced ON daily_reconciliation(is_balanced)
    WHERE is_balanced = false;

-- ============================================================
-- TABLE: SUSU-COMPLIANCE ESCROW
-- Team-level compliance tracking with escrow payouts.
-- ============================================================
CREATE TABLE compliance_escrow (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     UUID NOT NULL REFERENCES users(id),
    team            VARCHAR(10) NOT NULL,
    week_start      DATE NOT NULL,
    week_end        DATE NOT NULL,

    -- Pay structure
    base_pay        NUMERIC(10,2) NOT NULL,
    escrow_amount   NUMERIC(10,2) NOT NULL,            -- held in compliance pool

    -- Violation tracking
    violation_count INTEGER DEFAULT 0,
    violation_details JSONB DEFAULT '[]'::jsonb,        -- array of violation records
    deduction_amount NUMERIC(10,2) DEFAULT 0,

    -- Payout
    escrow_released BOOLEAN DEFAULT false,
    released_amount NUMERIC(10,2),
    released_at     TIMESTAMPTZ,
    released_by     UUID REFERENCES users(id),

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT unique_employee_week UNIQUE (employee_id, week_start)
);

CREATE INDEX idx_escrow_team ON compliance_escrow(team);
CREATE INDEX idx_escrow_week ON compliance_escrow(week_start);
CREATE INDEX idx_escrow_unreleased ON compliance_escrow(escrow_released) WHERE escrow_released = false;
