"""
sample_data.py -- Generate 28 days of realistic poultry farm data for Ultimate Farms.
Lohmann Brown Classic layers, ~5000 birds, Kumasi Ghana, GHS currency.
"""

import random
import math
from datetime import date, timedelta, datetime, time
from . import config as C

random.seed(42)  # Reproducible sample data

# Reference date: 4 weeks ending yesterday
_DATA_END_DATE = date(2026, 2, 23)
_DATA_START_DATE = _DATA_END_DATE - timedelta(days=27)
_NUM_DAYS = 28

# Flock age calculation helpers
FLOCK_ARRIVAL = {
    "FL2024A": date(2024, 4, 15),
    "FL2024B": date(2024, 7, 1),
}

def age_weeks(flock_id, on_date):
    arrival = FLOCK_ARRIVAL[flock_id]
    return (on_date - arrival).days // 7

def interpolate_breeder(week, col_index):
    """Interpolate a value from the breeder curve at a given week."""
    curve = C.BREEDER_CURVE
    if week <= curve[0][0]:
        return curve[0][col_index]
    if week >= curve[-1][0]:
        return curve[-1][col_index]
    for i in range(len(curve) - 1):
        w0, w1 = curve[i][0], curve[i + 1][0]
        if w0 <= week <= w1:
            frac = (week - w0) / (w1 - w0)
            v0 = curve[i][col_index]
            v1 = curve[i + 1][col_index]
            if v0 is None or v1 is None:
                return v0 if v1 is None else v1
            return v0 + frac * (v1 - v0)
    return curve[-1][col_index]

def get_target_lay_pct(flock_id, on_date):
    w = age_weeks(flock_id, on_date)
    return interpolate_breeder(w, 1)

def get_target_feed_g(flock_id, on_date):
    w = age_weeks(flock_id, on_date)
    return interpolate_breeder(w, 4)

def get_phase(flock_id, on_date):
    w = age_weeks(flock_id, on_date)
    if w < 25: return "Ramp-up"
    if w <= 45: return "Peak"
    if w <= 60: return "Post-peak"
    return "Late-lay"


# Track bird counts (decremented by mortality)
_bird_counts = {}

def init_bird_counts():
    """Initialize bird counts per cage from housing data."""
    _bird_counts.clear()
    for cage_id, _, _, _, side, count, flock_id, active in C.HOUSING_DATA:
        _bird_counts[cage_id] = count

def get_bird_count(cage_id):
    return _bird_counts.get(cage_id, 0)

def get_flock_bird_count(flock_id):
    total = 0
    for cage_id, _, _, _, _, _, fid, _ in C.HOUSING_DATA:
        if fid == flock_id:
            total += get_bird_count(cage_id)
    return total

def get_flock_for_cage(cage_id):
    for cid, _, _, _, _, _, fid, _ in C.HOUSING_DATA:
        if cid == cage_id:
            return fid
    return None


