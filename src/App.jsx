import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [redditUrl, setRedditUrl] = useState('');
  const [extractedText, setExtractedText] = useState(''); // Stores the text to be spoken
  const [isFetching, setIsFetching] = useState(false); // For Reddit data fetching
  const [isSpeaking, setIsSpeaking] = useState(false); // True when speechSynthesis is active and not paused
  const [isPaused, setIsPaused] = useState(false);     // True when speechSynthesis is paused
  const [error, setError] = useState(null);

  const handleUrlChange = (event) => {
    setRedditUrl(event.target.value);
  };

  // Helper function to extract post info from Reddit URL
  const extractRedditPostInfo = (url) => {
    try {
      // Create URL object to handle query parameters
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      
      // Extract subreddit and post ID using regex
      let postId = null;
      let subreddit = null;
      
      // Pattern 1: /r/subreddit/comments/postId/...
      const standardMatch = path.match(/\/r\/([^/]+)\/comments\/([^/]+)/);
      if (standardMatch) {
        subreddit = standardMatch[1];
        postId = standardMatch[2];
        return { subreddit, postId };
      }
      
      // Pattern 2: /r/subreddit/s/shortId
      const shareMatch = path.match(/\/r\/([^/]+)\/s\/([^/]+)/);
      if (shareMatch) {
        subreddit = shareMatch[1];
        return { subreddit, shareId: shareMatch[2] };
      }
      
      // Pattern 3: /comments/postId/...
      const commentsMatch = path.match(/\/comments\/([^/]+)/);
      if (commentsMatch) {
        postId = commentsMatch[1];
        return { postId };
      }
      
      throw new Error('Could not parse Reddit URL');
    } catch (error) {
      throw new Error(`Invalid Reddit URL: ${error.message}`);
    }
  };

  // Helper function to resolve share ID to post ID using multiple methods
  const resolveShareId = async (subreddit, shareId) => {
    const errors = [];
    
    // Common headers for all requests
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    };
    
    // Method 1: Try direct JSON API
    try {
      const shareUrl = `https://www.reddit.com/r/${subreddit}/s/${shareId}.json`;
      console.log('Trying JSON API:', shareUrl);
      
      const response = await fetch(shareUrl, { 
        headers: {
          ...headers,
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data?.[0]?.data?.children?.[0]?.data?.id) {
          console.log('Successfully resolved via JSON API');
          return data[0].data.children[0].data.id;
        }
      }
      errors.push(`JSON API method failed: ${response.status}`);
    } catch (error) {
      errors.push(`JSON API error: ${error.message}`);
    }
    
    // Method 2: Try old.reddit.com HTML parsing
    try {
      const oldRedditUrl = `https://old.reddit.com/r/${subreddit}/s/${shareId}`;
      console.log('Trying old.reddit.com:', oldRedditUrl);
      
      const response = await fetch(oldRedditUrl, { headers });
      if (response.ok) {
        const html = await response.text();
        const match = html.match(/\/comments\/([a-zA-Z0-9]+)/);
        
        if (match) {
          console.log('Successfully resolved via old.reddit.com');
          return match[1];
        }
      }
      errors.push(`old.reddit.com method failed: ${response.status}`);
    } catch (error) {
      errors.push(`old.reddit.com error: ${error.message}`);
    }
    
    // Method 3: Try direct HTML parsing
    try {
      const directUrl = `https://www.reddit.com/r/${subreddit}/s/${shareId}`;
      console.log('Trying direct HTML parsing:', directUrl);
      
      const response = await fetch(directUrl, { headers });
      if (response.ok) {
        const html = await response.text();
        
        // Try multiple patterns
        const patterns = [
          /\/comments\/([a-zA-Z0-9]+)/,
          /data-post-id="([a-zA-Z0-9]+)"/,
          /"postId":"([a-zA-Z0-9]+)"/,
          /"id":"([a-zA-Z0-9]+)"/
        ];
        
        for (const pattern of patterns) {
          const match = html.match(pattern);
          if (match) {
            console.log('Successfully resolved via direct HTML parsing');
            return match[1];
          }
        }
      }
      errors.push(`Direct HTML parsing method failed: ${response.status}`);
    } catch (error) {
      errors.push(`Direct HTML error: ${error.message}`);
    }
    
    // Method 4: Try using a CORS proxy as last resort
    try {
      const proxyUrl = 'https://api.allorigins.win/raw?url=';
      const targetUrl = encodeURIComponent(`https://www.reddit.com/r/${subreddit}/s/${shareId}`);
      console.log('Trying CORS proxy:', proxyUrl + targetUrl);
      
      const response = await fetch(proxyUrl + targetUrl, { headers });
      if (response.ok) {
        const html = await response.text();
        
        // Try all patterns again with proxied content
        const patterns = [
          /\/comments\/([a-zA-Z0-9]+)/,
          /data-post-id="([a-zA-Z0-9]+)"/,
          /"postId":"([a-zA-Z0-9]+)"/,
          /"id":"([a-zA-Z0-9]+)"/
        ];
        
        for (const pattern of patterns) {
          const match = html.match(pattern);
          if (match) {
            console.log('Successfully resolved via CORS proxy');
            return match[1];
          }
        }
      }
      errors.push(`CORS proxy method failed: ${response.status}`);
    } catch (error) {
      errors.push(`CORS proxy error: ${error.message}`);
    }
    
    // If all methods fail, throw error with details
    throw new Error(`Failed to resolve share ID. Tried multiple methods:\n${errors.join('\n')}`);
  };

  // Main function to fetch Reddit content and initiate speech
  const handleFetchAndPlay = async () => {
    if (!redditUrl) {
      setError('Please enter a Reddit URL.');
      return;
    }

    // Stop any ongoing speech
    if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    setIsFetching(true);
    setIsSpeaking(false);
    setIsPaused(false);
    setError(null);

    try {
      // Ensure HTTPS
      let processedUrl = redditUrl.trim();
      if (!processedUrl.startsWith('http')) {
        processedUrl = 'https://' + processedUrl;
      } else if (processedUrl.startsWith('http://')) {
        processedUrl = processedUrl.replace('http://', 'https://');
      }

      try {
        // Extract post info from URL
        const postInfo = extractRedditPostInfo(processedUrl);
        console.log('Extracted post info:', postInfo);
        
        // Determine the API URL
        let apiUrl;
        
        if (postInfo.shareId) {
          // Handle share links
          console.log('Resolving share ID:', postInfo.shareId);
          const postId = await resolveShareId(postInfo.subreddit, postInfo.shareId);
          apiUrl = `https://www.reddit.com/r/${postInfo.subreddit}/comments/${postId}.json`;
        } else if (postInfo.postId) {
          // Handle direct post links
          apiUrl = postInfo.subreddit
            ? `https://www.reddit.com/r/${postInfo.subreddit}/comments/${postInfo.postId}.json`
            : `https://www.reddit.com/comments/${postInfo.postId}.json`;
        } else {
          throw new Error('Could not determine post ID');
        }
        
        console.log('Fetching from API URL:', apiUrl);
        
        // Fetch the post data
        const response = await fetch(apiUrl, {
          headers: {
            'Accept': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Reddit API error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Reddit API Response:', data);

        // Process the response data
        let postData = null;
        let commentsData = [];
        
        if (Array.isArray(data) && data.length > 0) {
          // Standard post format
          postData = data[0]?.data?.children[0]?.data;
          commentsData = data[1]?.data?.children || [];
        } else if (data?.data?.children) {
          // Subreddit or listing format
          postData = data.data.children[0]?.data;
          commentsData = data.data.children.slice(1) || [];
        }

        if (!postData) {
          throw new Error('Could not extract post data from response');
        }

        // Build the text content
        let currentExtractedText = `Post Title: ${postData.title}\n`;
        
        if (postData.selftext) {
          currentExtractedText += `\nPost Content:\n${postData.selftext}\n`;
        }

        if (commentsData.length > 0) {
          currentExtractedText += `\nTop Comments:\n`;
          commentsData
            .filter(comment => comment.data?.body)
            .slice(0, 10)
            .forEach((comment, index) => {
              currentExtractedText += `\nComment ${index + 1} by ${comment.data.author || 'unknown'}:\n${comment.data.body}\n`;
            });
        }

        setExtractedText(currentExtractedText);
        console.log('Extracted Content:\n', currentExtractedText);
        setIsFetching(false);
        playText(currentExtractedText);

      } catch (error) {
        console.error('Error fetching Reddit data:', error);
        setError(`Error: ${error.message}`);
        setIsFetching(false);
      }

    } catch (error) {
      console.error('Error fetching Reddit data:', error);
      setError(`Error fetching Reddit data: ${error.message}`);
      setIsFetching(false);
    }
  };

  const playText = (textToSpeak) => {
    if (!textToSpeak || !('speechSynthesis' in window)) {
      if (!textToSpeak) setError('No text to speak.');
      else setError('Web Speech API is not supported by your browser.');
      setIsSpeaking(false);
      setIsPaused(false);
      return;
    }

    // Cancel any ongoing speech before starting new
    if (window.speechSynthesis.speaking || window.speechSynthesis.paused) {
      window.speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(textToSpeak);

    utterance.onstart = () => {
      console.log('Speech started');
      setIsSpeaking(true);
      setIsPaused(false);
      setError(null); // Clear previous speech errors
    };

    utterance.onend = () => {
      console.log('Speech ended');
      setIsSpeaking(false);
      setIsPaused(false);
    };

    utterance.onerror = (event) => {
      // Don't show an error in the UI if speech was simply interrupted by cancel()
      if (event.error !== 'interrupted' && event.error !== 'canceled') {
        console.error('SpeechSynthesisUtterance.onerror - Error:', event.error, 'Utterance:', utterance.text.substring(0,50));
        setError(`Speech error: ${event.error}`);
      } else {
        console.log(`Speech synthesis event: ${event.error}`); // Log it for debugging but don't show as UI error
      }
      setIsSpeaking(false);
      setIsPaused(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  const handleResumePlay = () => {
    try {
      if (!extractedText) {
        setError('No content to play. Fetch Reddit post first.');
        return;
      }

      if (!('speechSynthesis' in window)) {
        setError('Speech synthesis not supported');
        return;
      }

      if (isPaused) {
        window.speechSynthesis.resume();
        setIsSpeaking(true);
        setIsPaused(false);
        setError(null);
      } else if (!isSpeaking) {
        playText(extractedText); // Start from beginning
      }
    } catch (error) {
      console.error('Error resuming speech:', error);
      setError('Failed to resume speech');
      setIsSpeaking(false);
      setIsPaused(false);
    }
  };

  const handlePauseSpeech = () => {
    try {
      if (!('speechSynthesis' in window)) {
        setError('Speech synthesis not supported');
        return;
      }

      if (isSpeaking && !isPaused) {
        window.speechSynthesis.pause();
        setIsSpeaking(false);
        setIsPaused(true);
        setError(null);
      }
    } catch (error) {
      console.error('Error pausing speech:', error);
      setError('Failed to pause speech');
      // Reset state even if error occurs
      setIsSpeaking(false);
      setIsPaused(false);
    }
  };

  const handleStopSpeech = () => {
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
        setIsPaused(false);
        setError(null); // Clear any existing errors
      } else {
        setError('Speech synthesis not supported');
      }
    } catch (error) {
      console.error('Error stopping speech:', error);
      setError('Failed to stop speech');
      // Reset state even if error occurs
      setIsSpeaking(false);
      setIsPaused(false);
    }
  };

  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window && (window.speechSynthesis.speaking || window.speechSynthesis.paused)) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return (
    <div className="app-container">
      <div className="content-area"> {/* Added content-area wrapper */}
        <h1 className="title">Listen to Reddit</h1>
        <div className="input-container">
        <input
          type="text"
          className="reddit-url-input"
          placeholder="Enter Reddit post or subreddit link"
          value={redditUrl}
          onChange={handleUrlChange}
          disabled={isFetching || isSpeaking} // Corrected from isLoading
        />
        <button 
          className="listen-button" 
          onClick={handleFetchAndPlay} 
          disabled={isFetching || isSpeaking}
        >
          {isFetching ? 'Fetching...' : (isSpeaking || isPaused) ? 'Playing...' : 'Play Reddit Post'}
        </button>
        {error && <p className="error-message">{error}</p>}
      </div>

      {extractedText && (
        <div className="controls-container">
          <button onClick={handleResumePlay} disabled={isSpeaking && !isPaused} className="control-button play-button">
            {isPaused ? 'Resume' : 'Play'}
          </button>
          <button onClick={handlePauseSpeech} disabled={!isSpeaking || isPaused} className="control-button pause-button">
            Pause
          </button>
          <button onClick={handleStopSpeech} disabled={!isSpeaking && !isPaused} className="control-button stop-button">
            Stop
          </button>
        </div>
      )}
      </div> {/* Close content-area wrapper */}
    </div>
  );
}

export default App;
