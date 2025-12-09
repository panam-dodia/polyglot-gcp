require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const speech = require('@google-cloud/speech');
const { Translate } = require('@google-cloud/translate').v2;
const { ElevenLabsClient } = require('elevenlabs');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Initialize Google Cloud clients
const speechClient = new speech.SpeechClient();
const translateClient = new Translate();

// Initialize ElevenLabs client
const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY
});

// Store active sessions
const sessions = new Map();

wss.on('connection', (ws) => {
  console.log('New client connected');
  
  let sessionId = null;
  let recognizeStream = null;

  ws.on('message', async (message) => {
    try {
      console.log('Received message, type:', typeof message, 'isBuffer:', message instanceof Buffer, 'length:', message.length);
      
      // Check if it's binary audio data or JSON
      if (message instanceof Buffer) {
        // Try to parse as JSON first
        try {
          const text = message.toString('utf8');
          const data = JSON.parse(text);
          
          // It's JSON!
          console.log('Parsed JSON from buffer:', data);
          
          if (data.type === 'start') {
            // Initialize new translation session
            sessionId = Date.now().toString();
            sessions.set(sessionId, {
              sourceLanguage: data.sourceLanguage,
              targetLanguage: data.targetLanguage,
              ws: ws
            });
            
            console.log(`Session ${sessionId} started: ${data.sourceLanguage} -> ${data.targetLanguage}`);
            
            // Create streaming recognition request
            const request = {
              config: {
                encoding: 'WEBM_OPUS',
                sampleRateHertz: 48000,
                languageCode: data.sourceLanguage,
                enableAutomaticPunctuation: true,
              },
              interimResults: true,
            };
            
            recognizeStream = speechClient
              .streamingRecognize(request)
              .on('error', (error) => {
                console.error('Speech recognition error:', error);
                ws.send(JSON.stringify({ type: 'error', message: error.message }));
              })
              .on('data', async (response) => {
                const result = response.results[0];
                if (result && result.alternatives[0]) {
                  const transcript = result.alternatives[0].transcript;
                  const isFinal = result.isFinal;
                  
                  console.log(`Transcript (${isFinal ? 'final' : 'interim'}): ${transcript}`);
                  
                  // Send interim results
                  ws.send(JSON.stringify({
                    type: 'transcript',
                    text: transcript,
                    isFinal: isFinal
                  }));
                  
                  // If final, translate and synthesize
                  if (isFinal) {
                    await handleTranslation(sessionId, transcript);
                  }
                }
              });
            
            ws.send(JSON.stringify({ type: 'ready', sessionId: sessionId }));
          }
          
          if (data.type === 'stop') {
            if (recognizeStream) {
              recognizeStream.end();
              recognizeStream = null;
            }
            if (sessionId) {
              sessions.delete(sessionId);
            }
            console.log('Session stopped');
          }
          
          return; // Don't process as audio
          
        } catch (jsonError) {
          // Not JSON, treat as binary audio data
          if (recognizeStream) {
            recognizeStream.write(message);
          }
          return;
        }
      }
      
    } catch (error) {
      console.error('Message handling error:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    if (recognizeStream) {
      recognizeStream.end();
    }
    if (sessionId) {
      sessions.delete(sessionId);
    }
  });
});

// Translation handler
async function handleTranslation(sessionId, text) {
  const session = sessions.get(sessionId);
  if (!session) return;
  
  try {
    // Translate text
    const [translation] = await translateClient.translate(text, session.targetLanguage);
    console.log(`Translation: ${translation}`);
    
    session.ws.send(JSON.stringify({
      type: 'translation',
      original: text,
      translated: translation
    }));
    
    // Generate speech with ElevenLabs
    await generateSpeech(sessionId, translation);
    
  } catch (error) {
    console.error('Translation error:', error);
    session.ws.send(JSON.stringify({ type: 'error', message: error.message }));
  }
}

// Speech synthesis handler (placeholder for now)
// Replace the generateSpeech function with this:
async function generateSpeech(sessionId, text) {
  const session = sessions.get(sessionId);
  if (!session) return;
  
  try {
    console.log('Generating speech with ElevenLabs:', text);
    
    // Use the text-to-speech endpoint directly
    const audio = await elevenlabs.textToSpeech.convert("pNInz6obpgDQGcFmaJgB", {
      text: text,
      model_id: "eleven_multilingual_v2"
    });
    
    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of audio) {
      chunks.push(chunk);
    }
    const audioBuffer = Buffer.concat(chunks);
    
    // Send audio back to client
    session.ws.send(JSON.stringify({
      type: 'audio',
      audio: audioBuffer.toString('base64')
    }));
    
    console.log('Audio sent to client');
    
  } catch (error) {
    console.error('Speech synthesis error:', error);
    session.ws.send(JSON.stringify({ type: 'error', message: error.message }));
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});