"""
layer4_reconciliation.py — Tabs 29-32: Reconciliation engine + Fraud flags.
Auto-generated from input data. The audit brain of the system.
"""

from datetime import timedelta
from . import config as C
from .sample_data import DATA_START_DATE, NUM_DAYS
from .helpers import (
    create_excel_table, protect_sheet, freeze_panes,
    add_text_status_cf, add_traffic_light_cf, write_section_header,
)

TN = C.TABLE_NAMES
TAN = C.TAB_NAMES


def build_tab29_recon_eggs(wb):
    """Tab 29: Reconciliation — Eggs & Stock."""
    ws = wb.create_sheet(title=TAN[29])

    write_section_header(ws, 1, 1, "DAILY EGG RECONCILIATION", merge_end_col=12)

    headers = [
        "Date", "Opening Stock (eggs)", "Eggs Produced", "Eggs Sold",
        "Eggs Cracked/Damaged", "Other Adjustments", "Expected Closing",
        "Physical Stock", "Variance (eggs)", "Variance (crates)",
        "Explanation", "SC Sign-off"
    ]

    rows = []
    for day_offset in range(NUM_DAYS):
        current_date = DATA_START_DATE + timedelta(days=day_offset)
        rows.append([
            current_date,
            None, None, None, None, 0, None,  # Formulas
            None,  # Physical stock (entered on count days)
            None, None,  # Variance formulas
            "", "Yes"
        ])

    prod_tbl = TN[1]
    sales_tbl = TN[8]

    calculated = {
        1: 'IF(ROW()-ROW(INDIRECT("A3"))=0,0,INDIRECT("G"&(ROW()-1)))',  # Opening = prior day closing
        2: f'SUMIFS({prod_tbl}[Total Eggs],{prod_tbl}[Date],[@Date])',
        3: f'SUMIFS({sales_tbl}[Total Eggs],{sales_tbl}[Date/Time],">="&[@Date],{sales_tbl}[Date/Time],"<"&([@Date]+1))',
        4: f'SUMIFS({prod_tbl}[Grade: Cracked/Broken],{prod_tbl}[Date],[@Date])',
        6: '[@Opening Stock (eggs)]+[@Eggs Produced]-[@Eggs Sold]-[@Eggs Cracked/Damaged]-[@Other Adjustments]',
        8: 'IF([@Physical Stock]="","",[@Physical Stock]-[@Expected Closing])',
        9: 'IF([@Variance (eggs)]="","",[@Variance (eggs)]/30)',
    }

    tab, end_row = create_excel_table(
        ws, TN[29], headers, rows, start_row=3,
        col_widths=[12, 16, 12, 10, 16, 14, 14, 12, 12, 14, 25, 10],
        calculated_columns=calculated,
        number_formats={1: C.FMT_INTEGER, 2: C.FMT_INTEGER, 3: C.FMT_INTEGER,
                        4: C.FMT_INTEGER, 6: C.FMT_INTEGER, 8: C.FMT_INTEGER,
                        9: C.FMT_DECIMAL_1},
    )

    add_traffic_light_cf(ws, f"J4:J{end_row}",
                          green_op="between", green_val="-0.5",
                          yellow_op="between", yellow_val="-2",
                          red_op="lessThan", red_val="-2")

    freeze_panes(ws, "A4")
    protect_sheet(ws)
    return ws


def build_tab30_recon_cash(wb):
    """Tab 30: Reconciliation — Cash."""
    ws = wb.create_sheet(title=TAN[30])

    write_section_header(ws, 1, 1, "DAILY CASH RECONCILIATION", merge_end_col=11)

    headers = [
        "Date", "Total Sales Revenue", "MoMo Received", "Bank Transfer Received",
        "Cash Received", "Total Payments", "Daily Revenue Variance",
        "Outstanding Receivables", "Evidence Completeness %",
        "Cash Pending Deposit", "Status"
    ]

    rows = []
    for day_offset in range(NUM_DAYS):
        current_date = DATA_START_DATE + timedelta(days=day_offset)
        rows.append([current_date] + [None] * 10)

    sales = TN[8]

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

    tab, end_row = create_excel_table(
        ws, TN[30], headers, rows, start_row=3,
        col_widths=[12, 16, 14, 18, 12, 14, 18, 18, 18, 16, 10],
        calculated_columns=calculated,
        number_formats={1: C.FMT_CURRENCY, 2: C.FMT_CURRENCY, 3: C.FMT_CURRENCY,
                        4: C.FMT_CURRENCY, 5: C.FMT_CURRENCY, 6: C.FMT_CURRENCY,
                        7: C.FMT_CURRENCY, 8: C.FMT_PERCENT, 9: C.FMT_CURRENCY},
    )

    add_text_status_cf(ws, f"K4:K{end_row}")

    freeze_panes(ws, "A4")
    protect_sheet(ws)
    return ws


