const { chromium, devices } = require('playwright');
const path = require('path');

async function runTests() {
  const browser = await chromium.launch();
  
  // 1. Mobile (Pixel 5: 393x851)
  const mobileCtx = await browser.newContext(devices['Pixel 5']);
  const mobilePage = await mobileCtx.newPage();
  await mobilePage.goto('http://localhost:8080/');
  await mobilePage.waitForTimeout(2500);

  await mobilePage.screenshot({ path: 'mobile_pixel5.png' });
  console.log('Saved mobile_pixel5.png');

  // Test search interaction on mobile
  const searchInput = mobilePage.locator('.home-search-input');
  await searchInput.fill('iron');
  await mobilePage.waitForTimeout(1500);
  await mobilePage.screenshot({ path: 'mobile_search_results.png' });
  console.log('Saved mobile_search_results.png');

  // 2. Small Mobile (360x740)
  const smallMobileCtx = await browser.newContext({
    viewport: { width: 360, height: 740 },
    userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
  });
  const smallPage = await smallMobileCtx.newPage();
  await smallPage.goto('http://localhost:8080/');
  await smallPage.waitForTimeout(2500);
  await smallPage.screenshot({ path: 'mobile_small_360.png' });
  console.log('Saved mobile_small_360.png');

  // 3. TV 1080p (1920x1080)
  const tvCtx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/6.0 TV Safari/537.36'
  });
  const tvPage = await tvCtx.newPage();
  await tvPage.goto('http://localhost:8080/');
  await tvPage.waitForTimeout(2500);
  await tvPage.screenshot({ path: 'tv_1080p.png' });
  console.log('Saved tv_1080p.png');

  // 4. TV 720p (1280x720)
  const tv720Ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/5.0 TV Safari/537.36'
  });
  const tv720Page = await tv720Ctx.newPage();
  await tv720Page.goto('http://localhost:8080/');
  await tv720Page.waitForTimeout(2500);
  await tv720Page.screenshot({ path: 'tv_720p.png' });
  console.log('Saved tv_720p.png');

  await browser.close();
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
