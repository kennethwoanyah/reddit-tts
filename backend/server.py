import httpx
from fastapi import FastAPI, HTTPException
import re
from typing import Optional

app = FastAPI()

async def extract_post_id_from_url(url: str) -> Optional[str]:
    """Extract post ID from Reddit URL"""
    # Handle mobile format: /m/comments/post_id/post_title
    mobile_match = re.search(r'/m/comments/([^/]+)', url)
    if mobile_match:
        return mobile_match.group(1)
    
    # Handle desktop format: /r/subreddit/comments/post_id/post_title
    desktop_match = re.search(r'/comments/([^/]+)', url)
    if desktop_match:
        return desktop_match.group(1)
    
    # Handle new format: /r/subreddit/s/post_id
    new_format_match = re.search(r'/s/([^/]+)', url)
    if new_format_match:
        return new_format_match.group(1)
    
    return None

@app.get("/fetch_reddit_content")
async def fetch_reddit_content(url: str):
    try:
        # Extract post ID from URL
        post_id = await extract_post_id_from_url(url)
        if not post_id:
            raise HTTPException(status_code=400, detail="Could not extract post ID from URL")
        
        # Use Reddit's public API endpoint
        api_url = f"https://www.reddit.com/comments/{post_id}.json"
        
        # Make request with proper headers
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'application/json'
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(api_url, headers=headers)
            response.raise_for_status()
            
            data = response.json()
            
            # Extract post data from first array element
            post_data = data[0]['data']['children'][0]['data']
            
            # Extract comments from second array element
            comments = []
            for comment in data[1]['data']['children'][:10]:  # Get top 10 comments
                comment_data = comment['data']
                if comment_data.get('body'):
                    comments.append({
                        'author': comment_data.get('author', 'unknown'),
                        'body': comment_data['body'],
                        'score': comment_data.get('score', 0)
                    })
            
            return {
                "title": post_data.get('title', ''),
                "body": post_data.get('selftext', ''),
                "author": post_data.get('author', 'unknown'),
                "score": post_data.get('score', 0),
                "comments": comments
            }
            
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"HTTP error: {e.response.text}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching content: {str(e)}"
        )
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
