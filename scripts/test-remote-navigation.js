const { chromium } = require("playwright");

async function testNavigation() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    userAgent: "Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/3.0 Chrome/69.0.3497.106 TV Safari/537.36"
  });

  console.log("Navigating to TV home...");
  await page.goto("http://localhost:8080/?device=tv");
  await page.waitForTimeout(2000);

  // 1. Test Home screen grid navigation
  console.log("Testing home screen grid navigation (ArrowDown)...");
  // Check active card
  let activeCard = await page.evaluate(() => {
    const card = document.querySelector(".catalog-card.is-selected");
    return card ? card.querySelector(".catalog-card-title")?.textContent : null;
  });
  console.log("Initial selected card:", activeCard);

  // Press ArrowDown to jump to row 2
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(300);

  let activeCardRow2 = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll(".catalog-card"));
    const selected = document.querySelector(".catalog-card.is-selected");
    const idx = cards.indexOf(selected);
    return {
      index: idx,
      title: selected?.querySelector(".catalog-card-title")?.textContent
    };
  });
  console.log("After ArrowDown, selected card index (should be 5):", activeCardRow2);

  // 2. Open Detail Modal
  console.log("Pressing Enter to open detail modal...");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2500);

  // Take screenshot of opened modal
  await page.screenshot({ path: "test_tv_modal_opened.png" });

  // Check focused element inside modal
  let modalFocus = await page.evaluate(() => {
    const el = document.activeElement;
    return {
      tagName: el ? el.tagName : null,
      className: el ? el.className : null,
      text: el ? el.textContent : null
    };
  });
  console.log("Initial modal focus:", modalFocus);

  // Navigate through episodes
  console.log("Pressing ArrowRight on episodes...");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);

  let nextEpFocus = await page.evaluate(() => {
    const el = document.activeElement;
    return {
      text: el ? el.textContent : null,
      index: el ? el.dataset.epIndex : null
    };
  });
  console.log("Next episode focused:", nextEpFocus);

  // Press ArrowDown to move to row 2 of episodes
  console.log("Pressing ArrowDown on episodes...");
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(200);

  let row2EpFocus = await page.evaluate(() => {
    const el = document.activeElement;
    return {
      text: el ? el.textContent : null,
      index: el ? el.dataset.epIndex : null
    };
  });
  console.log("Row 2 episode focused:", row2EpFocus);

  // Close modal via Escape / Back
  console.log("Pressing Escape to close modal...");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1000);

  let isModalClosed = await page.evaluate(() => {
    return !document.querySelector(".movie-detail-overlay");
  });
  console.log("Is modal closed?", isModalClosed);

  await page.screenshot({ path: "test_tv_after_close.png" });
  await browser.close();
  console.log("Remote navigation test completed successfully!");
}

testNavigation().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
