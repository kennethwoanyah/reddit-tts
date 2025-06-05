import { useState, useEffect } from 'react';
import axios from 'axios';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import './App.css';

// Test log at module level
console.log("[App.jsx Module] Using ElevenLabs API Key:", import.meta.env.VITE_ELEVENLABS_API_KEY);
const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY;

function App() {
  const [redditUrl, setRedditUrl] = useState('');
  const [extractedText, setExtractedText] = useState('');
  const [isLoading, setIsLoading] = useState(false); // For fetching Reddit data
  const [isSpeaking, setIsSpeaking] = useState(false); // For ElevenLabs TTS
  const [error, setError] = useState(null);
  const [audioPlayer, setAudioPlayer] = useState(null);

  useEffect(() => {
    // Cleanup audio player when component unmounts or when a new audio is played
    return () => {
      if (audioPlayer) {
        audioPlayer.pause();
        audioPlayer.src = '';
      }
    };
  }, [audioPlayer]);

  const handleUrlChange = (event) => {
    setRedditUrl(event.target.value);
  };

  // You can also keep your original console.log here if you want
  console.log("[App Component Render] VITE_ELEVENLABS_API_KEY:", import.meta.env.VITE_ELEVENLABS_API_KEY); 
  const handleListenClick = async () => {
    if (!redditUrl) {
      setError('Please enter a Reddit URL.');
      return;
    }
    if (!ELEVENLABS_API_KEY) {
      setError('ElevenLabs API key is not configured. Please set VITE_ELEVENLABS_API_KEY in your .env file.');
      return;
    }

    setIsLoading(true);
    setIsSpeaking(false);
    setError(null);
    setExtractedText('');
    if (audioPlayer) audioPlayer.pause(); // Stop previous audio if any

    let fetchUrl = redditUrl.trim();
    if (fetchUrl.endsWith('/')) fetchUrl = fetchUrl.slice(0, -1);
    if (!fetchUrl.endsWith('.json')) fetchUrl += '.json';

    let currentExtractedText = '';
    const headers = {};
    if (import.meta.env.VITE_REDDIT_USER_AGENT) {
      headers['User-Agent'] = import.meta.env.VITE_REDDIT_USER_AGENT;
    }

    try {
      const response = await axios.get(fetchUrl, { headers });
      const postData = response.data[0]?.data?.children[0]?.data;
      const commentsData = response.data[1]?.data?.children;

      if (!postData) {
        setError('Could not fetch post data. Please check the URL.');
        setIsLoading(false); // Ensure isLoading is reset if post data fetch fails
        return;
      }

      currentExtractedText = `Post Title: ${postData.title}.\n`;
      if (postData.selftext) {
        currentExtractedText += `Post Body: ${postData.selftext}.\n`;
      }

      if (commentsData && commentsData.length > 0) {
        currentExtractedText += `\nTop Comments:\n`;
        commentsData.slice(0, 10).forEach((comment, index) => {
          if (comment.data.body) {
            currentExtractedText += `Comment ${index + 1}: ${comment.data.body}\n`;
          }
        });
      }
      setExtractedText(currentExtractedText);
      console.log('Extracted Content:\n', currentExtractedText);
      setIsLoading(false); // Reddit data fetched

      // Now, let's get the audio from ElevenLabs
      if (currentExtractedText.trim()) {
        setIsSpeaking(true);
        const elevenlabs = new ElevenLabsClient({
          apiKey: ELEVENLABS_API_KEY,
        });

        const audioStream = await elevenlabs.textToSpeech.stream(
          '21m00Tcm4TlvDq8ikWAM', // Explicit Voice ID for a voice like Rachel
          {
            text: currentExtractedText,
            model_id: 'eleven_multilingual_v2', // Or other models like 'eleven_mono_v1'
            // voice_settings: { // Optional: stability and similarity_boost
            //   stability: 0.5,
            //   similarity_boost: 0.75
            // }
          }
        );
        
        const audioBlob = new Blob([await streamToArrayBuffer(audioStream)], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        const newAudioPlayer = new Audio(audioUrl);
        setAudioPlayer(newAudioPlayer);
        newAudioPlayer.play();
        newAudioPlayer.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl); // Clean up blob URL
        };
        newAudioPlayer.onerror = () => {
            setError('Error playing audio.');
            setIsSpeaking(false);
            URL.revokeObjectURL(audioUrl);
        }
      } else {
        setError('No text content found to read.');
      }

    } catch (err) {
      console.error('Error:', err);
      setError(`An error occurred: ${err.message || 'Unknown error'}`);
      setIsLoading(false);
      setIsSpeaking(false);
    }
  };

  // Helper function to convert stream to ArrayBuffer
  async function streamToArrayBuffer(stream) {
    const reader = stream.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return new Blob(chunks).arrayBuffer();
  }

  return (
    <div className="app-container">
      <h1 className="title">Listen to Reddit</h1>
      <div className="input-container">
        <input
          type="text"
          className="reddit-url-input"
          placeholder="Enter Reddit post or subreddit link"
          value={redditUrl}
          onChange={handleUrlChange}
          disabled={isLoading || isSpeaking}
        />
        <button 
          className="listen-button" 
          onClick={handleListenClick} 
          disabled={isLoading || isSpeaking}
        >
          {isLoading ? 'Fetching Post...' : isSpeaking ? 'Speaking...' : 'Listen to Reddit post'}
        </button>
        {error && <p className="error-message">{error}</p>}
      </div>
    </div>
  );
}

export default App;
