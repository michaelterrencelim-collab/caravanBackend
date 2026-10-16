# caravanBackend

## Local development

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set the Turso credentials and a private `JWT_SECRET`.
3. Start the API with `npm start`; it listens on port 3000 and exposes `/healthz`. The start script uses Node's system certificate store so local HTTPS requests to Turso and Google work on machines whose certificates are installed in Windows.
4. In the Caravan app project, run `npm run android:sync:debug`, then launch the Android app from Android Studio.

The Android emulator calls the computer's API at `http://10.0.2.2:3000`; browser development continues to use the app's `/api` proxy. The API allows credentialed requests from the local Capacitor origins for its HTTP-only login cookie. For a physical device, configure `androidApiBaseUrl` in the app's `src/environments/environment.ts` to the computer's LAN IP.

Google sign-in's local callback uses `http://localhost:3000/api/auth/google/callback`. Run `adb reverse tcp:3000 tcp:3000` from Android Studio's terminal so the emulator can reach the computer when Google redirects back. The login flow's `returnTo=http://localhost` is the app's WebView origin, not the API host; leave it unchanged. Use HTTPS for deployed APIs.

Google sign-in requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and a `GOOGLE_CALLBACK_URL` registered with Google. The app passes its current origin as a validated return target; `FRONTEND_URL` is the fallback origin.
