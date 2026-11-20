# FOMO BOT — iPhone Safari paper trading

This is a static, mobile-first web app. **It cannot place real trades.** Its balance and history are saved locally in Safari localStorage. It has a live DexScreener token scanner, simulated buys/sells, and a separate DEMO mode. Live market requests can fail due to API limits or browser CORS. The live discovery endpoint only shows recent profiles, not every Pump.fun launch. It does not verify bundler holdings, honeypots, or sellability.

## Phone-only deployment using GitHub Pages

1. Create a free GitHub account at https://github.com/ in Safari.
2. Create a **public** repository named `fomo-bot` (do not put secrets or wallet keys in it).
3. In Safari, open the repository, choose **Add file → Upload files**, and upload `index.html`, `app.js`, and `manifest.webmanifest` from the extracted ZIP. If the mobile layout hides this control, request the desktop website in Safari's page menu. Commit the changes.
4. Open repository **Settings → Pages**, select **Deploy from a branch**, choose `main` and `/ (root)`, then Save.
5. After GitHub finishes deployment, visit `https://YOUR-USERNAME.github.io/fomo-bot/` in Safari. Use **Share → Add to Home Screen**.
6. Select **Demo simulation** first, press **Scan now**, and try paper buying/selling. Switch to **Live DexScreener** to check market data. Press **Start bot** for foreground auto paper trading.

Alternatively, upload the three files to a static hosting service that accepts uploads from iPhone. Opening `index.html` directly from Files may restrict API requests and storage; HTTPS hosting is recommended.

## Strategy and safety

Starting capital $3, trade size $0.50, 1 position max, default take profit +30%, stop loss -15%, trailing stop -12%, daily realized loss cap $0.45, simulated 1% entry and 1% exit cost. The trade engine uses quoted prices and is NOT realistic fill simulation. No live trades or real wallet integration. Data and settings are local to one browser; clearing Safari site data erases them. Export history for backups.

**iPhone limitation:** iOS suspends background tabs; the app intentionally stops when Safari is hidden. It cannot provide reliable 24/7 monitoring, take-profit or stop-loss execution. Live trading requires an always-on backend, secure key management, a swap aggregator or DEX integration, transaction confirmation, price/slippage and priority fee safeguards, balance reconciliation, and security audits. Never upload a seed phrase/private key to GitHub or this web app.
