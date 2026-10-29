import asyncio
import sys

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
        print("Navigating directly to episode URL...")
        await page.goto("http://localhost:8080/?movie=hoc-vien-cao-vo-dong-dai&ep=1")
        await page.wait_for_timeout(4000)
        
        # Trigger controls visible
        await page.mouse.move(500, 500)
        await page.wait_for_timeout(1000)
        
        seek_bar = await page.query_selector("#seek-bar")
        assert seek_bar is not None, "Seek bar not found"
        
        box = await seek_bar.bounding_box()
        print(f"SeekBar box: {box}")
        
        # Test 1: Click at 30%
        click_30 = box["x"] + box["width"] * 0.30
        print("\n--- Test 1: Click at 30% ---")
        await page.mouse.click(click_30, box["y"] + box["height"] * 0.5)
        await page.wait_for_timeout(1000)
        val = int(await page.evaluate('() => document.querySelector("#seek-bar").value'))
        time_str = await page.evaluate('() => document.querySelector("#current-time").textContent')
        print(f"After 30% click: seek_bar={val}, current_time={time_str}")
        assert 280 <= val <= 320, f"Expected ~300, got {val}"
        
        # Test 2: Click at 75%
        click_75 = box["x"] + box["width"] * 0.75
        print("\n--- Test 2: Click at 75% ---")
        await page.mouse.click(click_75, box["y"] + box["height"] * 0.5)
        await page.wait_for_timeout(1000)
        val = int(await page.evaluate('() => document.querySelector("#seek-bar").value'))
        time_str = await page.evaluate('() => document.querySelector("#current-time").textContent')
        print(f"After 75% click: seek_bar={val}, current_time={time_str}")
        assert 730 <= val <= 770, f"Expected ~750, got {val}"
        
        # Test 3: Click at 15%
        click_15 = box["x"] + box["width"] * 0.15
        print("\n--- Test 3: Click at 15% ---")
        await page.mouse.click(click_15, box["y"] + box["height"] * 0.5)
        await page.wait_for_timeout(1000)
        val = int(await page.evaluate('() => document.querySelector("#seek-bar").value'))
        time_str = await page.evaluate('() => document.querySelector("#current-time").textContent')
        print(f"After 15% click: seek_bar={val}, current_time={time_str}")
        assert 130 <= val <= 170, f"Expected ~150, got {val}"
        
        # Test 4: Keyboard ArrowRight tap
        print("\n--- Test 4: ArrowRight tap ---")
        val_before = val
        await page.keyboard.press("ArrowRight")
        await page.wait_for_timeout(800)
        val_after = int(await page.evaluate('() => document.querySelector("#seek-bar").value'))
        time_str = await page.evaluate('() => document.querySelector("#current-time").textContent')
        print(f"After ArrowRight tap: before={val_before}, after={val_after}, current_time={time_str}")
        assert val_after > val_before, f"Expected val_after > val_before, got {val_after} <= {val_before}"
        
        # Test 5: Keyboard ArrowLeft tap
        print("\n--- Test 5: ArrowLeft tap ---")
        val_before = val_after
        await page.keyboard.press("ArrowLeft")
        await page.wait_for_timeout(800)
        val_after = int(await page.evaluate('() => document.querySelector("#seek-bar").value'))
        time_str = await page.evaluate('() => document.querySelector("#current-time").textContent')
        print(f"After ArrowLeft tap: before={val_before}, after={val_after}, current_time={time_str}")
        assert val_after < val_before, f"Expected val_after < val_before, got {val_after} >= {val_before}"

        print("\nALL SEEK BAR CLICK & ARROW KEY TESTS PASSED!")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
