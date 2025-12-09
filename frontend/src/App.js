import React, { useState } from 'react';
import styled from 'styled-components';
import LanguageSelector from './components/LanguageSelector';
import TranslationInterface from './components/TranslationInterface';

const AppContainer = styled.div`
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
`;

const Title = styled.h1`
  color: white;
  font-size: 3rem;
  margin-bottom: 2rem;
  text-align: center;
`;

function App() {
  const [sourceLanguage, setSourceLanguage] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('');
  const [sessionStarted, setSessionStarted] = useState(false);

  const handleStartSession = (source, target) => {
    setSourceLanguage(source);
    setTargetLanguage(target);
    setSessionStarted(true);
  };

  const handleEndSession = () => {
    setSessionStarted(false);
    setSourceLanguage('');
    setTargetLanguage('');
  };

  return (
    <AppContainer>
      <Title>🌍 Polyglot</Title>
      {!sessionStarted ? (
        <LanguageSelector onStartSession={handleStartSession} />
      ) : (
        <TranslationInterface
          sourceLanguage={sourceLanguage}
          targetLanguage={targetLanguage}
          onEndSession={handleEndSession}
        />
      )}
    </AppContainer>
  );
}

export default App;