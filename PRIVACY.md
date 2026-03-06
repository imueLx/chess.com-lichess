# Privacy Policy

**Chess.com to Lichess** is a browser extension that exports Chess.com game data to Lichess for analysis.

## Data Collection

This extension does **not** collect, store, or transmit any personal data.

## What the extension accesses

| Data                    | Purpose                                   | Stored?                             |
| ----------------------- | ----------------------------------------- | ----------------------------------- |
| Chess.com game page URL | Detect game pages and extract the game ID | No                                  |
| PGN (game notation)     | Send to Lichess for analysis              | No (only passed to the Lichess tab) |
| Player usernames        | Display in the popup UI                   | No (only shown temporarily)         |

## Network requests

The extension makes requests **only** to:

- **chess.com** — to fetch the PGN of the current game via Chess.com's own API.
- **lichess.org** — to open the import/paste page so you can analyse the game.

No data is sent to any third-party server, analytics service, or tracking platform.

## Permissions

| Permission                   | Reason                                            |
| ---------------------------- | ------------------------------------------------- |
| `activeTab`                  | Read the current Chess.com tab to extract the PGN |
| `scripting`                  | Inject the PGN into the Lichess import page       |
| Host access to `chess.com`   | Fetch game data from Chess.com APIs               |
| Host access to `lichess.org` | Auto-fill the PGN on the Lichess paste page       |

## Changes

If this policy is ever updated, the changes will be noted in the [CHANGELOG](CHANGELOG.md).

## Contact

If you have questions, open an issue on [GitHub](https://github.com/UeIx0/chess.com-to-lichess).

_Last updated: March 2026_
