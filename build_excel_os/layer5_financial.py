"""
layer5_financial.py — Tabs 33-35: Chart of Accounts, Monthly P&L, Unit Economics.
"""

from . import config as C
from .helpers import (
    create_excel_table, protect_sheet, freeze_panes,
    write_section_header, add_traffic_light_cf, add_text_status_cf,
)

TN = C.TABLE_NAMES
TAN = C.TAB_NAMES


def build_tab33_chart_of_accounts(wb):
    """Tab 33: Chart of Accounts / Category Map."""
    ws = wb.create_sheet(title=TAN[33])

    headers = ["Account Code", "Account Name", "Type", "P&L Line"]
    rows = [[a[0], a[1], a[2], a[3]] for a in C.CHART_OF_ACCOUNTS]

    tab, end_row = create_excel_table(
        ws, TN[33], headers, rows,
        col_widths=[14, 30, 10, 25],
    )

    freeze_panes(ws)
    protect_sheet(ws)
    return ws


def build_tab34_monthly_pl(wb):
    """Tab 34: Monthly P&L (Auto-Generated from Layer 1 data)."""
    ws = wb.create_sheet(title=TAN[34])

    write_section_header(ws, 1, 1, "MONTHLY PROFIT & LOSS STATEMENT", merge_end_col=5)

    headers = ["Line Item", "MTD (GHS)", "Last Month (GHS)", "Variance (GHS)", "Variance %"]

    sales = TN[8]
    proc = TN[9]

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
        ["TOTAL REVENUE", "=B3+B4+B5", "=C3+C4+C5", None, None],
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
        ["TOTAL COGS", "=B9+B10", "=C9+C10", None, None],
        # Gross Profit
        ["", None, None, None, None],
        ["GROSS PROFIT", "=B6-B11", "=C6-C11", None, None],
        ["Gross Margin %", '=IF(B6=0,0,B13/B6)', '=IF(C6=0,0,C13/C6)', None, None],
        # Opex
        ["", None, None, None, None],
        ["OPERATING EXPENSES", None, None, None, None],
        ["Labor — Wages",
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
        ["TOTAL OPEX", "=SUM(B17:B22)", "=SUM(C17:C22)", None, None],
        # Net Profit
        ["", None, None, None, None],
        ["NET PROFIT", "=B13-B23", "=C13-C23", None, None],
        ["Net Margin %", '=IF(B6=0,0,B25/B6)', '=IF(C6=0,0,C25/C6)', None, None],
    ]

    # Calculate variance columns
    for i, row in enumerate(rows):
        r = i + 3  # start_row=3, data starts at row 4
        if row[1] is not None and row[0] not in ("", "REVENUE", "COST OF GOODS SOLD",
                                                    "OPERATING EXPENSES"):
            rows[i][3] = f"=B{r}-C{r}"
            rows[i][4] = f'=IF(C{r}=0,0,(B{r}-C{r})/ABS(C{r}))'

    # Write directly (not as table since P&L has merged sections)
    r = 3
    for ci, h in enumerate(headers):
        cell = ws.cell(row=r, column=ci + 1, value=h)
        cell.font = C.HEADER_FONT
        cell.fill = C.HEADER_FILL
        cell.alignment = C.HEADER_ALIGN

    for ri, row_data in enumerate(rows):
        for ci, val in enumerate(row_data):
            cell = ws.cell(row=r + 1 + ri, column=ci + 1)
            if val is not None:
                cell.value = val
            # Bold section headers
            if row_data[0] and row_data[0].isupper():
                cell.font = C.SECTION_HEADER_FONT
            # Currency formatting
            if ci in (1, 2, 3):
                cell.number_format = C.FMT_CURRENCY
            if ci == 4 and row_data[0] not in ("", "Gross Margin %", "Net Margin %"):
                cell.number_format = C.FMT_PERCENT

    # Set widths
    from .helpers import set_col_widths
    set_col_widths(ws, [28, 16, 16, 14, 12])

    freeze_panes(ws, "A4")
    protect_sheet(ws)
    return ws


