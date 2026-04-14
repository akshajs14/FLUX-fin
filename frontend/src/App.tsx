import './App.css';
import { FluxDashboard } from './FluxDashboard';
import { AuthCallback } from './components/AuthCallback';

// If Foundry redirected back with an OAuth code, handle the callback
// before rendering anything else.
const isOAuthCallback =
  window.location.search.includes('code=') &&
  window.location.search.includes('state=');

export default function App() {
  if (isOAuthCallback) {
    return <AuthCallback />;
  }
  return <FluxDashboard />;
}
