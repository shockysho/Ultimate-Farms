"""
tab7_engine.py -- Tab 7: Engine sheet (v3.0 Verification Core).
8 sections: Target Resolver, Egg/Cash/Feed/Mortality/Inventory Recon,
Ghost Money tracker, and 41 Fraud Flags.
"""

from datetime import timedelta
from . import config as C
from .config import T
from .helpers import (
    create_excel_table, protect_sheet, freeze_panes,
    add_text_status_cf, add_traffic_light_cf, write_section_header,
    apply_header_formatting, add_inline_dropdown, set_col_widths,
)


def _lookback_dates():
    """Return (start_date, num_rows) for lookback-limited recon tables."""
    lookback = min(C.NUM_DAYS, C.RECON_LOOKBACK_DAYS)
    start_date = C.DATA_END_DATE - timedelta(days=lookback - 1)
    return start_date, lookback


# ---------------------------------------------------------------------------
# Section A: tblTargetResolver
# ---------------------------------------------------------------------------

def _build_section_target_resolver(ws, start_row):
    """Build the Target Resolver table starting at start_row. Returns next free row."""

    write_section_header(ws, start_row, 1,
                         "LIVE TARGET RESOLVER -- Phase-Adjusted Performance Targets",
                         merge_end_col=16)

    headers = [
        "Cohort ID", "Breed", "Current Age (wks)", "Production Phase",
        # Lay %
        "Breeder Target: Lay %", "Override: Lay %", "Effective Target: Lay %",
        "Yellow Threshold: Lay %", "Red Threshold: Lay %",
        # FCR
        "Breeder Target: FCR", "Effective Target: FCR",
        "Yellow Threshold: FCR", "Red Threshold: FCR",
        # Feed intake
        "Effective Target: Feed (g/bird)", "Effective Target: Mortality (%/mo)",
        # Overall
        "Status",
    ]

    # One row per flock
    rows = []
    for f in C.FLOCK_DATA:
        rows.append([
            f[0], f[1],
            None, None,   # Age + Phase = formulas
            None, None, None, None, None,  # Lay targets = formulas
            None, None, None, None,         # FCR = formulas
            None, None,                     # Feed + Mortality = formulas
            None,                           # Status = formula
        ])

    bc = T("breeder_curves")
    ov = T("owner_overrides")
    flock_tbl = T("flock")

    calculated = {
        # Current age (weeks)
        2: f'IFERROR(INDEX({flock_tbl}[Current Age (weeks)],MATCH([@Cohort ID],{flock_tbl}[Cohort ID],0)),0)',
        # Phase
        3: 'IF([@Current Age (wks)]<25,"Ramp-up",IF([@Current Age (wks)]<=45,"Peak",IF([@Current Age (wks)]<=60,"Post-peak","Late-lay")))',
        # Breeder target lay %
        4: f'IFERROR(INDEX({bc}[Expected Lay %],MATCH([@Current Age (wks)],{bc}[Week],1)),0)',
        # Override lay % (check if override exists)
        5: f'IFERROR(INDEX({ov}[Override Target],MATCH("Lay %",{ov}[Metric],0)),"")',
        # Effective target lay %
        6: 'IF(ISNUMBER([@Override: Lay %]),[@Override: Lay %],[@Breeder Target: Lay %])',
        # Yellow threshold lay % (phase-dependent)
        7: 'IF([@Production Phase]="Peak",0.88,IF([@Production Phase]="Ramp-up",[@Effective Target: Lay %]-0.07,[@Effective Target: Lay %]-0.05))',
        # Red threshold lay %
        8: 'IF([@Production Phase]="Peak",0.85,IF([@Production Phase]="Ramp-up",[@Effective Target: Lay %]-0.10,[@Effective Target: Lay %]-0.07))',
        # Breeder target FCR
        9: f'IFERROR(INDEX({bc}[Expected FCR (kg/dozen)],MATCH([@Current Age (wks)],{bc}[Week],1)),0)',
        # Effective FCR
        10: '[@Breeder Target: FCR]',
        # Yellow FCR
        11: 'IF([@Production Phase]="Peak",2.2,[@Effective Target: FCR]+0.2)',
        # Red FCR
        12: 'IF([@Production Phase]="Peak",2.5,[@Effective Target: FCR]+0.3)',
        # Feed intake target
        13: f'IFERROR(INDEX({bc}[Expected Feed Intake (g/bird/day)],MATCH([@Current Age (wks)],{bc}[Week],1)),118)',
        # Mortality target
        14: f'IFERROR(INDEX({bc}[Mortality Band (% monthly)],MATCH([@Current Age (wks)],{bc}[Week],1)),0.003)',
        # Overall status
        15: '"Active"',
    }

    table_start = start_row + 2
    tab, end_row = create_excel_table(
        ws, T("target_resolver"), headers, rows, start_row=table_start,
        col_widths=[12, 22, 14, 14, 16, 14, 16, 16, 14, 14, 14, 14, 14, 20, 20, 10],
        calculated_columns=calculated,
        number_formats={
            4: C.FMT_PERCENT, 5: C.FMT_PERCENT, 6: C.FMT_PERCENT,
            7: C.FMT_PERCENT, 8: C.FMT_PERCENT,
            9: C.FMT_DECIMAL_2, 10: C.FMT_DECIMAL_2, 11: C.FMT_DECIMAL_2, 12: C.FMT_DECIMAL_2,
            13: C.FMT_DECIMAL_1, 14: C.FMT_PERCENT,
        },
    )

    # Phase-dependent threshold reference table (static rows, not a formal table)
    ref_start = end_row + 3
    write_section_header(ws, ref_start, 1,
                         "Phase-Dependent Threshold Reference (from UFOS 4.3 Layer 6)",
                         merge_end_col=6)

    ref_headers = [
        "KPI", "Ramp-up (18-24 wks)", "Peak (25-45 wks)",
        "Post-peak (46-60 wks)", "Late-lay (61+ wks)",
    ]
    ref_rows = [
        ["Lay Rate Yellow", "5-7% below curve (2d)", "<88% (2d)",
         "3-5% below age (2d)", "5-7% below age (2d)"],
        ["Lay Rate Red", ">7% below (2d)", "<85% (2d) OR >3% drop/day",
         ">3% drop/day", ">5% drop/day"],
        ["FCR Yellow", "0.2 above (3d)", ">2.2 (3d)",
         "0.2 above (3d)", "0.3 above (3d)"],
        ["FCR Red", "0.3 above (3d)", ">2.5 (3d) OR >0.1 jump",
         ">0.1 jump", ">0.15 jump"],
        ["Mortality Yellow", ">0.04%/day (2d)", ">0.05%/day (2d)",
         ">0.06%/day (2d)", ">0.08%/day (2d)"],
        ["Mortality Red", ">0.06%/day", ">0.05%+cluster",
         ">0.08% OR 2x spike", ">0.1% OR 2x spike"],
        ["Cracked % Yellow", ">5% (2d)", ">5% (2d)",
         ">6% (2d)", ">7% (2d)"],
        ["Large % Yellow", "N/A", "<60% (3d)",
         "<55% (3d)", "<50% (3d)"],
        ["ABSOLUTE TRIGGER",
         "Disease mortality >5 birds/day = IMMEDIATE RED at any phase", "", "", ""],
    ]

    r = ref_start + 1
    for ci, h in enumerate(ref_headers):
        ws.cell(row=r, column=ci + 1, value=h)
    apply_header_formatting(ws, r, 1, len(ref_headers))
    for ri, row_data in enumerate(ref_rows):
        for ci, val in enumerate(row_data):
            ws.cell(row=r + 1 + ri, column=ci + 1, value=val)

    return r + 1 + len(ref_rows) + 1  # next free row


