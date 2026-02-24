"""
tab7_engine.py -- Tab 7: Engine sheet.
Merges old layer3_target_engine.py + layer4_reconciliation.py onto ONE sheet.
Sections: tblTargetResolver, tblReconEggs, tblReconCash, tblReconFeed, tblFraudFlags.
"""

from datetime import timedelta
from . import config as C
from .config import T
from .sample_data import DATA_START_DATE, NUM_DAYS
from .helpers import (
    create_excel_table, protect_sheet, freeze_panes,
    add_text_status_cf, add_traffic_light_cf, write_section_header,
    apply_header_formatting, add_inline_dropdown, set_col_widths,
)


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
# Section B: tblReconEggs
# ---------------------------------------------------------------------------

def _build_section_recon_eggs(ws, start_row):
    """Build the Egg Reconciliation table. Returns next free row."""

    write_section_header(ws, start_row, 1,
                         "DAILY EGG RECONCILIATION", merge_end_col=12)

    headers = [
        "Date", "Opening Stock (eggs)", "Eggs Produced", "Eggs Sold",
        "Eggs Cracked/Damaged", "Other Adjustments", "Expected Closing",
        "Physical Stock", "Variance (eggs)", "Variance (crates)",
        "Explanation", "SC Sign-off",
    ]

    rows = []
    for day_offset in range(NUM_DAYS):
        current_date = DATA_START_DATE + timedelta(days=day_offset)
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
# Section C: tblReconCash
# ---------------------------------------------------------------------------

def _build_section_recon_cash(ws, start_row):
    """Build the Cash Reconciliation table. Returns next free row."""

    write_section_header(ws, start_row, 1,
                         "DAILY CASH RECONCILIATION", merge_end_col=11)

    headers = [
        "Date", "Total Sales Revenue", "MoMo Received", "Bank Transfer Received",
        "Cash Received", "Total Payments", "Daily Revenue Variance",
        "Outstanding Receivables", "Evidence Completeness %",
        "Cash Pending Deposit", "Status",
    ]

    rows = []
    for day_offset in range(NUM_DAYS):
        current_date = DATA_START_DATE + timedelta(days=day_offset)
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
# Section D: tblReconFeed
# ---------------------------------------------------------------------------

def _build_section_recon_feed(ws, start_row):
    """Build the Feed Reconciliation table. Returns next free row."""

    write_section_header(ws, start_row, 1,
                         "FEED & INGREDIENT RECONCILIATION", merge_end_col=10)

    headers = [
        "Date", "Total Feed Consumed (kg)", "Expected Consumption (kg)",
        "Discrepancy (kg)", "Discrepancy (bags)", "Status",
    ]

    rows = []
    for day_offset in range(NUM_DAYS):
        current_date = DATA_START_DATE + timedelta(days=day_offset)
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
# Section E: tblFraudFlags
# ---------------------------------------------------------------------------

def _build_section_fraud_flags(ws, start_row):
    """Build the Fraud Flags reference/output table. Returns next free row."""

    write_section_header(ws, start_row, 1,
                         "FRAUD FLAGS -- Auto-Generated from All Input Tabs",
                         merge_end_col=10)

    headers = [
        "Flag #", "Flag Type", "Severity", "Description",
        "Source Tab", "Date Detected", "Required Action",
        "Status", "Resolved By", "Resolution Notes",
    ]

    # Pre-populate with the 17 fraud rule definitions as reference
    rules = [
        ("F1", "Duplicate Invoice/Receipt", "Red",
         "Invoice/Receipt ID appears more than once",
         "Sales / Procurement"),
        ("F2", "Paid Without Evidence", "Red",
         "Payment status = Paid AND Evidence ref blank",
         "Sales"),
        ("F3", "Price Deviation (Sales)", "Yellow",
         f"Unit price deviates >{C.THRESHOLDS['price_deviation_tolerance_pct'] * 100}% from default",
         "Sales"),
        ("F4", "Price Deviation (Procurement)", "Yellow",
         "Unit cost > benchmark x 1.15",
         "Procurement"),
        ("F5", "Sold Exceeds Available", "Red",
         "Eggs sold today > available stock",
         "Sales"),
        ("F6", "Unusual Breakage", "Yellow",
         "Cracked % > 2x the 14-day average",
         T("daily_cage_log")),
        ("F7", "Unapproved Procurement", "Red",
         f"Total > {C.THRESHOLDS['procurement_approval_threshold']} GHS AND not approved",
         "Procurement"),
        ("F8", "Cash Not Deposited", "Yellow",
         "Cash received > 24 hours without deposit",
         "Sales"),
        ("F9", "Unverified MoMo", "Red",
         "MoMo screenshot verified = No on paid transaction",
         "Sales"),
        ("F10", "Mortality Anomaly", "Yellow",
         "Sudden spike > 2x baseline (potential theft)",
         T("daily_cage_log")),
        ("F11", "Feed Shrinkage", "Yellow",
         "Feed consumed > expected + tolerance",
         "Feed Recon"),
        ("F12", "After-hours Access", "Red",
         "Camera timestamp at stores outside working hours",
         "Visitor Log"),
        ("F13", "Unauthorized Dispatch", "Red",
         "SC did not authorize dispatch",
         "Sales"),
        ("F14", "Credit Overrun", "Yellow",
         "Customer balance exceeds credit limit",
         "Sales/CRM"),
        ("F15", "Requester = Approver", "Red",
         "Same person requested and approved procurement",
         "Procurement"),
        ("F16", "Inventory Positive Variance", "Yellow",
         "Physical count consistently > expected",
         "Inventory Count"),
        ("F17", "Withdrawal Period Violation", "Red",
         "Eggs sold during active medication withdrawal",
         "Medication"),
    ]

    rows = []
    for rule in rules:
        rows.append([
            rule[0], rule[1], rule[2], rule[3], rule[4],
            "", "Investigate and resolve", "Open", "", "",
        ])

    table_start = start_row + 2
    tab, end_row = create_excel_table(
        ws, T("fraud_flags"), headers, rows, start_row=table_start,
        col_widths=[8, 24, 10, 45, 16, 14, 20, 12, 12, 25],
    )

    add_text_status_cf(ws, f"C{table_start + 1}:C{end_row}")
    add_inline_dropdown(ws, f"H{table_start + 1}:H{end_row}",
                        C.DROPDOWN_LISTS["fraud_status"])

    return end_row + 2  # next free row


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------

def build_tab7_engine(wb):
    """Build Tab 7: Engine -- Target Resolver + Reconciliation + Fraud Flags."""
    ws = wb.create_sheet(title=C.TAB_NAMES[8])

    row = 1

    # Section A: Target Resolver
    row = _build_section_target_resolver(ws, row)

    # Section B: Egg Reconciliation
    row = _build_section_recon_eggs(ws, row)

    # Section C: Cash Reconciliation
    row = _build_section_recon_cash(ws, row)

    # Section D: Feed Reconciliation
    row = _build_section_recon_feed(ws, row)

    # Section E: Fraud Flags
    _build_section_fraud_flags(ws, row)

    freeze_panes(ws, "A2")
    protect_sheet(ws, unlocked_columns=[8, 9, 10], end_row=1000)

    print("  Tab 7 (Engine): Target Resolver + Reconciliation + Fraud Flags created")
    return ws
