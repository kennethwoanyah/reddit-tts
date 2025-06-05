from fastapi import FastAPI, HTTPException
from playwright.async_api import async_playwright
import os
from dotenv import load_dotenv

app = FastAPI()

@app.get("/fetch_reddit_content")
async def fetch_reddit_content(url: str):
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            
            # Set appropriate user agent based on URL
            if '/m/' in url or '/mobile/' in url:
                await page.set_extra_http_headers({
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Pixel 3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Mobile Safari/537.36'
                })
            else:
                await page.set_extra_http_headers({
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                })
            
            # Navigate to the URL
            await page.goto(url)
            
            # Wait for content based on URL type
            if '/m/' in url or '/mobile/' in url:
                # Mobile Reddit selectors
                await page.wait_for_selector("[data-testid='post-content']")
                title = await page.text_content("[data-testid='post-content'] h1")
                body = await page.text_content("[data-testid='post-content'] div[data-testid='post-content-text']")
                
                # Mobile comments
                comments = []
                comment_elements = await page.query_selector_all("[data-testid='comment']")
                for element in comment_elements[:10]:
                    comment_text = await element.text_content()
                    comments.append(comment_text)
            else:
                # Desktop Reddit selectors
                await page.wait_for_selector("[data-testid='post-fullscreen']")
                title = await page.text_content("[data-testid='post-fullscreen'] h1")
                body = await page.text_content("[data-testid='post-fullscreen'] div[data-testid='post-content-text']")
                
                # Desktop comments
                comments = []
                comment_elements = await page.query_selector_all("[data-testid='comment']")
                for element in comment_elements[:10]:
                    comment_text = await element.text_content()
                    comments.append(comment_text)
            
            await browser.close()
            
            return {
                "title": title,
                "body": body,
                "comments": comments
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
