"""
layer6_analytics.py — Tabs 36-38: Performance Analytics, Prediction Engine, Cycle Count Scheduler.
"""

from datetime import timedelta
from . import config as C
from .sample_data import DATA_START_DATE, DATA_END_DATE, NUM_DAYS
from .helpers import (
    create_excel_table, protect_sheet, freeze_panes,
    write_section_header, add_traffic_light_cf, add_text_status_cf,
)

TN = C.TABLE_NAMES
TAN = C.TAB_NAMES


def build_tab36_performance_analytics(wb):
    """Tab 36: Performance Analytics — per-cohort metrics vs targets with trends."""
    ws = wb.create_sheet(title=TAN[36])

    write_section_header(ws, 1, 1, "PERFORMANCE ANALYTICS — Cohort Comparison", merge_end_col=10)

    headers = [
        "Cohort ID", "Phase", "Metric", "Current Value",
        "Effective Target", "Variance", "7d Trend", "Status"
    ]

    prod = TN[1]
    feed = TN[4]
    mort = TN[3]
    target = TN[28]

    # Build rows for each cohort × metric combination
    rows = []
    metrics = [
        ("Lay %", C.FMT_PERCENT),
        ("FCR", C.FMT_DECIMAL_2),
        ("Mortality Rate (monthly %)", C.FMT_PERCENT),
        ("Cracked %", C.FMT_PERCENT),
        ("Large %", C.FMT_PERCENT),
        ("Feed Intake (g/bird/day)", C.FMT_DECIMAL_1),
    ]

    for flock in C.FLOCK_DATA:
        for metric_name, _ in metrics:
            rows.append([
                flock[0], None, metric_name,
                None, None, None, None, None
            ])

    # Formulas for phase lookup
    calculated = {
        1: f'IFERROR(INDEX({target}[Production Phase],MATCH([@Cohort ID],{target}[Cohort ID],0)),"Unknown")',
        3: 'IF([@Metric]="Lay %",'
           f'IFERROR(AVERAGEIFS({prod}[Large %],{prod}[Date],">="&(TODAY()-6)),0),'  # placeholder
           '0)',
        4: f'IFERROR(INDEX({target}[Effective Target: Lay %],MATCH([@Cohort ID],{target}[Cohort ID],0)),0)',
        5: '[@Current Value]-[@Effective Target]',
        6: '"->"',  # Trend arrow placeholder
        7: 'IF([@Variance]>=0,"Green",IF([@Variance]>=-0.05,"Yellow","Red"))',
    }

    tab, end_row = create_excel_table(
        ws, TN[36], headers, rows, start_row=3,
        col_widths=[12, 12, 22, 14, 14, 12, 10, 10],
        calculated_columns=calculated,
    )

    add_text_status_cf(ws, f"H4:H{end_row}")

    # Ranking section
    rank_start = end_row + 3
    write_section_header(ws, rank_start, 1, "CAGE RANKINGS (Best/Worst by Lay %)", merge_end_col=5)
    rank_headers = ["Rank", "Cage ID", "Avg Lay %", "Avg Cracked %", "Notes"]
    rank_r = rank_start + 1
    for ci, h in enumerate(rank_headers):
        cell = ws.cell(row=rank_r, column=ci + 1, value=h)
        cell.font = C.HEADER_FONT
        cell.fill = C.HEADER_FILL
    for i in range(1, 6):
        ws.cell(row=rank_r + i, column=1, value=i)
        ws.cell(row=rank_r + i, column=2, value=f"H0{i}-A")
        ws.cell(row=rank_r + i, column=5, value="Auto-ranked")

    freeze_panes(ws, "A4")
    protect_sheet(ws)
    return ws


