import { useState, useEffect } from 'react';
import axios from 'axios';
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
      if (oldFormatMatch) {
        // Standard format: /r/subreddit/comments/post_id/...
        subreddit = oldFormatMatch[1];
        postId = oldFormatMatch[2];
      } else if (newFormatMatch) {
        // New format: /r/subreddit/s/post_id
        subreddit = newFormatMatch[1];
        postId = newFormatMatch[2];
      } else if (mobileFormatMatch) {
        // Mobile format
        postId = mobileFormatMatch[1];
      } else {
        // Try to handle subreddit-only URLs
        const subredditMatch = cleanPath.match(/^\/r\/([^/]+)$/);
        if (subredditMatch) {
          subreddit = subredditMatch[1];
          path = `/r/${subreddit}/hot.json?limit=1`;
        } else {
          throw new Error('Unsupported Reddit URL format');
        }
      }

      // Construct the API URL
      if (postId) {
        path = subreddit
          ? `/r/${subreddit}/comments/${postId}.json`
          : `/comments/${postId}.json`;
      }

      // Add Reddit API headers
      const headers = {
        'Accept': 'application/json',
        'User-Agent': import.meta.env.VITE_REDDIT_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      };

      // Construct the final URL
      const finalUrl = new URL('https://www.reddit.com' + path);
      console.log('Processing Reddit URL:', finalUrl.toString());

      // Use a more reliable CORS proxy
      const proxyUrl = 'https://api.allorigins.win/raw?url=';
      const requestUrl = proxyUrl + encodeURIComponent(finalUrl.toString());

      // Make the request
      const response = await axios.get(requestUrl, { headers });
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