# ---------------------------------------------------------------------------
# Section B: tblReconEggs  (lookback-limited)
# ---------------------------------------------------------------------------

def _build_section_recon_eggs(ws, start_row):
    """Build the Egg Reconciliation table (lookback-limited). Returns next free row."""

    write_section_header(ws, start_row, 1,
                         "DAILY EGG RECONCILIATION", merge_end_col=12)

    headers = [
        "Date", "Opening Stock (eggs)", "Eggs Produced", "Eggs Sold",
        "Eggs Cracked/Damaged", "Other Adjustments", "Expected Closing",
        "Physical Stock", "Variance (eggs)", "Variance (crates)",
        "Explanation", "SC Sign-off",
    ]

    lb_start, lb_rows = _lookback_dates()
    rows = []
    for day_offset in range(lb_rows):
        current_date = lb_start + timedelta(days=day_offset)
        rows.append([
            current_date,
            None, None, None, None, 0, None,  # Formulas
            None,  # Physical stock (entered on count days)
            None, None,  # Variance formulas
            "", "Yes",
        ])

    prod_tbl = T("daily_cage_log")
    sales_tbl = T("sales")

    table_start = start_row + 2
    first_data_row = table_start + 1  # row after header

    calculated = {
        1: f'IF(ROW()={first_data_row},0,INDIRECT("G"&(ROW()-1)))',  # Opening = prior day closing; first row = 0
        2: f'SUMIFS({prod_tbl}[Total Eggs],{prod_tbl}[Date],[@Date])',
        3: f'SUMIFS({sales_tbl}[Total Eggs],{sales_tbl}[Date/Time],">="&[@Date],{sales_tbl}[Date/Time],"<"&([@Date]+1))',
        4: f'SUMIFS({prod_tbl}[Grade: Cracked/Broken],{prod_tbl}[Date],[@Date])',
        6: '[@Opening Stock (eggs)]+[@Eggs Produced]-[@Eggs Sold]-[@Eggs Cracked/Damaged]-[@Other Adjustments]',
        8: 'IF([@Physical Stock]="","",[@Physical Stock]-[@Expected Closing])',
        9: 'IF([@Variance (eggs)]="","",[@Variance (eggs)]/30)',
    }

    tab, end_row = create_excel_table(
        ws, T("recon_eggs"), headers, rows, start_row=table_start,
        col_widths=[12, 16, 12, 10, 16, 14, 14, 12, 12, 14, 25, 10],
        calculated_columns=calculated,
        number_formats={
            1: C.FMT_INTEGER, 2: C.FMT_INTEGER, 3: C.FMT_INTEGER,
            4: C.FMT_INTEGER, 6: C.FMT_INTEGER, 8: C.FMT_INTEGER,
            9: C.FMT_DECIMAL_1,
        },
    )

    add_traffic_light_cf(ws, f"J{table_start + 1}:J{end_row}",
                         green_op="between", green_val="-0.5",
                         yellow_op="between", yellow_val="-2",
                         red_op="lessThan", red_val="-2")

    return end_row + 2  # next free row


