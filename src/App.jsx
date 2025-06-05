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



  // Helper function to resolve share URL to full URL
  const resolveShareUrl = async (url) => {
    try {
      console.log('Resolving share URL:', url);
      
      // Try different proxy services
      const proxyServices = [
        {
          name: 'allorigins raw',
          url: 'https://api.allorigins.win/raw?url='
        },
        {
          name: 'allorigins get',
          url: 'https://api.allorigins.win/get?url=',
          processResponse: async (res) => {
            const data = await res.json();
            return data.contents;
          }
        },
        {
          name: 'corsproxy',
          url: 'https://corsproxy.io/?'
        }
      ];
      
      // Try each proxy service
      for (const proxy of proxyServices) {
        try {
          console.log(`Trying ${proxy.name}...`);
          const response = await fetch(proxy.url + encodeURIComponent(url));
          
          if (!response.ok) {
            console.log(`${proxy.name} failed with status:`, response.status);
            continue;
          }
          
          // Get HTML content
          const html = proxy.processResponse 
            ? await proxy.processResponse(response)
            : await response.text();
          
          console.log(`Got HTML from ${proxy.name}, length:`, html.length);
          
          // Try different patterns to find the full URL
          const patterns = [
            // Canonical URL
            /canonical"\s+href="([^"]+)"/i,
            // Meta refresh URL
            /content="0;\s*URL=([^"]+)"/i,
            // Comments link
            /href="(\/r\/[^/]+\/comments\/[^/]+)/i,
            // JSON data
            /"permalink":"([^"]+)"/,
            // Post URL
            /"url":"([^"]+\/comments\/[^"]+)"/,
            // Link tag
            /<link[^>]+href="([^"]+\/comments\/[^"]+)"/i
          ];
          
          for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) {
              let fullUrl = match[1];
              
              // Clean up the URL
              if (!fullUrl.startsWith('http')) {
                fullUrl = 'https://www.reddit.com' + fullUrl;
              }
              fullUrl = fullUrl.replace(/\\\//g, '/'); // Fix escaped slashes
              
              console.log(`Found URL using ${proxy.name} and pattern:`, pattern);
              console.log('Resolved to:', fullUrl);
              return fullUrl;
            }
          }
          
          console.log(`No patterns matched in ${proxy.name} response. Sample:`, html.substring(0, 200));
        } catch (proxyError) {
          console.log(`${proxy.name} error:`, proxyError.message);
        }
      }
      
      throw new Error('Could not find Reddit post URL using any proxy service');
    } catch (error) {
      console.error('Share URL resolution error:', error);
      throw new Error(`Failed to resolve share URL: ${error.message}`);
    }
  };

  // Helper function to extract post info from URL
  const extractPostInfo = async (url) => {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      
      // Handle standard Reddit post URLs
      const postMatch = path.match(/\/r\/([^/]+)\/comments\/([^/]+)/);
      if (postMatch) {
        return {
          type: 'standard',
          subreddit: postMatch[1],
          postId: postMatch[2]
        };
      }
      
      // Handle share URLs (/r/subreddit/s/shortId)
      const shareMatch = path.match(/\/r\/([^/]+)\/s\/([^/]+)/);
      if (shareMatch) {
        // First resolve the share URL to get the full URL
        const fullUrl = await resolveShareUrl(url);
        console.log('Got full URL:', fullUrl);
        
        // Try different patterns to extract post info
        const patterns = [
          // Standard format: /r/subreddit/comments/postid/...
          /\/r\/([^/]+)\/comments\/([^/]+)/,
          // Short format: /comments/postid
          /\/comments\/([^/]+)/,
          // New format: /r/subreddit/s/postid
          /\/r\/([^/]+)\/s\/([^/]+)/
        ];
        
        for (const pattern of patterns) {
          const match = fullUrl.match(pattern);
          console.log('Trying pattern:', pattern);
          
          if (match) {
            console.log('Pattern matched:', match);
            
            if (match.length === 3) {
              // Pattern with subreddit and post ID
              return {
                type: 'share',
                subreddit: match[1],
                postId: match[2]
              };
            } else if (match.length === 2) {
              // Pattern with just post ID
              return {
                type: 'share',
                subreddit: shareMatch[1], // Use subreddit from original URL
                postId: match[1]
              };
            }
          }
        }
        
        console.error('Could not parse URL:', fullUrl);
        throw new Error('Could not extract post info from resolved URL');
      }
      
      throw new Error('Please use a standard Reddit post URL or share URL');
    } catch (error) {
      throw new Error('Invalid Reddit URL: ' + error.message);
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
      // Clean and validate the URL
      let processedUrl = redditUrl.trim();
      if (!processedUrl.startsWith('http')) {
        processedUrl = 'https://' + processedUrl;
      } else if (processedUrl.startsWith('http://')) {
        processedUrl = processedUrl.replace('http://', 'https://');
      }

      // Extract post info
      const postInfo = await extractPostInfo(processedUrl);
      console.log('Extracted post info:', postInfo);

      // Construct API URL
      const apiUrl = `https://www.reddit.com/r/${postInfo.subreddit}/comments/${postInfo.postId}.json`;
      console.log('Fetching from:', apiUrl);

      // Fetch post data
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
