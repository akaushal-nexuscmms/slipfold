# Independent cross-check source: EY's public 2025 personal tax calculator. For each income it
# reports total tax payable per province for an employee with only the basic credits.
# Usage: py scripts/ey-scrape.py <out.json>   (needs playwright)
import json, re, sys
from playwright.sync_api import sync_playwright

OUT = sys.argv[1]
INCOMES = [30000, 60000, 90000, 150000, 300000]
CODES: list[str] = []  # discovered from the page: every input named <code>_taxpay
rows = {}
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1300, "height": 1000})
    pg.goto("https://www.eytaxcalculators.com/en/2025-personal-tax-calculator.html", timeout=60000)
    pg.wait_for_load_state("domcontentloaded"); pg.wait_for_timeout(2000)
    CODES[:] = [n[: -len("_taxpay")] for n in [i.get_attribute("name") or "" for i in pg.locator("input").all()] if n.endswith("_taxpay")]
    print("codes:", CODES)
    notes = pg.inner_text("body")
    m = re.search(r"(Assumptions|assumes?|The calculator)[^\n]{0,400}", notes)
    print("page note:", m.group(0)[:400] if m else "(none found)")
    for inc in INCOMES:
        box = pg.locator("input[name=income]")
        box.fill(""); box.fill(str(inc)); box.press("Enter"); pg.wait_for_timeout(1200)
        # some versions need a blur/click to recalc
        pg.locator("body").click(); pg.wait_for_timeout(600)
        rows[inc] = {}
        for c in CODES:
            v = pg.locator(f"input[name={c}_taxpay]").input_value()
            mr = pg.locator(f"input[name={c}_margrate]").input_value()
            rows[inc][c.upper()] = {"taxpay": float(re.sub(r"[^\d.]", "", v) or 0), "marginal": mr}
        print(inc, {k: v["taxpay"] for k, v in rows[inc].items()})
    b.close()
json.dump(rows, open(OUT, "w"), indent=1)
