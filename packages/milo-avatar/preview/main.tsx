import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/share-tech-mono/400.css';
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import { App } from './App';
import './preview.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
