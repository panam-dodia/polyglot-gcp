import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';

const Container = styled.div`
  background: white;
  border-radius: 20px;
  padding: 40px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  max-width: 800px;
  width: 100%;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
`;

const LanguageInfo = styled.div`
  font-size: 18px;
  color: #667eea;
  font-weight: 600;
`;

const EndButton = styled.button`
  padding: 10px 20px;
  background: #ff4757;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  
  &:hover {
    background: #ff3838;
  }
`;

const TranscriptBox = styled.div`
  background: #f8f9fa;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
  min-height: 120px;
`;

const Label = styled.div`
  font-weight: 600;
  color: #333;
  margin-bottom: 10px;
  font-size: 14px;
  text-transform: uppercase;
`;

const Text = styled.div`
  font-size: 18px;
  color: #555;
  line-height: 1.6;
`;

const RecordButton = styled.button`
  width: 100%;
  padding: 20px;
  background: ${props => props.recording ? '#ff4757' : '#667eea'};
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 20px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 5px 20px rgba(0, 0, 0, 0.2);
  }
`;

const Status = styled.div`
  text-align: center;
  margin-top: 15px;
  color: ${props => props.error ? '#ff4757' : '#666'};
  font-weight: 500;
`;

function TranslationInterface({ sourceLanguage, targetLanguage, onEndSession }) {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [translation, setTranslation] = useState('');
  const [status, setStatus] = useState('Ready');
  const [error, setError] = useState('');
  
  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);

  useEffect(() => {
    // Connect to WebSocket
    const ws = new WebSocket('ws://localhost:8080');
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('Connected to server');
      setStatus('Connected');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'ready') {
        setStatus('Ready to translate');
      }
      
      if (data.type === 'transcript') {
        setTranscript(data.text);
      }
      
      if (data.type === 'translation') {
        setTranslation(data.translated);
      }
      
      if (data.type === 'audio') {
        playAudio(data.audio);
      }
      
      if (data.type === 'error') {
        setError(data.message);
        setStatus('Error occurred');
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('Connection error');
      setStatus('Connection failed');
    };

    ws.onclose = () => {
      console.log('Disconnected from server');
      setStatus('Disconnected');
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

    const startRecording = async () => {
    try {
        console.log('Requesting microphone access...');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('Microphone access granted');
        
        const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
        });
        
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
            console.log('Sending audio chunk, size:', event.data.size);
            wsRef.current.send(event.data);
        }
        };

        mediaRecorder.start(100); // Send data every 100ms
        console.log('MediaRecorder started');
        
        // Send start message
        const startMessage = {
        type: 'start',
        sourceLanguage: sourceLanguage,
        targetLanguage: targetLanguage
        };
        console.log('Sending start message:', startMessage);
        wsRef.current.send(JSON.stringify(startMessage));

        setRecording(true);
        setStatus('Recording...');
        setError('');
        
    } catch (err) {
        console.error('Error accessing microphone:', err);
        setError('Microphone access denied');
        setStatus('Error');
    }
    };
    
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
      
      setRecording(false);
      setStatus('Stopped');
    }
  };

  const playAudio = (base64Audio) => {
    const audio = new Audio('data:audio/mpeg;base64,' + base64Audio);
    audio.play();
  };

  return (
    <Container>
      <Header>
        <LanguageInfo>
          {sourceLanguage.split('-')[0].toUpperCase()} → {targetLanguage.split('-')[0].toUpperCase()}
        </LanguageInfo>
        <EndButton onClick={onEndSession}>End Session</EndButton>
      </Header>

      <TranscriptBox>
        <Label>What you said:</Label>
        <Text>{transcript || 'Start speaking...'}</Text>
      </TranscriptBox>

      <TranscriptBox>
        <Label>Translation:</Label>
        <Text>{translation || 'Translation will appear here...'}</Text>
      </TranscriptBox>

      <RecordButton
        recording={recording}
        onClick={recording ? stopRecording : startRecording}
      >
        {recording ? '🛑 Stop Recording' : '🎤 Start Recording'}
      </RecordButton>

      <Status error={error}>
        {error || status}
      </Status>
    </Container>
  );
}

export default TranslationInterface;