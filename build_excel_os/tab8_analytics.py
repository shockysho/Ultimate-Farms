"""
tab8_analytics.py -- Tab 8: Analytics (single sheet, 6 sections).
Merges old layer5_financial.py + layer6_analytics.py.
Sections: Chart of Accounts, Monthly P&L, Unit Economics,
          Performance Analytics, Predictions, Cycle Count Scheduler.
"""

from datetime import timedelta
from . import config as C
from .config import T
from .sample_data import DATA_START_DATE, DATA_END_DATE, NUM_DAYS
from .helpers import (
    create_excel_table, protect_sheet, freeze_panes,
    write_section_header, add_traffic_light_cf, add_text_status_cf,
    apply_header_formatting, set_col_widths,
)


# ---------------------------------------------------------------------------
# Section A: Chart of Accounts
# ---------------------------------------------------------------------------

def _build_section_chart_of_accounts(ws, start_row):
    write_section_header(ws, start_row, 1,
                         "CHART OF ACCOUNTS / CATEGORY MAP", merge_end_col=5)

    headers = ["Account Code", "Account Name", "Type", "P&L Line"]
    rows = [[a[0], a[1], a[2], a[3]] for a in C.CHART_OF_ACCOUNTS]

    table_start = start_row + 2
    tab, end_row = create_excel_table(
        ws, T("chart_of_accounts"), headers, rows, start_row=table_start,
        col_widths=[14, 30, 10, 25],
    )
    return end_row + 2


# ---------------------------------------------------------------------------
# Section B: Monthly P&L
# ---------------------------------------------------------------------------

