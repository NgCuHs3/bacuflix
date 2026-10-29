const { chromium } = require("playwright");

async function diagnose() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: "Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/3.0 Chrome/69.0.3497.106 TV Safari/537.36"
  });
  const page = await context.newPage();

  console.log("Navigating to http://localhost:8080/?device=tv...");
  await page.goto("http://localhost:8080/?device=tv", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // 1. Check window & root horizontal overflow
  const rootOverflow = await page.evaluate(() => {
    const docWidth = document.documentElement.scrollWidth;
    const bodyWidth = document.body.scrollWidth;
    const winWidth = window.innerWidth;
    const overflowingElements = [];

    document.querySelectorAll("*").forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.right > winWidth + 2) {
        overflowingElements.push({
          tag: el.tagName,
          className: el.className,
          right: rect.right,
          width: rect.width,
          winWidth: winWidth
        });
      }
    });

    return {
      docWidth,
      bodyWidth,
      winWidth,
      hasHorizontalOverflow: docWidth > winWidth || bodyWidth > winWidth,
      overflowingElements: overflowingElements.slice(0, 10)
    };
  });

  console.log("Root overflow check:", JSON.stringify(rootOverflow, null, 2));

  // 2. Check catalog grid row count and card widths
  const catalogMetrics = await page.evaluate(() => {
    const grid = document.querySelector(".catalog-grid");
    if (!grid) return null;
    const cards = Array.from(grid.querySelectorAll(".catalog-card"));
    if (cards.length === 0) return null;

    const firstCardTop = cards[0].getBoundingClientRect().top;
    const firstRowCards = cards.filter(c => Math.abs(c.getBoundingClientRect().top - firstCardTop) < 10);

    return {
      gridWidth: grid.clientWidth,
      cardCount: cards.length,
      cardsInFirstRow: firstRowCards.length,
      firstCardWidth: cards[0].clientWidth,
      firstCardHeight: cards[0].clientHeight
    };
  });

  console.log("Catalog metrics (TV 1080p):", JSON.stringify(catalogMetrics, null, 2));

  await page.screenshot({ path: "diagnose_tv_home.png", fullPage: false });

  // 3. Open Detail Modal for first series or movie
  console.log("Opening detail modal...");
  const opened = await page.evaluate(async () => {
    const cards = Array.from(document.querySelectorAll(".catalog-card"));
    for (const card of cards) {
      const epBadge = card.querySelector(".catalog-badge-episode");
      if (epBadge) {
        card.click();
        return { foundSeries: true, title: card.querySelector(".catalog-card-title")?.textContent };
      }
    }
    if (cards.length > 0) {
      cards[0].click();
      return { foundSeries: false, title: cards[0].querySelector(".catalog-card-title")?.textContent };
    }
    return null;
  });

  console.log("Clicked card:", opened);
  await page.waitForTimeout(3000);

  // 4. Modal inspection
  const modalMetrics = await page.evaluate(() => {
    const modal = document.querySelector(".movie-detail-modal");
    if (!modal) return { modalFound: false };

    const epGrid = modal.querySelector(".movie-detail-episodes-grid");
    const epContainer = modal.querySelector(".movie-episodes-container");
    const epBtns = epGrid ? Array.from(epGrid.querySelectorAll(".movie-episode-btn")) : [];

    let episodesInFirstRow = 0;
    if (epBtns.length > 0) {
      const firstEpTop = epBtns[0].getBoundingClientRect().top;
      episodesInFirstRow = epBtns.filter(b => Math.abs(b.getBoundingClientRect().top - firstEpTop) < 6).length;
    }

    const modalRect = modal.getBoundingClientRect();
    const epContainerRect = epContainer ? epContainer.getBoundingClientRect() : null;

    return {
      modalFound: true,
      modalRect: { width: modalRect.width, height: modalRect.height, left: modalRect.left, right: modalRect.right },
      modalScrollWidth: modal.scrollWidth,
      modalClientWidth: modal.clientWidth,
      hasModalHorizontalOverflow: modal.scrollWidth > modal.clientWidth,
      episodesTotal: epBtns.length,
      episodesInFirstRow: episodesInFirstRow,
      firstEpisodeBtn: epBtns.length > 0 ? {
        width: epBtns[0].clientWidth,
        height: epBtns[0].clientHeight,
        text: epBtns[0].textContent
      } : null,
      epContainerRect: epContainerRect ? {
        width: epContainerRect.width,
        height: epContainerRect.height,
        scrollHeight: epContainer.scrollHeight,
        clientHeight: epContainer.clientHeight
      } : null
    };
  });

  console.log("Modal metrics (TV 1080p):", JSON.stringify(modalMetrics, null, 2));

  await page.screenshot({ path: "diagnose_tv_modal.png", fullPage: false });

  // 5. Check 4K Viewport (3840x2160)
  console.log("Testing 4K (3840x2160)...");
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.waitForTimeout(1000);

  const metrics4K = await page.evaluate(() => {
    const modal = document.querySelector(".movie-detail-modal");
    const epGrid = modal ? modal.querySelector(".movie-detail-episodes-grid") : null;
    const epBtns = epGrid ? Array.from(epGrid.querySelectorAll(".movie-episode-btn")) : [];

    let episodesInFirstRow = 0;
    if (epBtns.length > 0) {
      const firstEpTop = epBtns[0].getBoundingClientRect().top;
      episodesInFirstRow = epBtns.filter(b => Math.abs(b.getBoundingClientRect().top - firstEpTop) < 6).length;
    }

    const grid = document.querySelector(".catalog-grid");
    const cards = grid ? Array.from(grid.querySelectorAll(".catalog-card")) : [];
    let cardsInFirstRow = 0;
    if (cards.length > 0) {
      const firstTop = cards[0].getBoundingClientRect().top;
      cardsInFirstRow = cards.filter(c => Math.abs(c.getBoundingClientRect().top - firstTop) < 10).length;
    }

    return {
      cardsInFirstRow,
      episodesTotal: epBtns.length,
      episodesInFirstRow,
      modalWidth: modal ? modal.clientWidth : null,
      docWidth: document.documentElement.scrollWidth,
      winWidth: window.innerWidth
    };
  });

  console.log("4K Metrics:", JSON.stringify(metrics4K, null, 2));
  await page.screenshot({ path: "diagnose_4k_modal.png", fullPage: false });

  await browser.close();
}

diagnose().catch(err => {
  console.error("Diagnosis failed:", err);
  process.exit(1);
});