# ---------------------------------------------------------------------------
# Section C: tblReconCash  (lookback-limited)
# ---------------------------------------------------------------------------

def _build_section_recon_cash(ws, start_row):
    """Build the Cash Reconciliation table (lookback-limited). Returns next free row."""

    write_section_header(ws, start_row, 1,
                         "DAILY CASH RECONCILIATION", merge_end_col=11)

    headers = [
        "Date", "Total Sales Revenue", "MoMo Received", "Bank Transfer Received",
        "Cash Received", "Total Payments", "Daily Revenue Variance",
        "Outstanding Receivables", "Evidence Completeness %",
        "Cash Pending Deposit", "Status",
    ]

    lb_start, lb_rows = _lookback_dates()
    rows = []
    for day_offset in range(lb_rows):
        current_date = lb_start + timedelta(days=day_offset)
        rows.append([current_date] + [None] * 10)

    sales = T("sales")

    calculated = {
        1: f'SUMIFS({sales}[Line Total (GHS)],{sales}[Date/Time],">="&[@Date],{sales}[Date/Time],"<"&([@Date]+1))',
        2: f'SUMIFS({sales}[Line Total (GHS)],{sales}[Date/Time],">="&[@Date],{sales}[Date/Time],"<"&([@Date]+1),{sales}[Payment Method],"MoMo",{sales}[Payment Status],"Paid")',
        3: f'SUMIFS({sales}[Line Total (GHS)],{sales}[Date/Time],">="&[@Date],{sales}[Date/Time],"<"&([@Date]+1),{sales}[Payment Method],"Bank Transfer",{sales}[Payment Status],"Paid")',
        4: f'SUMIFS({sales}[Line Total (GHS)],{sales}[Date/Time],">="&[@Date],{sales}[Date/Time],"<"&([@Date]+1),{sales}[Payment Method],"Cash",{sales}[Payment Status],"Paid")',
        5: '[@MoMo Received]+[@Bank Transfer Received]+[@Cash Received]',
        6: '[@Total Sales Revenue]-[@Total Payments]',
        7: f'SUMIFS({sales}[Line Total (GHS)],{sales}[Payment Status],"Unpaid")+SUMIFS({sales}[Line Total (GHS)],{sales}[Payment Status],"Part-Paid")',
        8: f'IF(COUNTIFS({sales}[Date/Time],">="&[@Date],{sales}[Date/Time],"<"&([@Date]+1),{sales}[Payment Status],"Paid")=0,0,COUNTIFS({sales}[Date/Time],">="&[@Date],{sales}[Date/Time],"<"&([@Date]+1),{sales}[Payment Status],"Paid",{sales}[Evidence Ref],"<>"&"")/COUNTIFS({sales}[Date/Time],">="&[@Date],{sales}[Date/Time],"<"&([@Date]+1),{sales}[Payment Status],"Paid"))',
        9: '[@Cash Received]',
        10: 'IF(ABS([@Daily Revenue Variance])>500,"Red",IF(ABS([@Daily Revenue Variance])>0,"Yellow","Green"))',
    }

    table_start = start_row + 2
    tab, end_row = create_excel_table(
        ws, T("recon_cash"), headers, rows, start_row=table_start,
        col_widths=[12, 16, 14, 18, 12, 14, 18, 18, 18, 16, 10],
        calculated_columns=calculated,
        number_formats={
            1: C.FMT_CURRENCY, 2: C.FMT_CURRENCY, 3: C.FMT_CURRENCY,
            4: C.FMT_CURRENCY, 5: C.FMT_CURRENCY, 6: C.FMT_CURRENCY,
            7: C.FMT_CURRENCY, 8: C.FMT_PERCENT, 9: C.FMT_CURRENCY,
        },
    )

    add_text_status_cf(ws, f"K{table_start + 1}:K{end_row}")

    return end_row + 2  # next free row


