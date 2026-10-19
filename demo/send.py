"""Send demo traffic to the API and summarise /stats. Standard library only.

Texts were written for this demo (not taken from the dataset) and scored against model v1.0.0:
CONFIDENT texts score >= 0.93, AMBIGUOUS ones <= 0.88, so each group lands clearly on its side
of the 0.9 review threshold despite small run-to-run variations.

Usage (normally through ../demo.sh):
  python3 demo/send.py traffic|drift|review [count]
  python3 demo/send.py stats|alerts
"""

import json
import os
from functools import cache
import random
import sys
import urllib.error
import urllib.request
from pathlib import Path

# Confident texts by the category the model predicts for them
CONFIDENT = {
    "General Case": ["Number of hospital days", "Change from baseline in HbA1c at week 24",
                     "Patient satisfaction", "Duration of treatment"],
    "COA Tool": ["Global impression of change"],
    "Pharmacokinetic": ["Maximum plasma concentration (Cmax)", "Area under the concentration-time curve (AUC)",
                        "Time to maximum concentration (Tmax)", "Terminal elimination half-life",
                        "Apparent clearance (CL/F)", "Volume of distribution at steady state",
                        "Trough plasma concentration at week 12", "Renal clearance of the study drug",
                        "Bioavailability of the oral formulation"],
    "Adverse Event": ["Incidence of treatment-emergent adverse events", "Incidence of serious adverse events",
                      "Number of participants with injection site reactions"],
    "Complications": ["Incidence of diabetic ketoacidosis"],
    "Immunogenicity": ["Incidence of anti-drug antibodies", "Neutralizing antibody titers"],
    "Cost": ["Total healthcare costs per patient"],
    "Mortality": ["All-cause mortality at 12 months", "Cardiovascular death"],
    "Demographic": ["Age at enrollment", "Sex distribution of participants", "Race and ethnicity of participants"],
}
# Ambiguous texts (needs_review), by the category the model predicts for them
AMBIGUOUS = {
    "General Case": ["Number of participants", "Pain score", "Body weight", "Something completely random",
                     "Laboratory values", "Sleep quality", "Number of visits", "Weight of evidence",
                     "Rate of severe hypoglycaemia episodes"],
    "Pharmacokinetic": ["Time to first exacerbation", "Proportion of responders"],
    "Complications": ["Change from baseline in systolic blood pressure"],
}
# In normal traffic, the chance that a text of these categories is an ambiguous one. With the
# baseline's category shares, this gives about 39% needing review, like the Part 2 test set.
AMBIGUOUS_CHANCE = {"General Case": 1.0, "Pharmacokinetic": 0.5, "Complications": 0.4}
# drift: 400 pharmacokinetic texts move a full window of normal traffic (1000) to "significant"
DEFAULT_COUNT = {"traffic": 100, "drift": 400, "review": 60}

API = f"http://127.0.0.1:{os.environ.get('API_PORT', '8000')}"
ENV_FILE = Path(__file__).resolve().parent.parent / "api" / ".env"


def api_key():
    for line in ENV_FILE.read_text().splitlines():
        if line.startswith("API_KEY="):
            return line.split("=", 1)[1]
    sys.exit(f"No API_KEY in {ENV_FILE}: run api/setup.sh first")


def call(path, body=None):
    request = urllib.request.Request(API + path, data=json.dumps(body).encode() if body else None,
                                     headers={"X-API-Key": api_key(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)
    except urllib.error.URLError as e:
        sys.exit(f"Can't reach the API at {API} ({e.reason}). Is it running?")


@cache
def baseline_shares():
    return call("/model")[1]["baseline"]["category_shares"]["values"]


def pick(scenario):
    if scenario == "review":
        return random.choice([t for texts in AMBIGUOUS.values() for t in texts])
    if scenario == "drift":
        return random.choice(CONFIDENT["Pharmacokinetic"])
    # Normal traffic: categories and confidence in the proportions of the model's baseline,
    # so it shows no drift
    baseline = baseline_shares()
    category = random.choices(list(baseline), weights=list(baseline.values()))[0]
    if random.random() < AMBIGUOUS_CHANCE.get(category, 0):
        return random.choice(AMBIGUOUS[category])
    return random.choice(CONFIDENT[category])


def send(scenario, count):
    picks = [pick(scenario) for _ in range(count)]
    sent = flagged = failed = 0
    for i in range(0, count, 20):                      # 20 texts per request, like a client batching
        batch = picks[i:i + 20]
        status, body = call("/predict", {"texts": batch})
        if status != 200:
            failed += len(batch)
            print(f"  HTTP {status}: {body.get('detail')}")
            continue
        sent += len(batch)
        flagged += sum(p["needs_review"] for p in body["predictions"])
    print(f"{scenario}: {sent} predictions, {flagged} flagged for review"
          + (f", {failed} failed" if failed else ""))


def stats():
    status, s = call("/stats")
    if status != 200:
        sys.exit(f"/stats returned HTTP {status}")
    print(f"/stats: window {s['window']['size']}/{s['window']['capacity']}", end="")
    if s["review_rate"] is not None:
        print(f", review rate {s['review_rate']:.0%} (baseline {s['baseline_review_rate']:.0%})", end="")
    print()
    if s["drift"]:
        for name, d in s["drift"].items():
            print(f"  {name:10s} drift: {d['status']} (PSI {d['psi']:.2f})")
    else:
        print("  drift: not enough predictions yet (100 needed)")


def alerts():
    url = f"http://127.0.0.1:{os.environ.get('PROMETHEUS_PORT', '9090')}/api/v1/alerts"
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            active = json.load(response)["data"]["alerts"]
    except urllib.error.URLError:
        print("alerts: Prometheus not reachable")
        return
    print("alerts:", ", ".join(f"{a['labels']['alertname']} ({a['state']})" for a in active) or "none")


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else None
    if command == "stats":
        stats()
    elif command == "alerts":
        alerts()
    elif command in DEFAULT_COUNT:
        send(command, int(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_COUNT[command])
    else:
        sys.exit(__doc__)
