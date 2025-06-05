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

  // Helper function to parse Reddit URLs
  const parseRedditUrl = (url) => {
    const patterns = {
      share_link: /reddit\.com\/r\/(\w+)\/s\/([a-zA-Z0-9]+)/,
      post_url: /reddit\.com\/r\/(\w+)\/comments\/([a-zA-Z0-9]+)/,
      short_url: /redd\.it\/([a-zA-Z0-9]+)/,
      mobile_url: /reddit\.com\/r\/(\w+)\/s\/([a-zA-Z0-9]+)/,
      subreddit: /reddit\.com\/r\/(\w+)\/?$/
    };

    for (const [urlType, pattern] of Object.entries(patterns)) {
      const match = url.match(pattern);
      if (match) {
        return {
          type: urlType,
          groups: match.slice(1),
          fullMatch: match[0]
        };
      }
    }

    return { type: 'unknown', groups: [], fullMatch: null };
  };

  // Helper function to resolve share links
  const resolveShareLink = async (shareUrl) => {
    try {
      const response = await fetch(shareUrl, { method: 'HEAD', redirect: 'follow' });
      if (!response.ok) {
        throw new Error(`Failed to resolve share link: ${response.status}`);
      }
      return response.url;
    } catch (error) {
      throw new Error(`Failed to resolve share link: ${error.message}`);
    }
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

      // Parse the URL
      const urlInfo = parseRedditUrl(processedUrl);
      console.log('Parsed URL info:', urlInfo);
      let finalUrl;
      if (urlInfo.type === 'share_link' || urlInfo.type === 'mobile_url') {
        // Resolve share links to get the actual post URL
        const resolvedUrl = await resolveShareLink(processedUrl);
        console.log('Resolved share URL:', resolvedUrl);
        finalUrl = resolvedUrl;
      } else {
        finalUrl = processedUrl;
      }

      // Add .json to the URL for API access
      const apiUrl = finalUrl.replace(/\/?$/, '.json');
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
