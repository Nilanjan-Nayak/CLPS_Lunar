import { AppProviders } from './providers';
import { Router } from './Router';
import '@/ui/styles.css';
import { installDevTools } from './devtools';

installDevTools();

export function App() {
  return (
    <AppProviders>
      <Router />
    </AppProviders>
  );
}
