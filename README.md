
# Reddit TTS App

A simple web application that takes a Reddit post or subreddit link, extracts the content, and uses the ElevenLabs API to read it aloud.

## Project Setup

This project was bootstrapped with Vite and React.

### Prerequisites

- Node.js (v18.x or later recommended)
- npm (comes with Node.js)
- An ElevenLabs API Key (you will need to set this as an environment variable)

### Installation

1.  Clone the repository (if applicable) or ensure you are in the project directory `reddit-tts-app`.
2.  Install dependencies:
    ```bash
    npm install
    ```




### Running the Development Server

To start the development server:

```bash
npm run dev
```

This will typically open the application in your default web browser at `http://localhost:5173`.

## Features

-   Input field for Reddit URL.
-   Button to trigger content fetching and text-to-speech.
-   (Planned) Extraction of Reddit post content and top comments.
-   (Planned) Integration with ElevenLabs API for audio playback.

## Environment Variables

To use the ElevenLabs API, you'll need to set up an environment variable for your API key.

Create a `.env` file in the root of the project (`reddit-tts-app/.env`) and add your API key:

```
VITE_ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
```

**Important**: Remember to add `.env` to your `.gitignore` file if it's not already there to avoid committing your API key.
