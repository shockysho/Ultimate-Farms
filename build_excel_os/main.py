"""
main.py — Orchestrator for Ultimate Farms Excel OS v2.0.

Usage:
    python -m build_excel_os.main
"""

import os
import sys
import shutil
import zipfile
from pathlib import Path
from openpyxl import Workbook

from . import config as C
from .sample_data import generate_all_sample_data
from .layer2_master_data import build_layer2
from .layer1_inputs import build_layer1
from .layer3_target_engine import build_layer3
from .layer4_reconciliation import build_layer4
from .layer5_financial import build_layer5
from .layer6_analytics import build_layer6
from .views_dashboards import build_dashboards


OUTPUT_DIR = Path(__file__).resolve().parent.parent
OUTPUT_FILE = OUTPUT_DIR / "Ultimate_Farms_Excel_OS_v2.0.xlsx"


def apply_tab_colors(wb):
    """Apply layer-based tab colors to every worksheet."""
    tab_title_to_number = {v: k for k, v in C.TAB_NAMES.items()}
    for ws in wb.worksheets:
        tab_num = tab_title_to_number.get(ws.title)
        if tab_num and tab_num in C.TAB_COLORS:
            ws.sheet_properties.tabColor = C.TAB_COLORS[tab_num]


def reorder_sheets(wb):
    """Reorder sheets: Dashboards first, then Layer 1, Layer 2, Layer 3-6."""
    desired_order = []

    # Dashboards first (39, 40)
    for t in [39, 40]:
        desired_order.append(C.TAB_NAMES[t])

    # Layer 1 inputs (1-16)
    for t in range(1, 17):
        desired_order.append(C.TAB_NAMES[t])

    # Layer 2 master data (17-27)
    for t in range(17, 28):
        desired_order.append(C.TAB_NAMES[t])

    # Layer 3-6 engines (28-38)
    for t in range(28, 39):
        desired_order.append(C.TAB_NAMES[t])

    # Build ordered list of worksheet objects
    name_to_ws = {ws.title: ws for ws in wb.worksheets}
    ordered = []
    for name in desired_order:
        if name in name_to_ws:
            ordered.append(name_to_ws.pop(name))
    # Append any remaining sheets (e.g., default "Sheet") at the end
    for ws in name_to_ws.values():
        ordered.append(ws)

    wb._sheets = ordered


def remove_default_sheet(wb):
    """Remove the default 'Sheet' created by openpyxl if it still exists."""
    if "Sheet" in wb.sheetnames:
        del wb["Sheet"]


def strip_calc_chain(filepath):
    """Remove calcChain.xml from the xlsx to avoid formula chain corruption.
    Excel will recalculate the chain on first open."""
    tmp = str(filepath) + ".tmp"
    with zipfile.ZipFile(str(filepath), "r") as zin:
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                if item.filename == "xl/calcChain.xml":
                    continue
                zout.writestr(item, zin.read(item.filename))
    os.replace(tmp, str(filepath))


def build():
    """Main build pipeline."""
    print("=" * 60)
    print("  Ultimate Farms Excel OS v2.0 -- Build Starting")
    print("=" * 60)

    # 1. Create workbook
    wb = Workbook()
    print("\n[1/8] Workbook created")

    # 2. Generate sample data
    print("[2/8] Generating sample data...")
    data = generate_all_sample_data()
    print(f"       {sum(len(v) for v in data.values() if isinstance(v, list))} total data rows generated")

    # 3. Build Layer 2 first (master data — dropdowns depend on it)
    print("[3/8] Building Layer 2: Master Data (11 tabs)...")
    build_layer2(wb)

    # 4. Build Layer 1 (inputs with sample data)
    print("[4/8] Building Layer 1: Input Tabs (16 tabs)...")
    build_layer1(wb, data)

    # 5. Build Layer 3 (target engine)
    print("[5/8] Building Layer 3: Target Engine...")
    build_layer3(wb)

    # 6. Build Layer 4 (reconciliation)
    print("[6/8] Building Layer 4: Reconciliation & Fraud...")
    build_layer4(wb)

    # 7. Build Layer 5 (financial)
    print("[7/8] Building Layer 5: Financial Engine...")
    build_layer5(wb)

    # 8. Build Layer 6 (analytics)
    print("[8/8] Building Layer 6: Analytics & Predictions...")
    build_layer6(wb)

    # 9. Build Dashboards
    print("[+]   Building Dashboard Views...")
    build_dashboards(wb)

    # 10. Apply tab colors
    print("\n--- Post-processing ---")
    print("  Applying tab colors...")
    apply_tab_colors(wb)

    # 11. Reorder sheets
    print("  Reordering sheets (Dashboards > L1 > L2 > L3-6)...")
    reorder_sheets(wb)

    # 12. Remove default sheet
    remove_default_sheet(wb)

    # 13. Save
    print(f"\n  Saving to: {OUTPUT_FILE}")
    wb.save(str(OUTPUT_FILE))

    # 14. Strip calcChain.xml to prevent formula-chain corruption
    print("  Stripping calcChain.xml...")
    strip_calc_chain(OUTPUT_FILE)

    # Summary
    print("\n" + "=" * 60)
    print(f"  BUILD COMPLETE -- {len(wb.sheetnames)} tabs generated")
    print(f"  File: {OUTPUT_FILE}")
    print(f"  Size: {os.path.getsize(OUTPUT_FILE) / 1024:.0f} KB")
    print("=" * 60)

    # Tab listing
    print("\nTab listing:")
    for i, name in enumerate(wb.sheetnames, 1):
        print(f"  {i:2d}. {name}")

    return wb


if __name__ == "__main__":
    build()