def _build_section_monthly_pl(ws, start_row):
    write_section_header(ws, start_row, 1,
                         "MONTHLY PROFIT & LOSS STATEMENT", merge_end_col=5)

    headers = ["Line Item", "MTD (GHS)", "Last Month (GHS)", "Variance (GHS)", "Variance %"]

    sales = T("sales")
    proc = T("procurement")

    rows = [
        # Revenue
        ["REVENUE", None, None, None, None],
        ["Egg Sales",
         f'=SUMIFS({sales}[Line Total (GHS)],{sales}[Product],"Egg crates",{sales}[Date/Time],">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1),{sales}[Date/Time],"<="&TODAY())',
         f'=SUMIFS({sales}[Line Total (GHS)],{sales}[Product],"Egg crates",{sales}[Date/Time],">="&DATE(YEAR(TODAY()),MONTH(TODAY())-1,1),{sales}[Date/Time],"<"&DATE(YEAR(TODAY()),MONTH(TODAY()),1))',
         None, None],
        ["Manure Sales",
         f'=SUMIFS({sales}[Line Total (GHS)],{sales}[Product],"Manure*",{sales}[Date/Time],">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1))',
         0, None, None],
        ["Culled Bird Sales",
         f'=SUMIFS({sales}[Line Total (GHS)],{sales}[Product],"Culled birds",{sales}[Date/Time],">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1))',
         0, None, None],
        ["TOTAL REVENUE", None, None, None, None],
        # COGS
        ["", None, None, None, None],
        ["COST OF GOODS SOLD", None, None, None, None],
        ["Feed Ingredients",
         f'=SUMIFS({proc}[Total Cost],{proc}[Category],"Feed ingredient",{proc}[Date/Time],">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1),{proc}[Date/Time],"<="&TODAY())',
         f'=SUMIFS({proc}[Total Cost],{proc}[Category],"Feed ingredient",{proc}[Date/Time],">="&DATE(YEAR(TODAY()),MONTH(TODAY())-1,1),{proc}[Date/Time],"<"&DATE(YEAR(TODAY()),MONTH(TODAY()),1))',
         None, None],
        ["Medications & Supplements",
         f'=SUMIFS({proc}[Total Cost],{proc}[Category],"Medication",{proc}[Date/Time],">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1))',
         0, None, None],
        ["TOTAL COGS", None, None, None, None],
        # Gross Profit
        ["", None, None, None, None],
        ["GROSS PROFIT", None, None, None, None],
        ["Gross Margin %", None, None, None, None],
        # Opex
        ["", None, None, None, None],
        ["OPERATING EXPENSES", None, None, None, None],
        ["Labor -- Wages",
         f'=SUMIFS({proc}[Total Cost],{proc}[Category],"Labor",{proc}[Date/Time],">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1))',
         0, None, None],
        ["Fuel",
         f'=SUMIFS({proc}[Total Cost],{proc}[Category],"Fuel",{proc}[Date/Time],">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1))',
         0, None, None],
        ["Repairs & Maintenance",
         f'=SUMIFS({proc}[Total Cost],{proc}[Category],"Repairs",{proc}[Date/Time],">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1))',
         0, None, None],
        ["Utilities",
         f'=SUMIFS({proc}[Total Cost],{proc}[Category],"Utilities",{proc}[Date/Time],">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1))',
         0, None, None],
        ["Supplies",
         f'=SUMIFS({proc}[Total Cost],{proc}[Category],"Supplies",{proc}[Date/Time],">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1))',
         0, None, None],
        ["Other Opex",
         f'=SUMIFS({proc}[Total Cost],{proc}[Category],"Other",{proc}[Date/Time],">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1))',
         0, None, None],
        ["TOTAL OPEX", None, None, None, None],
        # Net Profit
        ["", None, None, None, None],
        ["NET PROFIT", None, None, None, None],
        ["Net Margin %", None, None, None, None],
    ]

    # Write headers
    table_start = start_row + 2
    r = table_start
    for ci, h in enumerate(headers):
        cell = ws.cell(row=r, column=ci + 1, value=h)
        cell.font = C.HEADER_FONT
        cell.fill = C.HEADER_FILL
        cell.alignment = C.HEADER_ALIGN

    # Row references (relative to table_start)
    # Row offsets: data starts at table_start+1
    # Revenue rows: 1-4, TOTAL REVENUE=5, blank=6, COGS header=7, Feed=8, Meds=9, TOTAL COGS=10
    # blank=11, GROSS PROFIT=12, Gross Margin=13, blank=14, OPEX header=15
    # Labor=16, Fuel=17, Repairs=18, Utilities=19, Supplies=20, Other=21, TOTAL OPEX=22
    # blank=23, NET PROFIT=24, Net Margin=25

    for ri, row_data in enumerate(rows):
        data_row = r + 1 + ri
        for ci, val in enumerate(row_data):
            cell = ws.cell(row=data_row, column=ci + 1)
            if val is not None:
                cell.value = val
            if row_data[0] and row_data[0].isupper():
                cell.font = C.SECTION_HEADER_FONT
            if ci in (1, 2, 3):
                cell.number_format = C.FMT_CURRENCY
            if ci == 4 and row_data[0] not in ("", "Gross Margin %", "Net Margin %"):
                cell.number_format = C.FMT_PERCENT

    # Computed rows (absolute row numbers)
    base = r + 1  # first data row
    # TOTAL REVENUE = sum of rows 2-4 (Egg + Manure + Culled)
    ws.cell(row=base + 4, column=2, value=f"=B{base+1}+B{base+2}+B{base+3}")
    ws.cell(row=base + 4, column=3, value=f"=C{base+1}+C{base+2}+C{base+3}")
    # TOTAL COGS = Feed + Meds
    ws.cell(row=base + 9, column=2, value=f"=B{base+7}+B{base+8}")
    ws.cell(row=base + 9, column=3, value=f"=C{base+7}+C{base+8}")
    # GROSS PROFIT
    ws.cell(row=base + 11, column=2, value=f"=B{base+4}-B{base+9}")
    ws.cell(row=base + 11, column=3, value=f"=C{base+4}-C{base+9}")
    # Gross Margin %
    ws.cell(row=base + 12, column=2, value=f'=IF(B{base+4}=0,0,B{base+11}/B{base+4})')
    ws.cell(row=base + 12, column=3, value=f'=IF(C{base+4}=0,0,C{base+11}/C{base+4})')
    # TOTAL OPEX = sum of rows 16-21
    ws.cell(row=base + 21, column=2, value=f"=SUM(B{base+15}:B{base+20})")
    ws.cell(row=base + 21, column=3, value=f"=SUM(C{base+15}:C{base+20})")
    # NET PROFIT
    ws.cell(row=base + 23, column=2, value=f"=B{base+11}-B{base+21}")
    ws.cell(row=base + 23, column=3, value=f"=C{base+11}-C{base+21}")
    # Net Margin %
    ws.cell(row=base + 24, column=2, value=f'=IF(B{base+4}=0,0,B{base+23}/B{base+4})')
    ws.cell(row=base + 24, column=3, value=f'=IF(C{base+4}=0,0,C{base+23}/C{base+4})')

    # Variance columns for all non-header rows
    for ri, row_data in enumerate(rows):
        data_row = r + 1 + ri
        label = row_data[0]
        if label and label not in ("", "REVENUE", "COST OF GOODS SOLD", "OPERATING EXPENSES") and row_data[1] is not None:
            ws.cell(row=data_row, column=4, value=f"=B{data_row}-C{data_row}")
            ws.cell(row=data_row, column=5, value=f'=IF(C{data_row}=0,0,(B{data_row}-C{data_row})/ABS(C{data_row}))')
    # Also apply to computed total rows
    for offset in [4, 9, 11, 12, 21, 23, 24]:
        dr = base + offset
        ws.cell(row=dr, column=4, value=f"=B{dr}-C{dr}")
        ws.cell(row=dr, column=5, value=f'=IF(C{dr}=0,0,(B{dr}-C{dr})/ABS(C{dr}))')

    set_col_widths(ws, [28, 16, 16, 14, 12])

    end_row = r + 1 + len(rows) - 1
    return end_row + 2


