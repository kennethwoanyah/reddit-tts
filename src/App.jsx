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
    // Remove any existing query parameters
    urlObj.search = '';
    
    // Normalize the URL path
    let path = urlObj.pathname;
    
    // Remove trailing slash
    if (path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    
    // Handle both URL formats
    if (path.includes('/s/')) {
      // New format: /r/subreddit/s/post_id
      // Add .json to the end
      path += '.json';
    } else if (path.includes('/comments/')) {
      // Old format: /r/subreddit/comments/post_id/post_title
      // Ensure .json is added
      if (!path.endsWith('.json')) {
        path += '.json';
      }
    } else {
      // Try to convert to new format if it's just a subreddit
      const match = path.match(/^\/r\/([^/]+)$/);
      if (match) {
        // If it's just a subreddit URL, try to get the first post
        path = `/r/${match[1]}/s/1.json`;
      } else {
        // If we can't determine the format, throw an error
        throw new Error('Unsupported Reddit URL format');
      }
    }
    
    // Update the URL object with the normalized path
    urlObj.pathname = path;
    // Update fetchUrl with the cleaned URL
    fetchUrl = urlObj.toString();

    let currentExtractedText = '';
    const headers = {};
    if (import.meta.env.VITE_REDDIT_USER_AGENT) {
      headers['User-Agent'] = import.meta.env.VITE_REDDIT_USER_AGENT;
    }

    try {
      const response = await axios.get(fetchUrl, { headers });
      
      // Handle both new and old format responses
      let postData = null;
      let commentsData = [];
      
      // Try new format first
      if (response.data?.data?.post) {
        // New format response structure
        postData = response.data.data.post;
        commentsData = response.data.data.comments || [];
      } else if (Array.isArray(response.data) && response.data.length > 1) {
        // Old format response structure
        postData = response.data[0]?.data?.children[0]?.data;
        commentsData = response.data[1]?.data?.children || [];
      }

      if (!postData) {
        setError('Could not fetch post data. Please check the URL.');
        setIsLoading(false);
        return;
      }

      currentExtractedText = `Post Title: ${postData.title}.\n`;
      if (postData.selftext) {
        currentExtractedText += `Post Body: ${postData.selftext}.\n`;
      }

      // Handle comments differently for new format
      if (commentsData && commentsData.length > 0) {
        currentExtractedText += `\nTop Comments:\n`;
        commentsData.slice(0, 10).forEach((comment, index) => {
          if (comment.data) {
            // For new format, comment data might be nested differently
            const body = comment.data.body || comment.data.text;
            if (body) {
              currentExtractedText += `Comment ${index + 1}: ${body}\n`;
            }
          }
        });
      }
      setExtractedText(currentExtractedText);
      console.log('Extracted Content:\n', currentExtractedText);
      setIsFetching(false); // Reddit data fetched
      playText(currentExtractedText); // Automatically play after fetching
    } catch (err) {
      console.error('Error fetching Reddit data:', err);
      setError(`An error occurred during fetch: ${err.message || 'Unknown error'}`);
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
