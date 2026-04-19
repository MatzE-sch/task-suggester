#!/usr/bin/env python3
"""One-time import of recurring tasks from old JSON export."""
import sys
import math
import requests
from datetime import datetime, timezone, timedelta

TOKEN = sys.argv[1] if len(sys.argv) > 1 else input("Token: ").strip()
BASE = "http://localhost:8000"

ENTRIES = [
    {"id":2,"name":"Obst essen","frequency_num":"2","frequency_unit":"86400000","timestamp":1775770847978},
    {"id":4,"name":"eltern anrufen","frequency_num":"2","frequency_unit":"604800000","timestamp":1772142632506},
    {"id":6,"name":"Jmd was schenken","frequency_num":"1","frequency_unit":"2629743765.8399997","timestamp":1766827317236},
    {"id":8,"name":"Handy backup","frequency_num":"1","frequency_unit":"2629743765.8399997","timestamp":1772142637635},
    {"id":9,"name":"Pc Backup","frequency_num":"1","frequency_unit":"2629743765.8399997","timestamp":1772142646381},
    {"id":11,"name":"Konto checken","frequency_num":"1","frequency_unit":"2629743765.8399997","timestamp":1772142639214},
    {"id":12,"name":"Sport","frequency_num":"1.5","frequency_unit":"604800000","timestamp":1766827329930},
    {"id":13,"name":"Waschen","frequency_num":"1","frequency_unit":"604800000","timestamp":1776277598688},
    {"id":15,"name":"Einkaufen","frequency_num":"1","frequency_unit":"604800000","timestamp":1772142624379},
    {"id":10,"name":"Openlab","frequency_num":"2","frequency_unit":"604800000","timestamp":1776423431220},
    {"id":14,"name":"Müll runter bringen","frequency_num":"1","frequency_unit":"604800000","timestamp":1772142625785},
    {"id":16,"name":"Rasieren","frequency_num":"3","frequency_unit":"86400000","timestamp":1775770867128},
    {"id":18,"name":"Was neues","frequency_num":"1","frequency_unit":"2629743765.8399997","timestamp":1772142621094},
    {"id":19,"name":"Susi webseiten update","frequency_num":"1","frequency_unit":"2629743765.8399997","timestamp":1776277613580},
    {"id":20,"name":"bettwäsche","frequency_num":"1","frequency_unit":"2629743765.8399997","timestamp":1763727638684},
    {"id":21,"name":"zahnseide","frequency_num":"1","frequency_unit":"2629743765.8399997","timestamp":1766827345353},
    {"id":22,"name":"Nägel schneiden","frequency_num":"4","frequency_unit":"86400000","timestamp":1776277595789},
    {"id":23,"name":"Mit neuen leuten reden","frequency_num":"1","frequency_unit":"2629743765.8399997","timestamp":1776277606279},
    {"id":26,"name":"elmex gelee","frequency_num":"1","frequency_unit":"604800000","timestamp":1776593487712},
    {"id":27,"name":"kalender abstimmen","frequency_num":"1","frequency_unit":"604800000","timestamp":1772142613827},
    {"id":28,"name":"Friseur","frequency_num":"3","frequency_unit":"2629743765.8399997","timestamp":1772142644729},
    {"id":29,"name":"putzen","frequency_num":"4","frequency_unit":"86400000","timestamp":1775770902909},
    {"id":30,"name":"musik machen","frequency_num":"14","frequency_unit":"86400000","timestamp":1776423423340},
]

headers = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

for e in ENTRIES:
    freq_ms = float(e["frequency_num"]) * float(e["frequency_unit"])
    recurrence_days = round(freq_ms / 86400000)
    if recurrence_days < 1:
        print(f"  skip {e['name']!r} (recurrence < 1 day)")
        continue

    last_done = datetime.fromtimestamp(e["timestamp"] / 1000, tz=timezone.utc)
    snoozed_until = last_done + timedelta(days=recurrence_days)

    payload = {
        "title": e["name"].strip(),
        "task_type": "recurring",
        "recurrence_days": recurrence_days,
        "category_ids": [],
        "dependency_ids": [],
    }

    # Create task
    r = requests.post(f"{BASE}/tasks", json=payload, headers=headers)
    if not r.ok:
        print(f"  ERROR creating {e['name']!r}: {r.text}")
        continue
    task_id = r.json()["id"]

    # Set snoozed_until via PATCH (status stays open, just set snooze)
    r2 = requests.patch(
        f"{BASE}/tasks/{task_id}",
        json={"snoozed_until": snoozed_until.isoformat()},
        headers=headers,
    )
    if not r2.ok:
        print(f"  WARNING: created {e['name']!r} (id={task_id}) but could not set snooze: {r2.text}")
    else:
        pct = (datetime.now(timezone.utc) - last_done).total_seconds() / (recurrence_days * 86400) * 100
        print(f"  ✓ {e['name'].strip()!r:35s} alle {recurrence_days:3d}T  {pct:5.0f}%")