def generate_all_sample_data():
    """Generate all sample data and return as a dict of lists."""
    init_bird_counts()

    data = {
        "daily_cage_log": [],       # Merged production + mortality
        "environmental": [],
        "feed_consumption": [],
        "water_consumption": [],
        "ingredient_movement": [],
        "feed_mixing": [],
        "sales": [],
        "procurement": [],
        "equipment": [],
        "biosecurity": [],
        "visitor": [],
        "health_incident": [],
        "medication": [],
        "labor": [],
        "inventory_count": [],
    }

    # Daily cumulative trackers
    total_eggs_by_day = {}
    daily_mortality = {}
    invoice_counter = 1000
    batch_counter = 100
    proc_counter = 500

    # Set date range on config for use by Engine/Analytics builders
    C.DATA_START_DATE = _DATA_START_DATE
    C.DATA_END_DATE = _DATA_END_DATE
    C.NUM_DAYS = _NUM_DAYS

    for day_offset in range(_NUM_DAYS):
        current_date = _DATA_START_DATE + timedelta(days=day_offset)
        day_of_week = current_date.weekday()  # 0=Monday
        is_weekend = day_of_week >= 5

        # Determine which team is on duty (A/B rotation weekly)
        week_num = day_offset // 7
        team_on_duty = "Team A" if week_num % 2 == 0 else "Team B"

        # Small random daily factors
        heat_factor = random.gauss(1.0, 0.02)  # Slight daily variance
        if random.random() < 0.1:  # 10% chance of mild heat stress day
            heat_factor *= 0.97

        day_total_eggs = 0
        day_total_mortality = 0

        # === DAILY CAGE LOG (merged production + mortality) ===
        for cage_id, house, zone, row, side, _, flock_id, active in C.HOUSING_DATA:
            birds = get_bird_count(cage_id)
            if birds <= 0:
                continue

            # -- Production --
            target_lay = get_target_lay_pct(flock_id, current_date)
            actual_lay = target_lay * heat_factor * random.gauss(1.0, 0.025)
            actual_lay = max(0, min(1.0, actual_lay))

            total_eggs = int(birds * actual_lay)
            crates = total_eggs // 30
            singles = total_eggs % 30

            # Grade breakdown
            large_pct = interpolate_breeder(age_weeks(flock_id, current_date), 3) or 0.60
            large_pct *= random.gauss(1.0, 0.03)
            cracked_pct = random.gauss(0.025, 0.008)
            cracked_pct = max(0, min(0.10, cracked_pct))
            cracked = max(0, int(total_eggs * cracked_pct))

            remaining = total_eggs - cracked
            large = max(0, int(remaining * min(0.95, large_pct)))
            medium_pct = random.uniform(0.15, 0.30)
            medium = max(0, int(remaining * medium_pct))
            small = max(0, remaining - large - medium)

            # Adjust to ensure sum = total
            grade_sum = large + medium + small + cracked
            if grade_sum != total_eggs:
                small = max(0, small + (total_eggs - grade_sum))

            # -- Mortality --
            daily_mort_rate = 0.0001 * random.gauss(1.0, 0.5)
            if random.random() < 0.05:
                daily_mort_rate *= 3

            deaths = max(0, int(birds * daily_mort_rate + random.random()))
            death_cause = ""
            disease_sub = ""
            mortality_action = ""
            if deaths > 0:
                death_cause = random.choices(
                    ["Culled", "Disease", "Injury", "Unknown"],
                    weights=[15, 25, 20, 40]
                )[0]
                if death_cause == "Disease":
                    disease_sub = random.choice(["Respiratory", "Digestive", "Other"])
                mortality_action = random.choice(["Disposed", "Disposed", "Lab sample", "Vet called"])
                _bird_counts[cage_id] = max(0, birds - deaths)
                day_total_mortality += deaths

            notes = ""
            if cracked_pct > 0.06:
                notes = "High cracked rate observed"
            if actual_lay < target_lay * 0.92:
                notes = "Below expected production" if not notes else notes + "; below expected"

            data["daily_cage_log"].append([
                current_date, cage_id, side, crates, singles,
                large, medium, small, cracked,
                deaths, death_cause, disease_sub, mortality_action, notes
            ])
            day_total_eggs += total_eggs

        total_eggs_by_day[current_date] = day_total_eggs
        daily_mortality[current_date] = day_total_mortality

        # === ENVIRONMENTAL ===
        for house_name in ["House 1", "House 2", "House 3", "House 4", "House 5"]:
            # AM reading
            base_temp_am = random.gauss(28, 2.5)
            hours_above_31_am = max(0, random.gauss(0.5, 1.0)) if base_temp_am > 29 else 0
            # PM reading (hotter)
            base_temp_pm = base_temp_am + random.gauss(3, 1)
            hours_above_31_pm = max(0, hours_above_31_am + random.gauss(1.5, 1.0)) if base_temp_pm > 31 else hours_above_31_am
            cooling = random.choices(["Operational", "Operational", "Operational", "Degraded"], weights=[85, 5, 5, 5])[0]
            feed_refusal_am = random.choices(["Normal", "Normal", "Normal", "Low", "Full"], weights=[70, 15, 5, 5, 5])[0]
            feed_refusal_pm = random.choices(["Normal", "Normal", "Low", "Full"], weights=[70, 15, 10, 5])[0]
            water_status = random.choices(["Normal", "Normal", "Low pressure"], weights=[85, 10, 5])[0]

            data["environmental"].append([
                current_date, house_name, time(6, 0),
                round(base_temp_am, 1), round(hours_above_31_am, 1),
                cooling, feed_refusal_am, feed_refusal_pm,
                f"Row {random.randint(1,3)} troughs {random.randint(1,4)},{random.randint(5,8)},{random.randint(9,12)}",
                water_status, ""
            ])
            data["environmental"].append([
                current_date, house_name, time(14, 0),
                round(base_temp_pm, 1), round(hours_above_31_pm, 1),
                cooling, feed_refusal_am, feed_refusal_pm,
                f"Row {random.randint(1,3)} troughs {random.randint(1,4)},{random.randint(5,8)}",
                water_status, ""
            ])

        # === FEED CONSUMPTION ===
        for flock_id in ["FL2024A", "FL2024B"]:
            flock_birds = get_flock_bird_count(flock_id)
            if flock_birds <= 0:
                continue
            target_feed_g = get_target_feed_g(flock_id, current_date)
            feed_type = "FF001" if age_weeks(flock_id, current_date) <= 45 else "FF002"

            for round_name, pct in [("AM-40%", 0.40), ("PM-30%", 0.30), ("EVE-30%", 0.30)]:
                expected_kg = flock_birds * target_feed_g / 1000 * pct
                actual_kg = expected_kg * random.gauss(1.0, 0.03)
                wasted = max(0, round(actual_kg * random.gauss(0.01, 0.005), 1))

                staff_choices = [s[0] for s in C.STAFF_DATA if s[2] == "Feed Handler"]
                issued_by = random.choice(staff_choices) if staff_choices else "STF005"
                verified_by = random.choice(["STF001", "STF002", "STF006"])

                data["feed_consumption"].append([
                    current_date, round_name, flock_id, None,
                    feed_type, round(actual_kg, 1), round(wasted, 1),
                    issued_by, verified_by, ""
                ])

        # === WATER CONSUMPTION ===
        for house_name in ["House 1", "House 2", "House 3", "House 4", "House 5"]:
            house_birds = sum(get_bird_count(c[0]) for c in C.HOUSING_DATA if c[1] == house_name)
            expected_liters = house_birds * 0.23
            am_reading = round(random.uniform(500, 1000), 0)
            daily = round(expected_liters * random.gauss(1.0, 0.08), 0)
            pm_reading = am_reading + daily

            data["water_consumption"].append([
                current_date, house_name, am_reading, pm_reading, "Flow meter", ""
            ])

        # === SALES -- 2-5 sales per day ===
        num_sales = random.randint(2, 5) if not is_weekend else random.randint(1, 3)
        available_eggs = day_total_eggs
        for _ in range(num_sales):
            if available_eggs <= 0:
                break
            customer = random.choice(C.CUSTOMER_DATA)
            cust_id = customer[0]
            cust_type = customer[2]

            if cust_type == "Wholesale":
                order_crates = random.randint(10, 40)
            elif cust_type == "Agent":
                order_crates = random.randint(8, 25)
            elif cust_type == "Regular Retail":
                order_crates = random.randint(3, 10)
            else:
                order_crates = random.randint(1, 3)

            order_eggs = order_crates * 30
            if order_eggs > available_eggs:
                order_crates = available_eggs // 30
                order_eggs = order_crates * 30
            if order_crates <= 0:
                break
            available_eggs -= order_eggs

            singles = random.choice([0, 0, 0, 0, random.randint(1, 15)])
            price_map = {
                "Wholesale": C.PRICES["egg_crate_wholesale"],
                "Agent": C.PRICES["egg_crate_wholesale"] + 1,
                "Regular Retail": C.PRICES["egg_crate_retail"],
                "Walk-in": C.PRICES["egg_crate_walkin"],
            }
            unit_price = price_map.get(cust_type, 45.0) * random.gauss(1.0, 0.02)
            unit_price = round(unit_price, 2)

            payment_method = customer[11] if len(customer) > 11 else "MoMo"
            paid = random.choices(["Paid", "Paid", "Paid", "Part-Paid", "Unpaid"],
                                  weights=[60, 15, 10, 10, 5])[0]
            evidence = f"MOMO-{random.randint(100000, 999999)}" if paid in ("Paid", "Part-Paid") and payment_method == "MoMo" else ""
            if paid in ("Paid", "Part-Paid") and payment_method == "Bank Transfer":
                evidence = f"BANK-{random.randint(10000, 99999)}"
            if paid == "Paid" and payment_method == "Cash":
                evidence = f"RCPT-{random.randint(1000, 9999)}"
            momo_verified = "Yes" if evidence.startswith("MOMO") else "N/A"
            dispatch_auth = random.choice(["STF001", "STF001", "STF006"])

            invoice_counter += 1
            data["sales"].append([
                datetime.combine(current_date, time(random.randint(7, 17), random.randint(0, 59))),
                f"INV-{invoice_counter}", cust_id, "Egg crates", "Mixed",
                order_crates, singles, unit_price, payment_method, paid,
                evidence, momo_verified, "Dispatched", dispatch_auth,
                random.choice(["STF002", "STF003", "STF006", "STF007"]),
                "", ""
            ])

        # === PROCUREMENT -- 0-3 per day ===
        num_proc = random.choices([0, 0, 1, 1, 2, 3], weights=[30, 20, 20, 15, 10, 5])[0]
        for _ in range(num_proc):
            vendor = random.choice(C.VENDOR_DATA)
            category = random.choice(["Feed ingredient", "Medication", "Fuel", "Repairs", "Supplies"])
            item_choices = {
                "Feed ingredient": [("Maize (50kg bag)", "bags", 50, C.PRICES["ING001"] * 50),
                                    ("Soya meal (50kg bag)", "bags", 10, C.PRICES["ING002"] * 50),
                                    ("Wheat bran (50kg bag)", "bags", 20, C.PRICES["ING003"] * 50)],
                "Medication": [("Oxytetracycline", "bottles", 2, 35), ("Vitamin supplement", "bottles", 3, 25)],
                "Fuel": [("Diesel (liters)", "liters", random.randint(20, 60), C.PRICES["FUL001"])],
                "Repairs": [("Fan belt replacement", "units", 1, random.uniform(80, 200))],
                "Supplies": [("Egg trays (pack)", "units", random.randint(50, 200), 1.50)],
            }
            item_info = random.choice(item_choices.get(category, item_choices["Supplies"]))
            item_desc, unit, qty, unit_cost = item_info
            total = round(qty * unit_cost, 2)

            payment_method = random.choice(["MoMo", "MoMo", "Bank Transfer", "Cash"])
            pay_ref = f"MOMO-{random.randint(100000, 999999)}" if payment_method == "MoMo" else f"REF-{random.randint(10000, 99999)}"
            proc_counter += 1
            approval = "Not Required" if total < C.THRESHOLDS["procurement_approval_threshold"] else random.choice(["Approved", "Pending"])
            approved_by = "STF001" if approval == "Approved" else ""
            requested_by = random.choice(["STF002", "STF003", "STF005", "STF006"])

            data["procurement"].append([
                datetime.combine(current_date, time(random.randint(8, 16), random.randint(0, 59))),
                vendor[0], category, item_desc, qty, unit, round(unit_cost, 2),
                None,  # Total = formula
                payment_method, pay_ref, f"PRC-{proc_counter}",
                requested_by, approval, approved_by,
                None,  # Approval date
                "Yes", random.choice(["STF001", "STF002", "STF006"]),
                None,  # Price benchmark = formula
                ""
            ])

        # === INGREDIENT MOVEMENT -- receipts + issues ===
        if random.random() < 0.3:
            item = random.choice(C.ITEM_DATA[:10])
            qty = random.randint(100, 1000)
            price = C.PRICES.get(item[0], 5.0) * random.gauss(1.0, 0.05)
            vendor_id = item[8] or "V001"
            data["ingredient_movement"].append([
                current_date, item[0], "Received", round(qty, 1),
                qty // (item[3] if isinstance(item[3], int) and item[3] else 50) if item[3] and isinstance(item[3], int) and item[3] > 0 else None,
                vendor_id, f"LOT-{random.randint(1000, 9999)}",
                round(price, 2), f"INV-V{random.randint(1000, 9999)}",
                "Yes", random.choice(["STF005", "STF009"]),
                random.choice(["STF001", "STF002"]), ""
            ])

        # === FEED MIXING -- 1-2 batches every 2-3 days ===
        if day_offset % 3 == 0:
            batch_counter += 1
            formula_id = "FRM001"
            output_kg = random.gauss(500, 50)
            output_bags = output_kg / 50

            batch_header = [
                f"BM-{batch_counter}", current_date, "Layer Mash A (self-milled)",
                formula_id, round(output_kg, 1), round(output_bags, 1),
                random.choice(["STF005", "STF009"]),
                "Yes", "Yes", "Pass", ""
            ]
            data["feed_mixing"].append(batch_header)

        # === EQUIPMENT -- mostly green, occasional issues ===
        if random.random() < 0.15:
            equip = random.choice(C.EQUIPMENT_LIST)
            status = random.choices(["Green", "Yellow", "Red"], weights=[60, 30, 10])[0]
            downtime = 0 if status == "Green" else random.uniform(0.5, 4) if status == "Yellow" else random.uniform(2, 12)
            cause = random.choice(["Mechanical failure", "Electrical failure", "Wear-and-tear"]) if status != "Green" else ""
            impact = "None" if status == "Green" else random.choice(["Minor", "Minor", "Major"])
            resolution = "Resolved" if status == "Green" else random.choice(["Resolved", "In-progress"])
            cost = round(random.uniform(50, 500), 2) if status != "Green" else 0

            data["equipment"].append([
                datetime.combine(current_date, time(random.randint(6, 18), 0)),
                equip, "House 1", status, round(downtime, 1),
                None, None,  # Downtime start/end
                cause, impact, "" if status == "Green" else "Belt replaced" if "belt" in equip.lower() else "Repaired",
                resolution, cost,
                "Maintenance Tech", "Yes" if status == "Red" else "No",
                "Yes" if status == "Red" else "No", ""
            ])

        # === BIOSECURITY CHECKLIST -- daily ===
        checks = []
        for _ in range(9):
            checks.append(random.choices(["Yes", "Yes", "Yes", "No"], weights=[90, 5, 3, 2])[0])
        supervisor = "STF001" if team_on_duty == "Team A" else "STF006"
        data["biosecurity"].append([current_date] + checks + [supervisor, ""])

        # === VISITOR LOG -- 0-2 per day ===
        num_visitors = random.choices([0, 0, 1, 1, 2], weights=[40, 20, 20, 10, 10])[0]
        for _ in range(num_visitors):
            visitor_name = random.choice(["Yedent Delivery", "Vet Dr. Appiah", "WIENCO Sales Rep",
                                          "Equipment Technician", "Feed Supplier", "Government Inspector"])
            reason = "Delivery" if "Delivery" in visitor_name or "Supplier" in visitor_name else \
                     "Vet visit" if "Vet" in visitor_name else \
                     "Maintenance" if "Technician" in visitor_name else \
                     "Inspection" if "Inspector" in visitor_name else "Other"
            zone = "Zone 2 (feed/stores)" if reason == "Delivery" else \
                   "Zone 1 (birds)" if reason in ("Vet visit", "Inspection") else "Zone 3 (perimeter only)"
            time_in = time(random.randint(8, 14), random.randint(0, 59))
            time_out = time(min(23, time_in.hour + random.randint(1, 3)), random.randint(0, 59))
            disinfection = "Yes" if zone != "Zone 3 (perimeter only)" else random.choice(["Yes", "No"])
            approved_by = random.choice(["STF001", "STF006"])

            data["visitor"].append([
                datetime.combine(current_date, time_in),
                datetime.combine(current_date, time_out),
                visitor_name, "GR-" + str(random.randint(1000, 9999)),
                reason.split()[0] if " " in reason else reason,
                reason, zone, disinfection, approved_by, "", ""
            ])

        # === HEALTH INCIDENT -- rare events ===
        if random.random() < 0.08:
            cage_id = random.choice([c[0] for c in C.HOUSING_DATA])
            flock_id = get_flock_for_cage(cage_id)
            symptom = random.choice(["Respiratory", "Digestive", "Behavioral"])
            specific = random.choice([
                "Mild coughing in 2-3 birds",
                "Watery droppings in corner section",
                "Reduced activity, huddling behavior",
                "Slight nasal discharge in morning",
            ])
            severity = random.choices([1, 2, 2, 3], weights=[30, 40, 20, 10])[0]
            birds_affected = random.randint(1, 8)
            action = random.choice(["Monitoring", "Monitoring", "Treated", "Isolated"])

            data["health_incident"].append([
                datetime.combine(current_date, time(random.randint(6, 16), random.randint(0, 59))),
                cage_id, symptom, specific, severity, birds_affected,
                "Yes" if severity >= 3 else "No",
                "No", "", action, "No", "", "Open", ""
            ])

        # === MEDICATION -- periodic ===
        if day_offset in (0, 14):
            for flock_id in ["FL2024A", "FL2024B"]:
                flock_birds = get_flock_bird_count(flock_id)
                data["medication"].append([
                    current_date, "Supplement", "MED004", "5ml per 10L water",
                    "Drinking water", flock_id, flock_birds,
                    random.choice(["STF002", "STF006"]), "No",
                    f"LOT-VIT-{random.randint(100, 999)}", 0,
                    current_date + timedelta(days=14), ""
                ])
        if day_offset == 7:
            for flock_id in ["FL2024A", "FL2024B"]:
                flock_birds = get_flock_bird_count(flock_id)
                data["medication"].append([
                    current_date, "Vaccination", "MED001", "1 dose per bird via eye drop",
                    "Drinking water", flock_id, flock_birds,
                    random.choice(["STF002", "STF006"]), "Yes",
                    f"LOT-NDV-{random.randint(100, 999)}", 0,
                    None, ""
                ])

        # === LABOR ===
        for staff in C.STAFF_DATA:
            staff_id, name, role, team, _, _, status = staff
            if status != "Active":
                continue
            if team in ("Team A", "Team B") and team != team_on_duty:
                present = False
            elif is_weekend and team != "Non-rotating" and team != "Management":
                present = random.random() < 0.3
            else:
                present = random.random() < 0.95

            arrival = time(random.randint(5, 7), random.randint(0, 30)) if present else None
            tasks_assigned = random.randint(3, 6)
            tasks_completed = min(tasks_assigned, tasks_assigned - random.choices([0, 0, 0, 1], weights=[80, 10, 5, 5])[0]) if present else 0
            violation = "None"
            if present and arrival and arrival.hour >= 7:
                violation = "Late arrival"
            strike = "None"

            data["labor"].append([
                current_date, staff_id, team, "Day" if present else "Off-rotation",
                "Yes" if present else "No",
                arrival, tasks_assigned if present else 0, tasks_completed,
                random.choice(["STF001", "STF006"]) if present else "",
                violation, strike, "", ""
            ])

        # === INVENTORY COUNT -- weekly + random ===
        if day_of_week == 4:
            items_to_count = random.sample(C.ITEM_DATA[:10], min(3, len(C.ITEM_DATA[:10])))
            for item in items_to_count:
                expected = random.randint(100, 2000)
                variance_pct = random.gauss(0, 0.03)
                physical = max(0, int(expected * (1 + variance_pct)))
                explanation = "" if abs(physical - expected) / max(expected, 1) < 0.02 else "Minor counting variance"
                counted_by = random.choice(["STF003", "STF007", "STF004"])
                verified_by = random.choice(["STF001", "STF002", "STF006"])

                data["inventory_count"].append([
                    current_date, "Scheduled", item[0], item[8] if item[8] else "Main Store",
                    expected, physical, None, None,  # Variance + pct = formulas
                    explanation, counted_by, verified_by,
                    verified_by if abs(physical - expected) > expected * 0.05 else "", ""
                ])

    return data
