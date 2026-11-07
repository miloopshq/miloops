import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/londrina-solid/900.css';
import '@fontsource-variable/figtree';
import '@fontsource-variable/jetbrains-mono';
import { App } from './App';
import './preview.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