# ---------------------------------------------------------------------------
# Section D: tblReconFeed  (lookback-limited)
# ---------------------------------------------------------------------------

def _build_section_recon_feed(ws, start_row):
    """Build the Feed Reconciliation table (lookback-limited). Returns next free row."""

    write_section_header(ws, start_row, 1,
                         "FEED & INGREDIENT RECONCILIATION", merge_end_col=10)

    headers = [
        "Date", "Total Feed Consumed (kg)", "Expected Consumption (kg)",
        "Discrepancy (kg)", "Discrepancy (bags)", "Status",
    ]

    lb_start, lb_rows = _lookback_dates()
    rows = []
    for day_offset in range(lb_rows):
        current_date = lb_start + timedelta(days=day_offset)
        rows.append([current_date] + [None] * 5)

    feed = T("feed_consumption")
    flock = T("flock")

    calculated = {
        1: f'SUMIFS({feed}[Net Consumed (kg)],{feed}[Date],[@Date])',
        2: f'SUMPRODUCT(({flock}[Current Bird Count])*({flock}[Status]="Active"))*118/1000',  # birds x 118g target
        3: '[@Total Feed Consumed (kg)]-[@Expected Consumption (kg)]',
        4: '[@Discrepancy (kg)]/50',
        5: 'IF(ABS([@Discrepancy (bags)])>0.5,"Yellow",IF(ABS([@Discrepancy (bags)])>1,"Red","Green"))',
    }

    table_start = start_row + 2
    tab, end_row = create_excel_table(
        ws, T("recon_feed"), headers, rows, start_row=table_start,
        col_widths=[12, 20, 20, 14, 16, 10],
        calculated_columns=calculated,
        number_formats={
            1: C.FMT_DECIMAL_1, 2: C.FMT_DECIMAL_1,
            3: C.FMT_DECIMAL_1, 4: C.FMT_DECIMAL_2,
        },
    )

    add_text_status_cf(ws, f"F{table_start + 1}:F{end_row}")

    return end_row + 2  # next free row