# ---------------------------------------------------------------------------
# Section C: Unit Economics
# ---------------------------------------------------------------------------

def _build_section_unit_economics(ws, start_row):
    write_section_header(ws, start_row, 1,
                         "UNIT ECONOMICS DASHBOARD", merge_end_col=5)

    headers = ["Metric", "Current", "Target", "Status"]

    sales = T("sales")
    feed = T("feed_consumption")
    prod = T("daily_cage_log")
    flock = T("flock")

    rows = [
        ["Feed Cost per Egg (GHS)", None, "Configurable", None],
        ["Feed Cost per Crate (GHS)", None, "Configurable", None],
        ["Feed Cost per Dozen (GHS)", None, "Configurable", None],
        ["Feed Cost per Bird/Day (GHS)", None, "0.38-0.47", None],
        ["FCR (kg feed / dozen eggs)", None, "Peak: 1.7-2.0", None],
        ["Contribution Margin / Crate", None, "Configurable", None],
        ["Revenue per Bird / Month", None, "-", None],
        ["Cost per Bird / Month", None, "-", None],
        ["Break-even Crates / Day", None, "-", None],
        ["Wholesale %", None, ">=70%", None],
    ]

    formulas = [
        f'=IFERROR(SUMPRODUCT(({feed}[Net Consumed (kg)])*({feed}[Date]>=DATE(YEAR(TODAY()),MONTH(TODAY()),1)))/SUMPRODUCT(({prod}[Total Eggs])*({prod}[Date]>=DATE(YEAR(TODAY()),MONTH(TODAY()),1))),0)',
        '=B{base}*30',
        '=B{base}*12',
        f'=IFERROR(SUMPRODUCT(({feed}[Net Consumed (kg)])*({feed}[Date]>=DATE(YEAR(TODAY()),MONTH(TODAY()),1)))*5.5/(SUMPRODUCT(({flock}[Current Bird Count])*({flock}[Status]="Active"))*DAY(TODAY())),0)',
        f'=IFERROR(SUMPRODUCT(({feed}[Net Consumed (kg)])*({feed}[Date]>=DATE(YEAR(TODAY()),MONTH(TODAY()),1)))/(SUMPRODUCT(({prod}[Total Eggs])*({prod}[Date]>=DATE(YEAR(TODAY()),MONTH(TODAY()),1)))/12),0)',
        f'=IFERROR(SUMPRODUCT(({sales}[Line Total (GHS)])*({sales}[Date/Time]>=DATE(YEAR(TODAY()),MONTH(TODAY()),1)))/SUMPRODUCT(({sales}[Qty (crates)])*({sales}[Date/Time]>=DATE(YEAR(TODAY()),MONTH(TODAY()),1)))-B{{fcr_row}}*30/12*5.5,0)',
        f'=IFERROR(SUMPRODUCT(({sales}[Line Total (GHS)])*({sales}[Date/Time]>=DATE(YEAR(TODAY()),MONTH(TODAY()),1)))/SUMPRODUCT(({flock}[Current Bird Count])*({flock}[Status]="Active")),0)',
        '=0',
        '=IF(B{cost_row}=0,0,0/B{cost_row})',
        f'=IFERROR(SUMIFS({sales}[Line Total (GHS)],{sales}[Qty (crates)],">10")/SUM({sales}[Line Total (GHS)]),0)',
    ]

    # Write headers
    table_start = start_row + 2
    r = table_start
    for ci, h in enumerate(headers):
        cell = ws.cell(row=r, column=ci + 1, value=h)
        cell.font = C.HEADER_FONT
        cell.fill = C.HEADER_FILL
        cell.alignment = C.HEADER_ALIGN

    base = r + 1  # first data row
    for ri, row_data in enumerate(rows):
        data_row = base + ri
        ws.cell(row=data_row, column=1, value=row_data[0]).font = C.SECTION_HEADER_FONT
        # Formula in column B
        formula = formulas[ri]
        formula = formula.replace("{base}", str(base))
        formula = formula.replace("{fcr_row}", str(base + 4))
        formula = formula.replace("{cost_row}", str(base + 7))
        ws.cell(row=data_row, column=2, value=formula).number_format = C.FMT_CURRENCY
        ws.cell(row=data_row, column=3, value=row_data[2])
        ws.cell(row=data_row, column=4,
                value='=IF(B{r}="","",IF(ISNUMBER(B{r}),"Active","N/A"))'.format(r=data_row))

    set_col_widths(ws, [30, 16, 16, 10])

    end_row = base + len(rows) - 1
    return end_row + 2