def build_tab31_recon_feed(wb):
    """Tab 31: Reconciliation — Feed & Ingredients."""
    ws = wb.create_sheet(title=TAN[31])

    write_section_header(ws, 1, 1, "FEED & INGREDIENT RECONCILIATION", merge_end_col=10)

    headers = [
        "Date", "Total Feed Consumed (kg)", "Expected Consumption (kg)",
        "Discrepancy (kg)", "Discrepancy (bags)", "Status",
    ]

    rows = []
    for day_offset in range(NUM_DAYS):
        current_date = DATA_START_DATE + timedelta(days=day_offset)
        rows.append([current_date] + [None] * 5)

    feed = TN[4]
    flock = TN[20]

    calculated = {
        1: f'SUMIFS({feed}[Net Consumed (kg)],{feed}[Date],[@Date])',
        2: f'SUMPRODUCT(({flock}[Current Bird Count])*({flock}[Status]="Active"))*118/1000',  # birds × 118g target
        3: '[@Total Feed Consumed (kg)]-[@Expected Consumption (kg)]',
        4: '[@Discrepancy (kg)]/50',
        5: 'IF(ABS([@Discrepancy (bags)])>0.5,"Yellow",IF(ABS([@Discrepancy (bags)])>1,"Red","Green"))',
    }

    tab, end_row = create_excel_table(
        ws, TN[31], headers, rows, start_row=3,
        col_widths=[12, 20, 20, 14, 16, 10],
        calculated_columns=calculated,
        number_formats={1: C.FMT_DECIMAL_1, 2: C.FMT_DECIMAL_1,
                        3: C.FMT_DECIMAL_1, 4: C.FMT_DECIMAL_2},
    )

    add_text_status_cf(ws, f"F4:F{end_row}")

    freeze_panes(ws, "A4")
    protect_sheet(ws)
    return ws


def build_tab32_fraud_flags(wb):
    """Tab 32: Fraud Flags — rules engine output aggregating all fraud signals."""
    ws = wb.create_sheet(title=TAN[32])

    write_section_header(ws, 1, 1, "FRAUD FLAGS — Auto-Generated from All Input Tabs", merge_end_col=10)

    headers = [
        "Flag #", "Flag Type", "Severity", "Description",
        "Source Tab", "Date Detected", "Required Action",
        "Status", "Resolved By", "Resolution Notes"
    ]

    # Pre-populate with the 17 fraud rule definitions as reference
    rules = [
        ("F1", "Duplicate Invoice/Receipt", "Red", "Invoice/Receipt ID appears more than once", "Sales / Procurement"),
        ("F2", "Paid Without Evidence", "Red", "Payment status = Paid AND Evidence ref blank", "Sales"),
        ("F3", "Price Deviation (Sales)", "Yellow", f"Unit price deviates >{C.THRESHOLDS['price_deviation_tolerance_pct']*100}% from default", "Sales"),
        ("F4", "Price Deviation (Procurement)", "Yellow", "Unit cost > benchmark × 1.15", "Procurement"),
        ("F5", "Sold Exceeds Available", "Red", "Eggs sold today > available stock", "Sales"),
        ("F6", "Unusual Breakage", "Yellow", "Cracked % > 2× the 14-day average", "Production"),
        ("F7", "Unapproved Procurement", "Red", f"Total > {C.THRESHOLDS['procurement_approval_threshold']} GHS AND not approved", "Procurement"),
        ("F8", "Cash Not Deposited", "Yellow", "Cash received > 24 hours without deposit", "Sales"),
        ("F9", "Unverified MoMo", "Red", "MoMo screenshot verified = No on paid transaction", "Sales"),
        ("F10", "Mortality Anomaly", "Yellow", "Sudden spike > 2× baseline (potential theft)", "Mortality"),
        ("F11", "Feed Shrinkage", "Yellow", "Feed consumed > expected + tolerance", "Feed Recon"),
        ("F12", "After-hours Access", "Red", "Camera timestamp at stores outside working hours", "Visitor Log"),
        ("F13", "Unauthorized Dispatch", "Red", "SC did not authorize dispatch", "Sales"),
        ("F14", "Credit Overrun", "Yellow", "Customer balance exceeds credit limit", "Sales/CRM"),
        ("F15", "Requester = Approver", "Red", "Same person requested and approved procurement", "Procurement"),
        ("F16", "Inventory Positive Variance", "Yellow", "Physical count consistently > expected", "Inventory Count"),
        ("F17", "Withdrawal Period Violation", "Red", "Eggs sold during active medication withdrawal", "Medication"),
    ]

    rows = []
    for rule in rules:
        rows.append([rule[0], rule[1], rule[2], rule[3], rule[4],
                      "", "Investigate and resolve", "Open", "", ""])

    tab, end_row = create_excel_table(
        ws, TN[32], headers, rows, start_row=3,
        col_widths=[8, 24, 10, 45, 16, 14, 20, 12, 12, 25],
    )

    add_text_status_cf(ws, f"C4:C{end_row}")
    add_inline_from = C.DROPDOWN_LISTS["fraud_status"]
    from .helpers import add_inline_dropdown
    add_inline_dropdown(ws, f"H4:H{end_row}", add_inline_from)

    freeze_panes(ws, "A4")
    protect_sheet(ws, unlocked_columns=[8, 9, 10], end_row=max(end_row, 100))
    return ws


def build_layer4(wb):
    build_tab29_recon_eggs(wb)
    build_tab30_recon_cash(wb)
    build_tab31_recon_feed(wb)
    build_tab32_fraud_flags(wb)
    print("  Layer 4: 4 reconciliation + fraud flag tabs created")
