import { createPlatformClient } from '@osdk/client';
import { createPublicOauthClient } from '@osdk/oauth';

const FOUNDRY_URL = 'https://losaltos.palantirfoundry.com';
const CLIENT_ID = '14e9013b587d7b53b3d9af81d82aa88a';

// Redirect URL must match exactly what is registered in your Foundry Developer Console app.
// Update VITE_REDIRECT_URL in .env if running on a different port.
const REDIRECT_URL =
  (import.meta.env.VITE_REDIRECT_URL as string | undefined) ?? 'http://localhost:8080';

export const auth = createPublicOauthClient(CLIENT_ID, FOUNDRY_URL, REDIRECT_URL);
export const palantirClient = createPlatformClient(FOUNDRY_URL, auth);

export const MODEL_RID =
  'ri.foundry-ml-live.main.live-deployment.7ead904f-35d2-472b-ab39-bf9be7b0b7e4';
