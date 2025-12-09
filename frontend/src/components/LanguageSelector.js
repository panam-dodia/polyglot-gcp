import React, { useState } from 'react';
import styled from 'styled-components';

const Container = styled.div`
  background: white;
  border-radius: 20px;
  padding: 40px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  max-width: 500px;
  width: 100%;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 10px;
  font-weight: 600;
  color: #333;
`;

const Select = styled.select`
  width: 100%;
  padding: 12px;
  margin-bottom: 25px;
  border: 2px solid #ddd;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  
  &:focus {
    outline: none;
    border-color: #667eea;
  }
`;

const Button = styled.button`
  width: 100%;
  padding: 15px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s;
  
  &:hover {
    transform: translateY(-2px);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const languages = [
  { code: 'en-US', name: 'English (US)' },
  { code: 'es-ES', name: 'Spanish' },
  { code: 'fr-FR', name: 'French' },
  { code: 'de-DE', name: 'German' },
  { code: 'it-IT', name: 'Italian' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)' },
  { code: 'ja-JP', name: 'Japanese' },
  { code: 'ko-KR', name: 'Korean' },
  { code: 'zh-CN', name: 'Chinese (Simplified)' },
  { code: 'hi-IN', name: 'Hindi' },
  { code: 'ar-SA', name: 'Arabic' },
];

function LanguageSelector({ onStartSession }) {
  const [sourceLanguage, setSourceLanguage] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('');

  const handleStart = () => {
    if (sourceLanguage && targetLanguage) {
      onStartSession(sourceLanguage, targetLanguage);
    }
  };

  return (
    <Container>
      <Label>I speak:</Label>
      <Select value={sourceLanguage} onChange={(e) => setSourceLanguage(e.target.value)}>
        <option value="">Select language</option>
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.name}
          </option>
        ))}
      </Select>

      <Label>Translate to:</Label>
      <Select value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value)}>
        <option value="">Select language</option>
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.name}
          </option>
        ))}
      </Select>

      <Button onClick={handleStart} disabled={!sourceLanguage || !targetLanguage}>
        Start Translation
      </Button>
    </Container>
  );
}

export default LanguageSelector;