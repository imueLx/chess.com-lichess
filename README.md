# Chess.com → Lichess

> One-click export of your Chess.com games to [Lichess](https://lichess.org) for free analysis.

A lightweight Chrome extension that extracts the PGN from any Chess.com game page and opens it on Lichess so you can take advantage of Lichess' powerful (and free) analysis board, Stockfish engine, and opening explorer.

---

## Features

- **One-click analysis** – Click the extension icon or the floating button on any Chess.com game page.
- **Automatic PGN extraction** – Works with live, daily, and archived games using multiple extraction strategies.
- **Auto-paste into Lichess** – Opens `lichess.org/paste` and fills the PGN textarea for you.
- **Copy PGN** – Quickly copy the full PGN to your clipboard.
- **Minimal permissions** – Only requests access to `chess.com` and `lichess.org`.
- **No account required** – Works without logging in to Lichess.
- **Zero dependencies** – Pure vanilla JavaScript, no frameworks.

## Installation

### From the Chrome Web Store

_(Coming soon)_

### Manual / Developer Install

1. Clone or download this repository:
   ```bash
   git clone https://github.com/UeIx0/chess.com-to-lichess.git
   ```
2. Open **Chrome** and navigate to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the project folder.
5. The extension icon will appear in the toolbar — pin it for easy access.

## Usage

1. Navigate to any game on **Chess.com** (e.g. `chess.com/game/live/123456789`).
2. Click the **Chess.com → Lichess** extension icon in the toolbar.
3. The popup will show the detected players and result.
4. Click **Analyze on Lichess** — a new tab opens with the PGN pre-filled.
5. Click **Import** on the Lichess page to start analysing.

You can also use the **floating button** that appears in the bottom-right corner of Chess.com game pages.

## How It Works

The extension uses several strategies to extract the PGN, tried in order:

| #   | Strategy                                                  | Source                                   |
| --- | --------------------------------------------------------- | ---------------------------------------- |
| 1   | Chess.com callback API (`/callback/live/game/{id}`)       | Internal JSON API                        |
| 2   | Chess.com callback API (`/callback/daily/game/{id}`)      | Internal JSON API                        |
| 3   | Chess.com public API (`api.chess.com/pub/live/game/{id}`) | Public JSON API                          |
| 4   | PGN textarea elements                                     | DOM                                      |
| 5   | Inline `<script>` tags containing PGN                     | DOM                                      |
| 6   | Move list with figurine icons                             | DOM (handles `data-figurine` attributes) |
| 7   | Raw move-list container text                              | DOM                                      |

Once the PGN is extracted it is sent to a new `lichess.org/paste` tab where a background service worker auto-fills the import textarea.

## Project Structure

```
chess.com-to-lichess/
├── manifest.json        # Chrome Extension manifest (MV3)
├── background.js        # Service worker — handles Lichess tab injection
├── content.js           # Content script — floating action button on Chess.com
├── popup.html           # Extension popup markup
├── popup.css            # Popup styles (dark theme)
├── popup.js             # Popup logic — PGN extraction & UI
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── generate-icons.js    # Dev utility — regenerate PNG icons (Node.js)
├── LICENSE              # MIT License
├── PRIVACY.md           # Privacy policy
├── CHANGELOG.md         # Version history
└── README.md            # This file
```

## Development

### Prerequisites

- **Google Chrome** (or any Chromium browser)
- **Node.js** (only needed to regenerate icons)

### Regenerate Icons

```bash
node generate-icons.js
```

### Lint / Format

The project uses no build step. You can optionally format with [Prettier](https://prettier.io):

```bash
npx prettier --write "*.js" "*.css" "*.html"
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/my-feature`).
3. Commit your changes (`git commit -m "Add my feature"`).
4. Push to the branch (`git push origin feature/my-feature`).
5. Open a Pull Request.

## Privacy

This extension does **not** collect, store, or transmit any personal data. See [PRIVACY.md](PRIVACY.md) for the full privacy policy.

## License

[MIT](LICENSE) — free to use, modify, and distribute.

---

Made with ♟ for the chess community.
