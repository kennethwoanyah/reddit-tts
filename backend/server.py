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
            
            # Navigate to the URL
            await page.goto(url)
            
            # Wait for the post content to load
            await page.wait_for_selector("[data-testid='post-content']")
            
            # Extract post title
            title = await page.text_content("[data-testid='post-content'] h1")
            
            # Extract post body
            body = await page.text_content("[data-testid='post-content'] div[data-testid='post-content-text']")
            
            # Extract comments
            comments = []
            comment_elements = await page.query_selector_all("[data-testid='comment']")
            for element in comment_elements[:10]:  # Get top 10 comments
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