# ---------------------------------------------------------------------------
# Section E: tblReconMortality  (NEW -- Bible Part 3 Engine 4)
# ---------------------------------------------------------------------------

def _build_section_recon_mortality(ws, start_row):
    """Build Mortality / Flock Reconciliation table. Returns next free row."""

    write_section_header(ws, start_row, 1,
                         "MORTALITY & FLOCK RECONCILIATION", merge_end_col=12)

    headers = [
        "Date",
        "Opening Flock",
        "Deaths Today",
        "Culls Today",
        "Live Sales",
        "Expected Closing",
        "Mortality Rate (%/day)",
        "Breeder Target (%/day)",
        "Variance",
        "Zero-Mortality Streak",
        "Bio Improbability Flag",
        "Status",
    ]

    lb_start, lb_rows = _lookback_dates()
    rows = []
    for day_offset in range(lb_rows):
        current_date = lb_start + timedelta(days=day_offset)
        rows.append([current_date] + [None] * 11)

    cage_log = T("daily_cage_log")
    flock = T("flock")
    bc = T("breeder_curves")
    zero_flag = C.THRESHOLDS["mortality_zero_days_flag"]

    table_start = start_row + 2
    first_data_row = table_start + 1

    calculated = {
        # Opening flock: first row = SUM of active bird counts; subsequent = prior Expected Closing
        1: f'IF(ROW()={first_data_row},'
           f'SUMPRODUCT(({flock}[Current Bird Count])*({flock}[Status]="Active")),'
           f'INDIRECT("F"&(ROW()-1)))',
        # Deaths today
        2: f'SUMIFS({cage_log}[Deaths],{cage_log}[Date],[@Date])',
        # Culls today (deaths where cause = Culled)
        3: f'SUMIFS({cage_log}[Deaths],{cage_log}[Date],[@Date],{cage_log}[Death Cause],"Culled")',
        # Live sales (placeholder -- 0 for now)
        4: '0',
        # Expected closing
        5: '[@Opening Flock]-[@Deaths Today]-[@Culls Today]-[@Live Sales]',
        # Mortality rate (%/day)
        6: 'IF([@Opening Flock]=0,0,[@Deaths Today]/[@Opening Flock])',
        # Breeder target (%/day) -- monthly rate / 30
        7: f'IFERROR(INDEX({bc}[Mortality Band (% monthly)],'
           f'MATCH(INT(([@Date]-MIN({flock}[Placement Date]))/7)+18,'
           f'{bc}[Week],1)),0.003)/30',
        # Variance (actual - target; positive = worse than expected)
        8: '[@Mortality Rate (%/day)]-[@Breeder Target (%/day)]',
        # Zero-mortality streak: running count of consecutive zero-death days
        9: f'IF([@Deaths Today]>0,0,'
           f'IF(ROW()={first_data_row},IF([@Deaths Today]=0,1,0),'
           f'INDIRECT("J"&(ROW()-1))+1))',
        # Bio improbability flag
        10: f'IF(AND([@Zero-Mortality Streak]>={zero_flag},'
            f'[@Opening Flock]>2000),"FLAG","")',
        # Status
        11: 'IF([@Bio Improbability Flag]="FLAG","Red",'
            'IF([@Variance]>0.0002,"Yellow","Green"))',
    }

    tab, end_row = create_excel_table(
        ws, T("recon_mortality"), headers, rows, start_row=table_start,
        col_widths=[12, 14, 12, 10, 10, 14, 16, 16, 12, 18, 18, 10],
        calculated_columns=calculated,
        number_formats={
            1: C.FMT_INTEGER, 2: C.FMT_INTEGER, 3: C.FMT_INTEGER,
            4: C.FMT_INTEGER, 5: C.FMT_INTEGER,
            6: C.FMT_PERCENT_2, 7: C.FMT_PERCENT_2, 8: C.FMT_PERCENT_2,
            9: C.FMT_INTEGER,
        },
    )

    add_text_status_cf(ws, f"L{table_start + 1}:L{end_row}")

    return end_row + 2