# ---------------------------------------------------------------------------
# Section D: Performance Analytics
# ---------------------------------------------------------------------------

def _build_section_perf_analytics(ws, start_row):
    write_section_header(ws, start_row, 1,
                         "PERFORMANCE ANALYTICS -- Cohort Comparison", merge_end_col=10)

    headers = [
        "Cohort ID", "Phase", "Metric", "Current Value",
        "Effective Target", "Variance", "7d Trend", "Status",
    ]

    target = T("target_resolver")
    prod = T("daily_cage_log")

    rows = []
    metrics = [
        "Lay %", "FCR", "Mortality Rate (monthly %)",
        "Cracked %", "Large %", "Feed Intake (g/bird/day)",
    ]
    for flock in C.FLOCK_DATA:
        for metric_name in metrics:
            rows.append([flock[0], None, metric_name, None, None, None, None, None])

    calculated = {
        1: f'IFERROR(INDEX({target}[Production Phase],MATCH([@Cohort ID],{target}[Cohort ID],0)),"Unknown")',
        3: (
            'IF([@Metric]="Lay %",'
            f'IFERROR(AVERAGEIFS({prod}[Large %],{prod}[Date],">="&(TODAY()-6)),0),'
            '0)'
        ),
        4: f'IFERROR(INDEX({target}[Effective Target: Lay %],MATCH([@Cohort ID],{target}[Cohort ID],0)),0)',
        5: '[@Current Value]-[@Effective Target]',
        6: '"->"',
        7: 'IF([@Variance]>=0,"Green",IF([@Variance]>=-0.05,"Yellow","Red"))',
    }

    table_start = start_row + 2
    tab, end_row = create_excel_table(
        ws, T("perf_analytics"), headers, rows, start_row=table_start,
        col_widths=[12, 12, 22, 14, 14, 12, 10, 10],
        calculated_columns=calculated,
    )

    add_text_status_cf(ws, f"H{table_start + 1}:H{end_row}")

    # Cage rankings
    rank_start = end_row + 3
    write_section_header(ws, rank_start, 1,
                         "CAGE RANKINGS (Best/Worst by Lay %)", merge_end_col=5)
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

    return rank_r + 6 + 1


