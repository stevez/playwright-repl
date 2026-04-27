/**
 * Download Rogers bill PDFs for specified billing periods.
 * Uses global `page` from the service worker context.
 *
 * @param {string[]} periods - Billing period labels, e.g. ["January 24, 2026", "February 24, 2026"]
 * @param {string} [filename] - Save path relative to Downloads, e.g. "bills/rogers-2026-03.pdf"
 */
async function downloadRogersBill(periods, filename) {
  await page.goto('https://www.rogers.com/consumer/self-serve/overview', { waitUntil: 'domcontentloaded' });
  await page.getByText('View your bill').filter({ visible: true }).first().click();
  await page.getByText('Save PDF').click();

  await page.getByText('Download one or more bills').waitFor();
  for (const period of periods) {
    await page.getByRole('checkbox', { name: period }).check();
  }

  if (filename) downloadAs(filename);
  await page.getByText('Download bills').click();
  return filename || 'Downloads folder (default name)';
}
