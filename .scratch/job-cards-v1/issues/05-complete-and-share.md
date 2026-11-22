# 05: Complete and share

**What to build:** Marking a Job Card Complete builds the Job Card PDF and opens the phone's share menu, so it can be emailed from iPhone and Android.

**Blocked by:** 04

**Status:** blocked

- [ ] "Complete and share" sets Status Complete and `completed_at`, written to the Audit Log, then builds the PDF.
- [ ] The PDF matches the paper card: Com-Install logo, JOB CARD title, REG / DATE / CUSTOMER / MILEAGE grid, lined Work Carried Out, QTY / PART / PART NO. table, footer; long text continues on further pages.
- [ ] The PDF is named `Job Card <REG> <dd-mm-yyyy>.pdf`.
- [ ] On a phone with Web Share file support the share menu opens with the PDF attached and a subject of `Job Card – <REG> – <date>`; otherwise a "Your PDF is ready" panel offers Open PDF.
- [ ] "Share PDF again" and "Download PDF" are on every Complete Job Card.
- [ ] The PDF route returns 404 for another Engineer's Job Card.
- [ ] Unit test for the PDF (text present, page count for long input); e2e for the Complete flow.