# ---------------------------------------------------------------------------
# Section F: tblReconInventory  (NEW -- Bible Part 3 Engine 5)
# ---------------------------------------------------------------------------

def _build_section_recon_inventory(ws, start_row):
    """Build Inventory Reconciliation table. Returns next free row."""

    write_section_header(ws, start_row, 1,
                         "INVENTORY RECONCILIATION (Cycle Count)", merge_end_col=12)

    headers = [
        "Count Date",
        "Item ID",
        "Item Name",
        "Category",
        "Expected Qty",
        "Counted Qty",
        "Variance",
        "Variance %",
        "Reason Code",
        "Investigation Notes",
        "Resolved By",
        "Status",
    ]

    inv_count = T("inventory_count")

    # Build 10 placeholder rows (populated by cycle counts, not daily)
    rows = []
    for _ in range(10):
        rows.append([None] * 12)

    var_yel = C.THRESHOLDS["inventory_variance_yellow_pct"]
    var_red = C.THRESHOLDS["inventory_variance_red_pct"]

    calculated = {
        # Variance
        6: 'IF(OR([@Counted Qty]="",[@Expected Qty]=""),"",[@Counted Qty]-[@Expected Qty])',
        # Variance %
        7: 'IF(OR([@Expected Qty]="",[@Expected Qty]=0),"",[@Variance]/[@Expected Qty])',
        # Status
        11: f'IF([@Variance %]="","",IF(ABS([@Variance %])>{var_red},"Red",IF(ABS([@Variance %])>{var_yel},"Yellow","Green")))',
    }

    table_start = start_row + 2
    tab, end_row = create_excel_table(
        ws, T("recon_inventory"), headers, rows, start_row=table_start,
        col_widths=[12, 10, 22, 14, 12, 12, 10, 12, 16, 25, 12, 10],
        calculated_columns=calculated,
        number_formats={
            4: C.FMT_DECIMAL_1, 5: C.FMT_DECIMAL_1,
            6: C.FMT_DECIMAL_1, 7: C.FMT_PERCENT,
        },
    )

    add_text_status_cf(ws, f"L{table_start + 1}:L{end_row}")
    add_inline_dropdown(ws, f"I{table_start + 1}:I{end_row}",
                        C.DROPDOWN_LISTS["inventory_reason_code"])

    return end_row + 2


# ---------------------------------------------------------------------------
# Section G: tblGhostMoney  (NEW -- Bible Part 2 §2.6)
# ---------------------------------------------------------------------------

