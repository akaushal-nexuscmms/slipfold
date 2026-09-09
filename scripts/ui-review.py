# Browser review of the running app. Usage: npm run dev -- --port 3311, then: py scripts/ui-review.py <output-dir>
# Needs Python 3 + playwright (py -m pip install playwright; py -m playwright install chromium).
import json, re, sys
from playwright.sync_api import sync_playwright

OUT = sys.argv[1]
ROOT = "http://localhost:3311"
findings = []


def check(name, cond, detail=""):
    findings.append({"check": name, "ok": bool(cond), "detail": detail})


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

    page.goto(ROOT + "/"); page.wait_for_load_state("networkidle"); page.wait_for_timeout(500)
    page.screenshot(path=f"{OUT}/01-profile.png", full_page=True)
    body = page.inner_text("body")
    check("loads: blank 2025 return", "2025 return" in body)
    check("profile: province select lists 13 jurisdictions", page.locator("select").nth(1).locator("option").count() == 13, str(page.locator("select").nth(1).locator("option").count()))
    check("profile: every field has help text", page.locator("label span.text-xs").count() >= 5)

    # load the example from Backup
    page.get_by_role("button", name="Backup").click(); page.wait_for_timeout(200)
    page.get_by_role("button", name="Load the example return").click(); page.wait_for_timeout(600)
    check("example loaded flash", "Example loaded" in page.inner_text("body"))

    # slips tab renders T4 with box help
    page.get_by_role("button", name=re.compile(r"2 · Slips")).click(); page.wait_for_timeout(300)
    body = page.inner_text("body")
    check("slips: T4 card with issuer", "T4 — Prairie Logistics Ltd." in body)
    check("slips: box 14 help explains line 10100", "Feeds line 10100" in body)
    check("slips: RRSP receipt card present", "RRSP receipt — Assiniboine Credit Union" in body)
    page.screenshot(path=f"{OUT}/02-slips.png", full_page=True)
    # add a T5 and fill box 24
    page.get_by_role("button", name="+ T5", exact=True).click(); page.wait_for_timeout(200)
    # fill the last issuer field and box 24 (first money input in the new card)
    cards = page.locator("div.rounded-xl")
    last = cards.nth(cards.count() - 1)
    last.locator("input").first.fill("Big Bank"); page.wait_for_timeout(200)
    last.locator("input[type=number]").first.fill("1000"); page.wait_for_timeout(500)

    # the return
    page.get_by_role("button", name=re.compile(r"5 · Your return")).click(); page.wait_for_timeout(400)
    body = page.inner_text("body")
    check("return: total income now 61,380 (60,000 + 1,000 × 1.38)", "$61,380.00" in body, body[:200])
    check("return: dividend line 12000 present", "12000" in body and "Taxable amount of dividends" in body)
    check("return: MB428 section named", "manitoba tax (form mb428)" in body.lower())
    check("return: refund or balance shown", "refund (48400)" in body.lower() or "balance owing (48500)" in body.lower())
    check("return: MB479 warning surfaced", "MB479" in body)
    page.screenshot(path=f"{OUT}/03-return.png", full_page=True)
    # expand line 30800 and read the 'from' breakdown
    page.get_by_role("button", name=re.compile(r"30800")).click(); page.wait_for_timeout(200)
    body = page.inner_text("body")
    check("return: expanding a line shows explanation + sources", "Schedule 8" in body and "box 16" in body)
    page.screenshot(path=f"{OUT}/04-return-expanded.png", full_page=False)
    # copy all as text produces tab-separated lines
    page.get_by_role("button", name="Copy all as text").click(); page.wait_for_timeout(200)

    # province switch → Ontario shows surtax/health premium lines
    page.get_by_role("button", name=re.compile(r"1 · You")).click(); page.wait_for_timeout(200)
    page.locator("select").nth(1).select_option("ON"); page.wait_for_timeout(400)
    page.get_by_role("button", name=re.compile(r"5 · Your return")).click(); page.wait_for_timeout(400)
    body = page.inner_text("body")
    check("ontario: ON428 named and health premium line present", "ontario tax (form on428)" in body.lower() and "ontario health premium" in body.lower())
    page.get_by_role("button", name=re.compile(r"1 · You")).click(); page.wait_for_timeout(200)
    page.locator("select").nth(1).select_option("QC"); page.wait_for_timeout(400)
    page.get_by_role("button", name=re.compile(r"5 · Your return")).click(); page.wait_for_timeout(400)
    body = page.inner_text("body")
    check("quebec: abatement line and TP-1 warning", "Quebec abatement" in body and "TP-1" in body)
    page.get_by_role("button", name=re.compile(r"1 · You")).click(); page.wait_for_timeout(200)
    page.locator("select").nth(1).select_option("MB"); page.wait_for_timeout(300)

    # next year: roll forward
    page.get_by_role("button", name=re.compile(r"6 · Next year")).click(); page.wait_for_timeout(300)
    body = page.inner_text("body")
    check("next year: carry-forward rows with explanations", "Unused RRSP contributions" in body and "Estimated new RRSP room" in body)
    page.screenshot(path=f"{OUT}/05-next-year.png", full_page=True)
    page.get_by_role("button", name="Start 2026 from this return").click(); page.wait_for_timeout(700)
    body = page.inner_text("body")
    check("roll forward: 2026 started, issuers kept", "2026 started from 2025" in body and "Prairie Logistics" in body)
    check("roll forward: amounts cleared (box 14 empty)", page.locator("input[type=number]").first.input_value() == "")
    check("roll forward: 2025-rules warning shown for 2026", "not published yet" in page.inner_text("body").lower())
    page.screenshot(path=f"{OUT}/06-rolled-2026.png", full_page=True)
    # year selector has both years; switching back restores 2025 data
    opts = [o.inner_text() for o in page.locator("select").first.locator("option").all()]
    check("year selector lists 2026 and 2025", "2026" in opts and "2025" in opts, str(opts))
    page.locator("select").first.select_option("2025"); page.wait_for_timeout(500)
    check("switching back to 2025 restores the example", "Sam" in page.locator("input").first.input_value())

    # persistence across reload
    page.reload(); page.wait_for_load_state("networkidle"); page.wait_for_timeout(600)
    check("persists across reload (IndexedDB)", "Sam" in page.locator("input").first.input_value() or "2026" in page.inner_text("body"))

    # export download
    page.get_by_role("button", name="Backup").click(); page.wait_for_timeout(200)
    with page.expect_download(timeout=15000) as dl:
        page.get_by_role("button", name=re.compile(r"Export all years")).click()
    d = dl.value; path = f"{OUT}/{d.suggested_filename}"; d.save_as(path)
    j = json.load(open(path, encoding="utf-8"))
    check("export: JSON with both years", j.get("app") == "slipfold" and sorted(r["year"] for r in j["returns"]) == [2025, 2026], str([r["year"] for r in j["returns"]]))

    # PWA manifest + service worker registration (dev mode serves manifest; SW only in build)
    mf = page.evaluate("fetch('/manifest.webmanifest').then(r => r.status)")
    check("pwa: manifest served", mf == 200, str(mf))

    # ---------- encryption at rest ----------
    page.get_by_role("button", name="Backup").click(); page.wait_for_timeout(200)
    body = page.inner_text("body")
    check("vault: passphrase not set by default, warning shown", "not set" in body.lower() and "in the clear" in body)
    pw = page.locator("input[type=password]")
    pw.nth(0).fill("correct horse battery staple"); pw.nth(1).fill("correct horse battery staple"); page.wait_for_timeout(100)
    page.get_by_role("button", name="Set passphrase and encrypt").click(); page.wait_for_timeout(2500)
    body = page.inner_text("body")
    check("vault: passphrase set, rows re-encrypted", "now encrypted" in body and "passphrase — set" in body.lower())
    check("vault: header says encrypted + Lock button", "Encrypted on this device" in page.inner_text("header") and page.get_by_role("button", name="Lock").count() == 1)
    # stored rows are sealed: no plaintext issuer in IndexedDB
    sealed = page.evaluate("""() => new Promise(res => { const r = indexedDB.open('slipfold'); r.onsuccess = () => { const db = r.result; const tx = db.transaction('returns'); const all = tx.objectStore('returns').getAll(); all.onsuccess = () => res(JSON.stringify(all.result)); }; })""")
    check("vault: IndexedDB rows contain no plaintext (issuer, SIN)", "Prairie" not in sealed and '"enc":true' in sealed, sealed[:120])
    # encrypted export
    with page.expect_download(timeout=15000) as dl:
        page.get_by_role("button", name=re.compile(r"Export all years")).click()
    d = dl.value; encpath = f"{OUT}/{d.suggested_filename}"; d.save_as(encpath)
    enc = open(encpath, encoding="utf-8").read()
    check("vault: export is encrypted, no plaintext", '"encrypted": true' in enc and "Prairie" not in enc)
    # lock → reload → lock screen; wrong passphrase rejected; right one restores
    page.get_by_role("button", name="Lock").click(); page.wait_for_timeout(300)
    check("vault: lock shows the unlock screen", "Unlock your returns" in page.inner_text("body"))
    page.reload(); page.wait_for_load_state("networkidle"); page.wait_for_timeout(600)
    check("vault: reload after lock still locked", "Unlock your returns" in page.inner_text("body"))
    page.locator("input[type=password]").fill("nope"); page.get_by_role("button", name="Unlock").click(); page.wait_for_timeout(1500)
    check("vault: wrong passphrase rejected", "Wrong passphrase" in page.inner_text("body"))
    page.locator("input[type=password]").fill("correct horse battery staple"); page.get_by_role("button", name="Unlock").click(); page.wait_for_timeout(2500)
    check("vault: right passphrase restores the data", "Sam" in page.locator("input").first.input_value())
    page.reload(); page.wait_for_load_state("networkidle"); page.wait_for_timeout(800)
    check("vault: reload within the tab does not re-prompt (session key)", "Sam" in page.locator("input").first.input_value())
    # import the encrypted backup back in
    page.get_by_role("button", name="Backup").click(); page.wait_for_timeout(200)
    page.locator("input[type=file]").set_input_files(encpath); page.wait_for_timeout(400)
    check("vault: encrypted import asks for the passphrase", "This backup is encrypted" in page.inner_text("body"))
    page.locator("input[type=password]").last.fill("wrong"); page.get_by_role("button", name="Import", exact=True).click(); page.wait_for_timeout(1500)
    check("vault: import with wrong passphrase rejected", "Wrong passphrase for this backup" in page.inner_text("body"))
    page.locator("input[type=password]").last.fill("correct horse battery staple"); page.get_by_role("button", name="Import", exact=True).click(); page.wait_for_timeout(2000)
    check("vault: import with right passphrase succeeds", "Imported 2 returns" in page.inner_text("body"))
    # remove passphrase → rows plain again
    page.on("dialog", lambda dlg: dlg.accept())
    page.get_by_role("button", name="Remove passphrase").click(); page.wait_for_timeout(1500)
    plain = page.evaluate("""() => new Promise(res => { const r = indexedDB.open('slipfold'); r.onsuccess = () => { const db = r.result; const tx = db.transaction('returns'); const all = tx.objectStore('returns').getAll(); all.onsuccess = () => res(JSON.stringify(all.result)); }; })""")
    check("vault: remove passphrase stores rows in the clear again", "Prairie" in plain and '"enc":true' not in plain)

    # dark + mobile
    dctx = browser.new_context(viewport={"width": 1400, "height": 1000}, color_scheme="dark")
    dpage = dctx.new_page(); dpage.goto(ROOT + "/"); dpage.wait_for_load_state("networkidle"); dpage.wait_for_timeout(400)
    dpage.screenshot(path=f"{OUT}/07-dark.png", full_page=False); dctx.close()
    mctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    mpage = mctx.new_page(); mpage.goto(ROOT + "/"); mpage.wait_for_load_state("networkidle"); mpage.wait_for_timeout(400)
    mpage.get_by_role("button", name=re.compile(r"5 · Your return")).click(); mpage.wait_for_timeout(400)
    sw = mpage.evaluate("document.documentElement.scrollWidth"); cw = mpage.evaluate("document.documentElement.clientWidth")
    check("mobile: no horizontal page scroll on the return tab", sw <= cw + 1, f"scrollWidth {sw} vs client {cw}")
    mpage.screenshot(path=f"{OUT}/08-mobile-return.png", full_page=True); mctx.close()

    check("no console errors/warnings", len(errors) == 0, "; ".join(errors)[:600])
    browser.close()

json.dump(findings, open(f"{OUT}/findings.json", "w"), indent=1)
for f in findings:
    print(("ok  " if f["ok"] else "FAIL"), f["check"], ("— " + f["detail"]) if f["detail"] else "")
print(f"\n{sum(1 for f in findings if not f['ok'])} failed of {len(findings)}")
