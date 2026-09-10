# One-time preparation of the CRA fillable PDFs bundled under public/forms/<year>/.
# The CRA publishes LiveCycle (XFA) forms; pdf-lib in the browser fills the AcroForm layer,
# and viewers only show it once the XFA layer is gone. This strips XFA, sets NeedAppearances,
# and rewrites each file cleanly. Run once after downloading new forms: py scripts/clean-forms.py
import pathlib, sys
import pymupdf

root = pathlib.Path(__file__).resolve().parent.parent / "public" / "forms"
for pdf in sorted(root.glob("*/*.pdf")):
    doc = pymupdf.open(pdf)
    cat = doc.pdf_catalog()
    acro = doc.xref_get_key(cat, "AcroForm")
    if acro[0] != "xref":
        print("skip (no AcroForm):", pdf); continue
    ax = int(acro[1].split()[0])
    had = doc.xref_get_key(ax, "XFA")[0]
    doc.xref_set_key(ax, "XFA", "null")
    doc.xref_set_key(ax, "NeedAppearances", "true")
    tmp = pdf.with_suffix(".tmp.pdf")
    doc.save(tmp, garbage=4, clean=True, deflate=True)
    doc.close()
    tmp.replace(pdf)
    print(f"cleaned {pdf.relative_to(root)}: XFA was {had}, now {pdf.stat().st_size // 1024} KB")
