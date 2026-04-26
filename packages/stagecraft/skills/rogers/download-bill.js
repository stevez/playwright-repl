/**
 * Download Rogers bill PDFs for specified billing periods.
 *
 * @param {import('playwright').Page} page
 * @param {string[]} periods - Billing period labels, e.g. ["January 24, 2026", "February 24, 2026"]
 */
async function downloadRogersBill(page, periods) {
  await page.goto('https://www.rogers.com/consumer/self-serve/overview');
  await page.getByText('View your bill').filter({ visible: true }).first().click();
  await page.getByText('Save PDF').click();

  for (const period of periods) {
    await page.getByText(period, { exact: true }).first().click();
  }

  await page.getByText('Download bills').click();
}