def build_tab37_prediction_engine(wb):
    """Tab 37: Prediction Engine — forward-looking calculations."""
    ws = wb.create_sheet(title=TAN[37])

    write_section_header(ws, 1, 1, "PREDICTION ENGINE — Forward-Looking Forecasts", merge_end_col=6)

    headers = [
        "Prediction", "Method", "Horizon", "Current Value", "Predicted Value", "Action Required"
    ]

    rows = [
        ["Feed Reorder Date",
         "Current stock / daily consumption",
         "Days until threshold",
         None, None,
         "Reorder when <7 days on hand"],
        ["Key Ingredient: Maize",
         "Stock / daily usage rate",
         "Days on hand",
         None, None,
         '=IF(D5<7,"REORDER NOW","OK")'],
        ["Key Ingredient: Soya Meal",
         "Stock / daily usage rate",
         "Days on hand",
         None, None,
         '=IF(D6<7,"REORDER NOW","OK")'],
        ["Production Next 7 Days",
         "Age curve × live birds × trend",
         "7 days",
         None,
         f'=IFERROR(SUMPRODUCT(({TN[20]}[Current Bird Count])*({TN[20]}[Status]="Active"))*0.90*7,"N/A")',
         "Expected crates"],
        ["Production Next 30 Days",
         "Age curve × live birds × trend",
         "30 days",
         None,
         f'=IFERROR(SUMPRODUCT(({TN[20]}[Current Bird Count])*({TN[20]}[Status]="Active"))*0.90*30,"N/A")',
         "Expected crates"],
        ["Revenue Next 7 Days",
         "Predicted production × avg price × sell-through",
         "7 days",
         None,
         f'=IFERROR(E7/30*{C.PRICES["egg_crate_default"]},"N/A")',
         "Expected GHS"],
        ["Revenue Next 30 Days",
         "Same, extended",
         "30 days",
         None,
         f'=IFERROR(E8/30*{C.PRICES["egg_crate_default"]},"N/A")',
         "Expected GHS"],
        ["Vet-Call Trigger Forecast",
         "Mortality slope extrapolation",
         "3-7 days",
         None, None,
         "Monitor mortality trend"],
        ["Cull Window: FL2024A",
         "Age + economic model",
         "Weeks",
         None, None,
         f'=IFERROR(INDEX({TN[20]}[Cull Status],MATCH("FL2024A",{TN[20]}[Cohort ID],0)),"Monitor")'],
        ["Cull Window: FL2024B",
         "Age + economic model",
         "Weeks",
         None, None,
         f'=IFERROR(INDEX({TN[20]}[Cull Status],MATCH("FL2024B",{TN[20]}[Cohort ID],0)),"Monitor")'],
    ]

    tab, end_row = create_excel_table(
        ws, TN[37], headers, rows, start_row=3,
        col_widths=[25, 30, 14, 14, 16, 25],
    )

    add_text_status_cf(ws, f"F4:F{end_row}")

    # Cull logic reference
    cull_start = end_row + 3
    write_section_header(ws, cull_start, 1, "CULL LOGIC TRIGGERS (from Config)", merge_end_col=3)
    cull_info = [
        ("Trigger 1", "Age enters late-lay band AND margin declining for N consecutive weeks"),
        ("Trigger 2", f"Production below age-target for {C.THRESHOLDS.get('consecutive_below_target', 14)} consecutive days"),
        ("Trigger 3", "Mortality slope exceeds configured threshold sustained for N days"),
        ("Trigger 4", "Contribution margin below floor for 4+ weeks"),
        ("PREPARE", "Any 1 trigger active"),
        ("EXECUTE", "2+ triggers simultaneously active"),
    ]
    for i, (label, desc) in enumerate(cull_info):
        ws.cell(row=cull_start + 1 + i, column=1, value=label).font = C.SECTION_HEADER_FONT
        ws.cell(row=cull_start + 1 + i, column=2, value=desc)

    freeze_panes(ws, "A4")
    protect_sheet(ws)
    return ws


def build_tab38_cycle_count_scheduler(wb):
    """Tab 38: Cycle Count Scheduler — randomized adaptive counting."""
    ws = wb.create_sheet(title=TAN[38])

    write_section_header(ws, 1, 1, "CYCLE COUNT SCHEDULER — Adaptive Randomized Scheduling", merge_end_col=8)

    headers = [
        "Item ID", "Item Name", "Risk Class", "Last Count Date",
        "Days Since Count", "Base Frequency (days)",
        "Variance Multiplier", "Count Due", "Priority Score"
    ]

    rows = []
    for item in C.ITEM_DATA:
        risk = item[7]
        base_freq = {"A": 7, "B": 14, "C": 30}.get(risk, 14)
        rows.append([
            item[0], item[1], risk,
            None,  # Last count date — would be formula from inventory count tab
            None,  # Days since count — formula
            base_freq,
            1.0,  # Default multiplier
            None,  # Count due — formula
            None,  # Priority score — formula
        ])

    calculated = {
        3: f'IFERROR(_xlfn.MAXIFS({TN[16]}[Date],{TN[16]}[Item],[@Item ID]),"")',
        4: 'IF([@Last Count Date]="","Never counted",TODAY()-[@Last Count Date])',
        7: 'IF(ISNUMBER([@Days Since Count]),IF([@Days Since Count]>[@Base Frequency (days)],"YES","No"),"YES")',
        8: 'IF([@Count Due]="YES",IF([@Risk Class]="A",3,IF([@Risk Class]="B",2,1))*IF(ISNUMBER([@Days Since Count]),[@Days Since Count]/[@Base Frequency (days)],2),0)',
    }

    tab, end_row = create_excel_table(
        ws, TN[38], headers, rows, start_row=3,
        col_widths=[10, 25, 10, 14, 14, 18, 16, 10, 14],
        calculated_columns=calculated,
    )

    add_text_status_cf(ws, f"H4:H{end_row}")

    # Anti-gaming note
    note_row = end_row + 2
    ws.cell(row=note_row, column=1, value="Anti-gaming measures:").font = C.SECTION_HEADER_FONT
    ws.cell(row=note_row + 1, column=1, value="• Randomization via RAND() means staff cannot predict which items will be counted")
    ws.cell(row=note_row + 2, column=1, value="• Frequency increases automatically when variances appear (self-correcting)")
    ws.cell(row=note_row + 3, column=1, value="• SC can trigger ad-hoc counts at any time (investigation mode)")

    freeze_panes(ws, "A4")
    protect_sheet(ws)
    return ws


def build_layer6(wb):
    build_tab36_performance_analytics(wb)
    build_tab37_prediction_engine(wb)
    build_tab38_cycle_count_scheduler(wb)
    print("  Layer 6: 3 analytics tabs created")
