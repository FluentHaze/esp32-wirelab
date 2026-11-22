import { createRoot } from 'react-dom/client';
import App from './App';
import './design-tokens.css';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('找不到实验台挂载点');
createRoot(root).render(<App />);
