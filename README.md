# Diall Chat

Diall Chat is a static GitHub Pages client for private Matrix conversations. It uses the official `matrix-js-sdk` Rust/WASM crypto stack; it does not implement its own encryption. The app creates private rooms with Matrix end-to-end encryption enabled and refuses to display or send messages in unencrypted rooms.

## Run locally

```powershell
npm ci
npm run dev
```

Sign in with a Matrix account hosted at `matrix.org`. Accounts can be created through Element. To start a conversation, enter the other person's Matrix ID. Both participants need Matrix accounts.

## Encryption and privacy

- Message content is encrypted by the Matrix client before it reaches the homeserver. The homeserver relays and stores ciphertext.
- The homeserver can still see account IDs, room membership, message timing, and network metadata.
- Session tokens are kept in `sessionStorage`; passwords are not stored. Matrix crypto keys use the SDK's browser IndexedDB store.
- Use a trusted Matrix client such as Element to verify devices and save the account recovery key before relying on encrypted history. This app does not yet provide its own device-verification or key-recovery UI.
- GitHub Pages serves the app over HTTPS when HTTPS enforcement is enabled in repository settings. The page has a restrictive Content Security Policy, but HTML cannot set HSTS or all response headers.
- This is a starter client, not a security-reviewed messenger. Do not use it for high-risk communications until its deployment, device verification, recovery, and threat model have been reviewed.

## GitHub Pages deployment

The workflow in `.github/workflows/pages.yml` builds and publishes this client from the repository root. In GitHub, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**, and enable **Enforce HTTPS** when available. The project URL is normally:

`https://diallme-coder.github.io/diall_chat/`

The workflow must run on the repository's `main` branch before the site is published. GitHub Pages configuration is managed in repository settings; a successful build alone does not mean the site has been published.