# ---------------------------------------------------------------------------
# Section E: Prediction Engine
# ---------------------------------------------------------------------------

def _build_section_predictions(ws, start_row):
    write_section_header(ws, start_row, 1,
                         "PREDICTION ENGINE -- Forward-Looking Forecasts", merge_end_col=6)

    headers = [
        "Prediction", "Method", "Horizon", "Current Value", "Predicted Value", "Action Required",
    ]

    flock = T("flock")
    rows = [
        ["Feed Reorder Date", "Current stock / daily consumption",
         "Days until threshold", None, None, "Reorder when <7 days on hand"],
        ["Key Ingredient: Maize", "Stock / daily usage rate",
         "Days on hand", None, None, '=IF(D{r}<7,"REORDER NOW","OK")'],
        ["Key Ingredient: Soya Meal", "Stock / daily usage rate",
         "Days on hand", None, None, '=IF(D{r}<7,"REORDER NOW","OK")'],
        ["Production Next 7 Days", "Age curve x live birds x trend",
         "7 days", None,
         f'=IFERROR(SUMPRODUCT(({flock}[Current Bird Count])*({flock}[Status]="Active"))*0.90*7,"N/A")',
         "Expected crates"],
        ["Production Next 30 Days", "Age curve x live birds x trend",
         "30 days", None,
         f'=IFERROR(SUMPRODUCT(({flock}[Current Bird Count])*({flock}[Status]="Active"))*0.90*30,"N/A")',
         "Expected crates"],
        ["Revenue Next 7 Days", "Predicted production x avg price x sell-through",
         "7 days", None, None, "Expected GHS"],
        ["Revenue Next 30 Days", "Same, extended",
         "30 days", None, None, "Expected GHS"],
        ["Vet-Call Trigger Forecast", "Mortality slope extrapolation",
         "3-7 days", None, None, "Monitor mortality trend"],
        ["Cull Window: FL2024A", "Age + economic model",
         "Weeks", None, None,
         f'=IFERROR(INDEX({flock}[Cull Status],MATCH("FL2024A",{flock}[Cohort ID],0)),"Monitor")'],
        ["Cull Window: FL2024B", "Age + economic model",
         "Weeks", None, None,
         f'=IFERROR(INDEX({flock}[Cull Status],MATCH("FL2024B",{flock}[Cohort ID],0)),"Monitor")'],
    ]

    table_start = start_row + 2
    tab, end_row = create_excel_table(
        ws, T("predictions"), headers, rows, start_row=table_start,
        col_widths=[25, 30, 14, 14, 16, 25],
    )

    # Fix row-dependent formulas
    for ri in range(len(rows)):
        data_row = table_start + 1 + ri
        cell_f = ws.cell(row=data_row, column=6)
        if cell_f.value and "{r}" in str(cell_f.value):
            cell_f.value = str(cell_f.value).replace("{r}", str(data_row))

    # Revenue predictions (rows 6-7, 0-indexed from rows list = 5-6)
    rev7_row = table_start + 1 + 5
    rev30_row = table_start + 1 + 6
    prod7_row = table_start + 1 + 3
    prod30_row = table_start + 1 + 4
    ws.cell(row=rev7_row, column=5,
            value=f'=IFERROR(E{prod7_row}/30*{C.PRICES["egg_crate_default"]},"N/A")')
    ws.cell(row=rev30_row, column=5,
            value=f'=IFERROR(E{prod30_row}/30*{C.PRICES["egg_crate_default"]},"N/A")')

    add_text_status_cf(ws, f"F{table_start + 1}:F{end_row}")

    # Cull logic reference
    cull_start = end_row + 3
    write_section_header(ws, cull_start, 1,
                         "CULL LOGIC TRIGGERS (from Config)", merge_end_col=3)
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

    return cull_start + 1 + len(cull_info) + 1