def _build_section_ghost_money(ws, start_row):
    """Build Ghost Money tracker table. Returns next free row."""

    write_section_header(ws, start_row, 1,
                         "GHOST MONEY TRACKER -- Where Money Disappears (GHS)",
                         merge_end_col=12)

    headers = [
        "Date",
        "Feed Shrinkage (GHS)",
        "Mortality Over-Target (GHS)",
        "Egg Variance Loss (GHS)",
        "Cracked/Damaged (GHS)",
        "Price Arbitrage Missed (GHS)",
        "Cash Discrepancy (GHS)",
        "Inventory Carrying (GHS)",
        "Daily Ghost Money (GHS)",
        "Cumulative Ghost Money (GHS)",
        "Status",
        "Notes",
    ]

    lb_start, lb_rows = _lookback_dates()
    rows = []
    for day_offset in range(lb_rows):
        current_date = lb_start + timedelta(days=day_offset)
        rows.append([current_date] + [None] * 11)

    recon_feed = T("recon_feed")
    recon_mort = T("recon_mortality")
    recon_eggs = T("recon_eggs")
    recon_cash = T("recon_cash")
    cage_log = T("daily_cage_log")

    # Average feed cost per kg (weighted average of maize-dominated mix ~6.5 GHS/kg)
    avg_feed_cost = 6.5
    # Bird replacement cost
    bird_cost = 55
    # Avg crate price
    avg_crate = C.PRICES["egg_crate_default"]
    # Ghost money thresholds
    gm_yel = C.THRESHOLDS["ghost_money_daily_yellow"]
    gm_red = C.THRESHOLDS["ghost_money_daily_red"]

    table_start = start_row + 2
    first_data_row = table_start + 1

    calculated = {
        # Feed shrinkage loss: positive discrepancy × feed cost/kg
        1: f'IFERROR(MAX(0,INDEX({recon_feed}[Discrepancy (kg)],MATCH([@Date],{recon_feed}[Date],0)))*{avg_feed_cost},0)',
        # Mortality over-target: excess deaths × bird replacement cost
        2: f'IFERROR(MAX(0,INDEX({recon_mort}[Variance],MATCH([@Date],{recon_mort}[Date],0)))*'
           f'INDEX({recon_mort}[Opening Flock],MATCH([@Date],{recon_mort}[Date],0))*{bird_cost},0)',
        # Egg variance loss: missing eggs (negative variance) × crate price / 30
        3: f'IFERROR(MAX(0,-INDEX({recon_eggs}[Variance (crates)],MATCH([@Date],{recon_eggs}[Date],0)))*{avg_crate},0)',
        # Cracked/damaged loss: cracked above 2.5% baseline × crate price
        4: f'IFERROR(MAX(0,SUMIFS({cage_log}[Grade: Cracked/Broken],{cage_log}[Date],[@Date])-'
           f'SUMIFS({cage_log}[Total Eggs],{cage_log}[Date],[@Date])*0.025)*{avg_crate}/30,0)',
        # Price arbitrage missed (placeholder -- 0)
        5: '0',
        # Cash discrepancy
        6: f'IFERROR(ABS(INDEX({recon_cash}[Daily Revenue Variance],MATCH([@Date],{recon_cash}[Date],0))),0)',
        # Inventory carrying cost (placeholder -- 0)
        7: '0',
        # Daily ghost money: sum of components
        8: 'SUM([@Feed Shrinkage (GHS)]:[@Inventory Carrying (GHS)])',
        # Cumulative: running total
        9: f'IF(ROW()={first_data_row},[@Daily Ghost Money (GHS)],'
           f'INDIRECT("J"&(ROW()-1))+[@Daily Ghost Money (GHS)])',
        # Status
        10: f'IF([@Daily Ghost Money (GHS)]>{gm_red},"Red",'
            f'IF([@Daily Ghost Money (GHS)]>{gm_yel},"Yellow","Green"))',
    }

    tab, end_row = create_excel_table(
        ws, T("ghost_money"), headers, rows, start_row=table_start,
        col_widths=[12, 18, 20, 18, 18, 20, 18, 18, 20, 22, 10, 25],
        calculated_columns=calculated,
        number_formats={
            1: C.FMT_CURRENCY, 2: C.FMT_CURRENCY, 3: C.FMT_CURRENCY,
            4: C.FMT_CURRENCY, 5: C.FMT_CURRENCY, 6: C.FMT_CURRENCY,
            7: C.FMT_CURRENCY, 8: C.FMT_CURRENCY, 9: C.FMT_CURRENCY,
        },
    )

    add_text_status_cf(ws, f"K{table_start + 1}:K{end_row}")

    return end_row + 2


