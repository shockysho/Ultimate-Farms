"""
layer3_target_engine.py — Tab 28: Live Target Resolver.
Computes effective targets per cohort per metric based on age, breed curves, and owner overrides.
"""

from . import config as C
from .helpers import (
    create_excel_table, protect_sheet, freeze_panes,
    add_text_status_cf, add_traffic_light_cf, write_section_header,
)

TN = C.TABLE_NAMES
TAN = C.TAB_NAMES


def build_tab28_target_resolver(wb):
    """Tab 28: Live Target Resolver — age-based + override targets per cohort."""
    ws = wb.create_sheet(title=TAN[28])

    # Section header
    write_section_header(ws, 1, 1, "LIVE TARGET RESOLVER — Phase-Adjusted Performance Targets", merge_end_col=16)

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
        "Status"
    ]

    # One row per flock
    rows = []
    for f in C.FLOCK_DATA:
        rows.append([
            f[0], f[1],
            None, None,  # Age + Phase = formulas
            None, None, None, None, None,  # Lay targets = formulas
            None, None, None, None,  # FCR = formulas
            None, None,  # Feed + Mortality = formulas
            None,  # Status = formula
        ])

    bc = TN[21]  # Breeder curves table
    ov = TN[22]  # Owner overrides table

    calculated = {
        # Current age (weeks)
        2: f'IFERROR(INDEX({TN[20]}[Current Age (weeks)],MATCH([@Cohort ID],{TN[20]}[Cohort ID],0)),0)',
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

    tab, end_row = create_excel_table(
        ws, TN[28], headers, rows, start_row=3,
        col_widths=[12, 22, 14, 14, 16, 14, 16, 16, 14, 14, 14, 14, 14, 20, 20, 10],
        calculated_columns=calculated,
        number_formats={
            4: C.FMT_PERCENT, 5: C.FMT_PERCENT, 6: C.FMT_PERCENT,
            7: C.FMT_PERCENT, 8: C.FMT_PERCENT,
            9: C.FMT_DECIMAL_2, 10: C.FMT_DECIMAL_2, 11: C.FMT_DECIMAL_2, 12: C.FMT_DECIMAL_2,
            13: C.FMT_DECIMAL_1, 14: C.FMT_PERCENT,
        },
    )

    # Phase-dependent threshold reference table
    ref_start = end_row + 3
    write_section_header(ws, ref_start, 1,
                          "Phase-Dependent Threshold Reference (from UFOS 4.3 Layer 6)", merge_end_col=6)

    ref_headers = ["KPI", "Ramp-up (18-24 wks)", "Peak (25-45 wks)", "Post-peak (46-60 wks)", "Late-lay (61+ wks)"]
    ref_rows = [
        ["Lay Rate Yellow", "5-7% below curve (2d)", "<88% (2d)", "3-5% below age (2d)", "5-7% below age (2d)"],
        ["Lay Rate Red", ">7% below (2d)", "<85% (2d) OR >3% drop/day", ">3% drop/day", ">5% drop/day"],
        ["FCR Yellow", "0.2 above (3d)", ">2.2 (3d)", "0.2 above (3d)", "0.3 above (3d)"],
        ["FCR Red", "0.3 above (3d)", ">2.5 (3d) OR >0.1 jump", ">0.1 jump", ">0.15 jump"],
        ["Mortality Yellow", ">0.04%/day (2d)", ">0.05%/day (2d)", ">0.06%/day (2d)", ">0.08%/day (2d)"],
        ["Mortality Red", ">0.06%/day", ">0.05%+cluster", ">0.08% OR 2x spike", ">0.1% OR 2x spike"],
        ["Cracked % Yellow", ">5% (2d)", ">5% (2d)", ">6% (2d)", ">7% (2d)"],
        ["Large % Yellow", "N/A", "<60% (3d)", "<55% (3d)", "<50% (3d)"],
        ["ABSOLUTE TRIGGER", "Disease mortality >5 birds/day = IMMEDIATE RED at any phase", "", "", ""],
    ]

    from .helpers import apply_header_formatting
    r = ref_start + 1
    for ci, h in enumerate(ref_headers):
        ws.cell(row=r, column=ci + 1, value=h)
    apply_header_formatting(ws, r, 1, len(ref_headers))
    for ri, row_data in enumerate(ref_rows):
        for ci, val in enumerate(row_data):
            ws.cell(row=r + 1 + ri, column=ci + 1, value=val)

    freeze_panes(ws, "A4")
    protect_sheet(ws)

    print("  Layer 3: Target Resolver tab created")
    return ws


def build_layer3(wb):
    build_tab28_target_resolver(wb)