def build_tab35_unit_economics(wb):
    """Tab 35: Unit Economics — the metrics that determine viability."""
    ws = wb.create_sheet(title=TAN[35])

    write_section_header(ws, 1, 1, "UNIT ECONOMICS DASHBOARD", merge_end_col=5)

    headers = ["Metric", "Current", "Target", "Status"]

    sales = TN[8]
    feed = TN[4]
    prod = TN[1]
    flock = TN[20]

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

    # Write formulas into Current column
    formulas = [
        f'=IFERROR(SUMPRODUCT(({feed}[Net Consumed (kg)])*({feed}[Date]>=DATE(YEAR(TODAY()),MONTH(TODAY()),1)))/SUMPRODUCT(({prod}[Total Eggs])*({prod}[Date]>=DATE(YEAR(TODAY()),MONTH(TODAY()),1))),0)',
        '=B4*30',
        '=B4*12',
        f'=IFERROR(SUMPRODUCT(({feed}[Net Consumed (kg)])*({feed}[Date]>=DATE(YEAR(TODAY()),MONTH(TODAY()),1)))*5.5/(SUMPRODUCT(({flock}[Current Bird Count])*({flock}[Status]="Active"))*DAY(TODAY())),0)',
        f'=IFERROR(SUMPRODUCT(({feed}[Net Consumed (kg)])*({feed}[Date]>=DATE(YEAR(TODAY()),MONTH(TODAY()),1)))/(SUMPRODUCT(({prod}[Total Eggs])*({prod}[Date]>=DATE(YEAR(TODAY()),MONTH(TODAY()),1)))/12),0)',
        f'=IFERROR(SUMPRODUCT(({sales}[Line Total (GHS)])*({sales}[Date/Time]>=DATE(YEAR(TODAY()),MONTH(TODAY()),1)))/SUMPRODUCT(({sales}[Qty (crates)])*({sales}[Date/Time]>=DATE(YEAR(TODAY()),MONTH(TODAY()),1)))-B5*30/12*5.5,0)',
        f'=IFERROR(SUMPRODUCT(({sales}[Line Total (GHS)])*({sales}[Date/Time]>=DATE(YEAR(TODAY()),MONTH(TODAY()),1)))/SUMPRODUCT(({flock}[Current Bird Count])*({flock}[Status]="Active")),0)',
        '=0',  # Placeholder
        '=IF(B9=0,0,0/B9)',  # Placeholder
        f'=IFERROR(SUMIFS({sales}[Line Total (GHS)],{sales}[Qty (crates)],">10")/SUM({sales}[Line Total (GHS)]),0)',
    ]

    # Write headers
    r = 3
    for ci, h in enumerate(headers):
        cell = ws.cell(row=r, column=ci + 1, value=h)
        cell.font = C.HEADER_FONT
        cell.fill = C.HEADER_FILL
        cell.alignment = C.HEADER_ALIGN

    for ri, row_data in enumerate(rows):
        ws.cell(row=r + 1 + ri, column=1, value=row_data[0]).font = C.SECTION_HEADER_FONT
        ws.cell(row=r + 1 + ri, column=2, value=formulas[ri]).number_format = C.FMT_CURRENCY
        ws.cell(row=r + 1 + ri, column=3, value=row_data[2])
        # Status formula
        ws.cell(row=r + 1 + ri, column=4, value='=IF(B{r}="","",IF(ISNUMBER(B{r}),"Active","N/A"))'.format(r=r+1+ri))

    from .helpers import set_col_widths
    set_col_widths(ws, [30, 16, 16, 10])

    freeze_panes(ws, "A4")
    protect_sheet(ws)
    return ws


def build_layer5(wb):
    build_tab33_chart_of_accounts(wb)
    build_tab34_monthly_pl(wb)
    build_tab35_unit_economics(wb)
    print("  Layer 5: 3 financial tabs created")