# ---------------------------------------------------------------------------
# Section H: tblFraudFlags  (expanded 17 → 41)
# ---------------------------------------------------------------------------

def _build_section_fraud_flags(ws, start_row):
    """Build the Fraud Flags table (41 flags from Bible). Returns next free row."""

    write_section_header(ws, start_row, 1,
                         f"FRAUD FLAGS ({len(C.FRAUD_FLAGS)} Rules) -- Auto-Generated from All Input Tabs",
                         merge_end_col=11)

    headers = [
        "Flag #", "Flag Type", "Detection Type", "Severity", "Description",
        "Source Tab", "Date Detected", "Required Action",
        "Status", "Resolved By", "Resolution Notes",
    ]

    rows = []
    for flag in C.FRAUD_FLAGS:
        # flag = (flag_id, name, severity, fraud_type, description, source_tab)
        rows.append([
            flag[0],        # Flag #
            flag[1],        # Flag Type (name)
            flag[3],        # Detection Type (fraud_type: Type A/B/C/D/E/Cross)
            flag[2],        # Severity
            flag[4],        # Description
            flag[5],        # Source Tab
            "",             # Date Detected
            "Investigate and resolve",  # Required Action
            "Open",         # Status
            "",             # Resolved By
            "",             # Resolution Notes
        ])

    table_start = start_row + 2
    tab, end_row = create_excel_table(
        ws, T("fraud_flags"), headers, rows, start_row=table_start,
        col_widths=[8, 28, 12, 10, 48, 18, 14, 22, 12, 12, 25],
    )

    add_text_status_cf(ws, f"D{table_start + 1}:D{end_row}")
    add_inline_dropdown(ws, f"I{table_start + 1}:I{end_row}",
                        C.DROPDOWN_LISTS["fraud_status"])
    add_inline_dropdown(ws, f"C{table_start + 1}:C{end_row}",
                        C.DROPDOWN_LISTS["fraud_type"])

    return end_row + 2  # next free row


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------

def build_tab7_engine(wb):
    """Build Tab 7: Engine -- Target Resolver + 5 Reconciliation Engines + Ghost Money + 41 Fraud Flags."""
    ws = wb.create_sheet(title=C.TAB_NAMES[8])

    row = 1

    # Section A: Target Resolver (phase-adjusted)
    row = _build_section_target_resolver(ws, row)

    # Section B: Egg Reconciliation (lookback-limited)
    row = _build_section_recon_eggs(ws, row)

    # Section C: Cash Reconciliation (lookback-limited)
    row = _build_section_recon_cash(ws, row)

    # Section D: Feed Reconciliation (lookback-limited)
    row = _build_section_recon_feed(ws, row)

    # Section E: Mortality & Flock Reconciliation (NEW)
    row = _build_section_recon_mortality(ws, row)

    # Section F: Inventory Reconciliation (NEW)
    row = _build_section_recon_inventory(ws, row)

    # Section G: Ghost Money Tracker (NEW)
    row = _build_section_ghost_money(ws, row)

    # Section H: Fraud Flags (expanded 17 → 41)
    _build_section_fraud_flags(ws, row)

    freeze_panes(ws, "A2")
    protect_sheet(ws, unlocked_columns=[8, 9, 10, 11], end_row=2000)

    print("  Tab 7 (Engine): Target Resolver + 5 Recon Engines + Ghost Money + 41 Fraud Flags created")
    return ws
