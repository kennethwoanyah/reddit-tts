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

  // Main function to fetch Reddit content and initiate speech
  const handleFetchAndPlay = async () => {
    if (!redditUrl) {
      setError('Please enter a Reddit URL.');
      return;
    }
    // Stop any ongoing speech before starting new or fetching
    if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    setIsFetching(true);
    setIsSpeaking(false);
    setIsPaused(false);
    setError(null);
    // setExtractedText(''); // Clear previous text only when new fetch starts successfully or playText is called with new text

    let rawUrl = redditUrl.trim();
    let fetchUrl = '';

    // Ensure HTTPS
    if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
      fetchUrl = 'https://' + rawUrl;
    } else if (rawUrl.startsWith('http://')) {
      fetchUrl = rawUrl.replace('http://', 'https://');
    } else {
      fetchUrl = rawUrl; // Already HTTPS
    }

    // Parse URL to handle query parameters correctly
    const urlObj = new URL(fetchUrl);
    
    // Extract post ID and subreddit using regex patterns
    let postId = null;
    let subreddit = null;
    let path = '';
    
    // Remove query parameters and get clean path
    const cleanPath = urlObj.pathname;
    
    // Pattern 1: /r/subreddit/comments/post_id/...
    const oldFormatMatch = cleanPath.match(/\/r\/([^/]+)\/comments\/([^/]+)/);
    
    // Pattern 2: /r/subreddit/s/post_id
    const newFormatMatch = cleanPath.match(/\/r\/([^/]+)\/s\/([^/]+)/);
    
    // Pattern 3: /m/comments/post_id/...
    const mobileFormatMatch = cleanPath.match(/\/m\/comments\/([^/]+)/);
    
    try {
      // Process the URL and extract post ID and subreddit
      let finalPath;
      
      if (oldFormatMatch) {
        // Standard format: /r/subreddit/comments/post_id/...
        subreddit = oldFormatMatch[1];
        postId = oldFormatMatch[2];
        finalPath = `/r/${subreddit}/comments/${postId}.json`;
      } else if (newFormatMatch) {
        // New format: /r/subreddit/s/post_id
        subreddit = newFormatMatch[1];
        const shortId = newFormatMatch[2];
        
        // First, get the actual post ID from the short ID
        const shortUrl = `https://www.reddit.com/r/${subreddit}/s/${shortId}`;
        console.log('Fetching post data from short URL:', shortUrl);
        
        const response = await fetch(shortUrl);
        if (!response.ok) {
          throw new Error(`Failed to resolve short URL: ${response.status} ${response.statusText}`);
        }
        
        // Extract the actual post ID from the response URL
        const fullUrl = response.url;
        const fullPostMatch = fullUrl.match(/\/comments\/([^/]+)/);
        if (!fullPostMatch) {
          throw new Error('Could not extract post ID from short URL');
        }
        
        postId = fullPostMatch[1];
        finalPath = `/r/${subreddit}/comments/${postId}.json`;
      } else if (mobileFormatMatch) {
        // Mobile format
        postId = mobileFormatMatch[1];
        finalPath = `/comments/${postId}.json`;
      } else {
        // Try to handle subreddit-only URLs
        const subredditMatch = cleanPath.match(/^\/r\/([^/]+)$/);
        if (subredditMatch) {
          subreddit = subredditMatch[1];
          finalPath = `/r/${subreddit}/hot.json?limit=1`;
        } else {
          throw new Error('Unsupported Reddit URL format');
        }
      }
      
      path = finalPath;

      // Construct the Reddit API URL
      const apiUrl = `https://www.reddit.com${path}`;
      console.log('Processing Reddit URL:', apiUrl);

      // Make the request with minimal headers
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Reddit API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      response.data = data; // Keep compatibility with axios response format
      console.log('Reddit API Response:', response.data);

      // Initialize variables
      let postData = null;
      let commentsData = [];
      let currentExtractedText = '';

      // Process the response data
      if (Array.isArray(response.data) && response.data.length > 0) {
        // Standard format response
        postData = response.data[0]?.data?.children[0]?.data;
        commentsData = response.data[1]?.data?.children || [];
        console.log('Using standard format:', { post: postData?.title, comments: commentsData?.length });
      } else if (response.data?.data?.children) {
        // Subreddit or alternative format
        postData = response.data.data.children[0]?.data;
        commentsData = response.data.data.children.slice(1) || [];
        console.log('Using alternative format:', { post: postData?.title, comments: commentsData?.length });
      }

      if (!postData) {
        throw new Error('Could not extract post data from response');
      }

      // Extract text content
      currentExtractedText = `Post Title: ${postData.title}\n`;
      if (postData.selftext) {
        currentExtractedText += `Post Body: ${postData.selftext}\n`;
      }

      if (commentsData && commentsData.length > 0) {
        currentExtractedText += `\nTop Comments:\n`;
        commentsData.slice(0, 10).forEach((comment, index) => {
          if (comment.data?.body) {
            currentExtractedText += `Comment ${index + 1}: ${comment.data.body}\n`;
          }
        });
      }

      setExtractedText(currentExtractedText);
      console.log('Extracted Content:\n', currentExtractedText);
      setIsFetching(false);
      playText(currentExtractedText);

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
    if (!extractedText) {
      setError('No content to play. Fetch Reddit post first.');
      return;
    }
    if (isPaused && 'speechSynthesis' in window) {
      window.speechSynthesis.resume();
      setIsSpeaking(true);
      setIsPaused(false);
    } else if (!isSpeaking) {
      playText(extractedText); // Start from beginning if not paused or already speaking
    }
  };

  const handlePauseSpeech = () => {
    if (isSpeaking && !isPaused && 'speechSynthesis' in window) {
      window.speechSynthesis.pause();
      setIsSpeaking(false);
      setIsPaused(true);
    }
  };

  const handleStopSpeech = () => {
    if ((isSpeaking || isPaused) && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel(); 
      setIsSpeaking(false);
      setIsPaused(false);
      // No need to reset extractedText, user might want to play it again
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
