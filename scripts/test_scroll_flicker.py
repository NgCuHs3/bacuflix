import asyncio
import sys

# Ensure UTF-8 output
sys.stdout.reconfigure(encoding='utf-8')

from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await context.new_page()

        console_messages = []
        page.on("console", lambda msg: console_messages.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: console_messages.append(f"[PAGE_ERROR] {err}"))

        await page.goto("http://localhost:8080/", wait_until="networkidle")
        await page.wait_for_selector(".catalog-card")

        # Scroll down 10 times to accumulate lots of movies
        for _ in range(10):
            await page.evaluate("""
                () => {
                    const screen = document.querySelector('.catalog-screen');
                    screen.scrollTop = screen.scrollHeight;
                }
            """)
            await asyncio.sleep(0.7)

        initial_state = await page.evaluate("""
            () => {
                const screen = document.querySelector('.catalog-screen');
                const cards = document.querySelectorAll('.catalog-card');
                return {
                    scrollTop: screen.scrollTop,
                    scrollHeight: screen.scrollHeight,
                    cardCount: cards.length
                };
            }
        """)
        print("Initial state after scroll down:", initial_state)

        # Now scroll up step by step and log every single calculation!
        for step in range(30):
            info = await page.evaluate("""
                () => {
                    const screen = document.querySelector('.catalog-screen');
                    const grid = document.querySelector('.catalog-grid');
                    const topSpacer = document.querySelector('.catalog-grid-spacer-top');
                    const bottomSpacer = document.querySelector('.catalog-grid-spacer-bottom');
                    
                    const oldScroll = screen.scrollTop;
                    screen.scrollTop = Math.max(0, screen.scrollTop - 400);
                    const newScroll = screen.scrollTop;

                    const cards = document.querySelectorAll('.catalog-card');
                    const firstCard = cards[0];
                    const lastCard = cards[cards.length - 1];

                    return {
                        oldScroll,
                        newScroll,
                        topSpacerH: topSpacer ? topSpacer.offsetHeight : 0,
                        topSpacerDisplay: topSpacer ? topSpacer.style.display : 'none',
                        cardsCount: cards.length,
                        firstCardMovieId: firstCard ? firstCard.dataset.movieId : null,
                        lastCardMovieId: lastCard ? lastCard.dataset.movieId : null,
                        firstCardRectTop: firstCard ? Math.round(firstCard.getBoundingClientRect().top) : null
                    };
                }
            """)
            print(f"Step {step:02d}: scroll {info['oldScroll']} -> {info['newScroll']} | cards={info['cardsCount']} | topSpacer={info['topSpacerH']}px (display:{info['topSpacerDisplay']}) | firstCardTop={info['firstCardRectTop']}")
            await asyncio.sleep(0.06)

        await browser.close()

asyncio.run(main())
