import { createRoot } from 'react-dom/client';
import './fonts';
import './styles/index.css';
import { App } from './App';
import { MarkSheet } from './components/ui';

const sheet = import.meta.env.DEV && new URLSearchParams(location.search).has('mark-sheet');
createRoot(document.getElementById('root')!).render(sheet ? <MarkSheet /> : <App />);