# ---------------------------------------------------------------------------
# Section F: Cycle Count Scheduler
# ---------------------------------------------------------------------------

def _build_section_cycle_count(ws, start_row):
    write_section_header(ws, start_row, 1,
                         "CYCLE COUNT SCHEDULER -- Adaptive Randomized Scheduling", merge_end_col=8)

    headers = [
        "Item ID", "Item Name", "Risk Class", "Last Count Date",
        "Days Since Count", "Base Frequency (days)",
        "Variance Multiplier", "Count Due", "Priority Score",
    ]

    inv_count = T("inventory_count")
    rows = []
    for item in C.ITEM_DATA:
        risk = item[7]
        base_freq = {"A": 7, "B": 14, "C": 30}.get(risk, 14)
        rows.append([
            item[0], item[1], risk,
            None, None, base_freq, 1.0, None, None,
        ])

    calculated = {
        3: f'IFERROR(_xlfn.MAXIFS({inv_count}[Date],{inv_count}[Item],[@Item ID]),"")',
        4: 'IF([@Last Count Date]="","Never counted",TODAY()-[@Last Count Date])',
        7: 'IF(ISNUMBER([@Days Since Count]),IF([@Days Since Count]>[@Base Frequency (days)],"YES","No"),"YES")',
        8: 'IF([@Count Due]="YES",IF([@Risk Class]="A",3,IF([@Risk Class]="B",2,1))*IF(ISNUMBER([@Days Since Count]),[@Days Since Count]/[@Base Frequency (days)],2),0)',
    }

    table_start = start_row + 2
    tab, end_row = create_excel_table(
        ws, T("cycle_count_sched"), headers, rows, start_row=table_start,
        col_widths=[10, 25, 10, 14, 14, 18, 16, 10, 14],
        calculated_columns=calculated,
    )

    add_text_status_cf(ws, f"H{table_start + 1}:H{end_row}")

    # Anti-gaming note
    note_row = end_row + 2
    ws.cell(row=note_row, column=1, value="Anti-gaming measures:").font = C.SECTION_HEADER_FONT
    ws.cell(row=note_row + 1, column=1,
            value="* Randomization via RAND() means staff cannot predict which items will be counted")
    ws.cell(row=note_row + 2, column=1,
            value="* Frequency increases automatically when variances appear (self-correcting)")
    ws.cell(row=note_row + 3, column=1,
            value="* SC can trigger ad-hoc counts at any time (investigation mode)")

    return note_row + 4


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------

def build_tab8_analytics(wb):
    """Build Tab 8: Analytics -- 6 sections on one sheet."""
    ws = wb.create_sheet(title=C.TAB_NAMES[8])

    row = 1

    row = _build_section_chart_of_accounts(ws, row)
    row = _build_section_monthly_pl(ws, row)
    row = _build_section_unit_economics(ws, row)
    row = _build_section_perf_analytics(ws, row)
    row = _build_section_predictions(ws, row)
    _build_section_cycle_count(ws, row)

    freeze_panes(ws, "A2")
    protect_sheet(ws)

    print("  Tab 8 (Analytics): 6 sections (COA, P&L, Unit Econ, Perf, Predict, CycleCount)")
    return ws
