---
name: download-rogers-bill
description: Navigate to MyRogers and download bill PDFs
category: tax/bills/telecom
preconditions: Must be logged into rogers.com (use bridge mode)
parameters:
  - billing_periods: list of dates to check (e.g. "January 24, 2026", "February 24, 2026")
output: PDF files downloaded to browser's default download folder
---

# Download Rogers Bill

Navigates to MyRogers self-serve billing page, opens the Save PDF modal,
selects the requested billing periods, and triggers the download.

The agent should:
1. Run the .pw script to navigate to the billing page
2. Read the snapshot to see available billing periods
3. Check the requested periods
4. Click "Download bills"

Note: The latest billing period is pre-checked by default.
