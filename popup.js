/**
 * popup.js — Popup UI logic for Chess.com → Lichess extension.
 *
 * Extracts the PGN from the active Chess.com tab and provides
 * buttons to open the game on Lichess or copy the PGN.
 */

"use strict";

let cachedPgn = null;
let activeTabId = null;

const ANALYZE_BUTTON_HTML =
  '<svg class="btn-svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> Analyze on Lichess';
const COPY_BUTTON_HTML =
  '<svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy PGN';
const REFRESH_BUTTON_HTML =
  '<svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Refresh Game';

document.addEventListener("DOMContentLoaded", async () => {
  const statusEl = document.getElementById("status");
  const gameInfoEl = document.getElementById("game-info");
  const analyzeBtn = document.getElementById("analyze-btn");
  const copyPgnBtn = document.getElementById("copy-pgn-btn");
  const refreshBtn = document.getElementById("refresh-btn");
  const versionEl = document.getElementById("version");

  analyzeBtn.innerHTML = ANALYZE_BUTTON_HTML;
  copyPgnBtn.innerHTML = COPY_BUTTON_HTML;
  refreshBtn.innerHTML = REFRESH_BUTTON_HTML;

  // Show extension version
  const manifest = chrome.runtime.getManifest();
  if (versionEl) versionEl.textContent = `v${manifest.version}`;

  // Check if we're on a chess.com game page
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";

  if (!isChessComGame(url)) {
    statusEl.textContent = "Navigate to a Chess.com game page first.";
    refreshBtn.disabled = true;
    return;
  }

  activeTabId = tab.id;
  refreshBtn.disabled = false;

  await extractAndRender({ retries: 4, delayMs: 900 });

  // ---- Analyze on Lichess ----
  analyzeBtn.addEventListener("click", async () => {
    if (!cachedPgn) return;

    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML =
      '<span class="spinner"></span> Opening Lichess\u2026';

    try {
      const newTab = await chrome.tabs.create({
        url: "https://lichess.org/paste",
      });
      await chrome.runtime.sendMessage({
        action: "schedulePgnPaste",
        pgn: cachedPgn,
        tabId: newTab.id,
      });
    } catch {
      // Tab was still opened even if messaging failed
    } finally {
      analyzeBtn.disabled = false;
      analyzeBtn.innerHTML = ANALYZE_BUTTON_HTML;
    }
  });

  // ---- Refresh game tab + retry extraction ----
  refreshBtn.addEventListener("click", async () => {
    if (!activeTabId) return;

    refreshBtn.disabled = true;
    refreshBtn.innerHTML = '<span class="spinner"></span> Refreshing...';
    statusEl.textContent = "Reloading game page and retrying extraction...";
    statusEl.className = "status loading";

    cachedPgn = null;
    analyzeBtn.disabled = true;
    copyPgnBtn.classList.add("hidden");
    gameInfoEl.classList.add("hidden");

    try {
      await chrome.tabs.reload(activeTabId);
      await waitForTabComplete(activeTabId, 15000);
      await delay(500);
      await extractAndRender({ retries: 8, delayMs: 1000 });
    } catch {
      statusEl.textContent =
        "Refresh completed, but PGN is still unavailable. Wait a few seconds and try Refresh Game again.";
      statusEl.className = "status";
    } finally {
      refreshBtn.innerHTML = REFRESH_BUTTON_HTML;
      refreshBtn.disabled = false;
    }
  });

  // ---- Copy PGN ----
  copyPgnBtn.addEventListener("click", async () => {
    if (!cachedPgn) return;
    try {
      await navigator.clipboard.writeText(cachedPgn);
      copyPgnBtn.textContent = "\u2705 Copied!";
      setTimeout(() => {
        copyPgnBtn.innerHTML = COPY_BUTTON_HTML;
      }, 2000);
    } catch {
      copyPgnBtn.textContent = "\u274c Failed";
      setTimeout(() => {
        copyPgnBtn.innerHTML = COPY_BUTTON_HTML;
      }, 2000);
    }
  });

  async function extractAndRender({ retries = 1, delayMs = 0 } = {}) {
    statusEl.textContent = "Extracting PGN from game...";
    statusEl.className = "status loading";
    analyzeBtn.disabled = true;

    try {
      const data = await tryExtractPgn(activeTabId, retries, delayMs);

      if (!data || !data.pgn) {
        throw new Error("Could not extract PGN.");
      }

      cachedPgn = data.pgn;

      statusEl.textContent = "Game found - ready to analyze.";
      statusEl.className = "status active";

      if (data.white || data.black || data.result) {
        gameInfoEl.classList.remove("hidden");
        document.getElementById("white-player").textContent = data.white || "?";
        document.getElementById("black-player").textContent = data.black || "?";
        document.getElementById("result").textContent = formatResultLabel(
          data.result,
        );
      }

      analyzeBtn.disabled = false;
      copyPgnBtn.classList.remove("hidden");
      return true;
    } catch {
      statusEl.textContent =
        "PGN not ready yet. Use Refresh Game after the result appears.";
      statusEl.className = "status";
      return false;
    }
  }
});

async function tryExtractPgn(tabId, maxAttempts = 1, delayMs = 0) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: extractPgnFromPage,
      });

      const data = results?.[0]?.result;
      if (data?.pgn) {
        return data;
      }
    } catch (err) {
      lastError = err;
    }

    if (attempt < maxAttempts) {
      await delay(delayMs);
    }
  }

  if (lastError) throw lastError;
  return null;
}

async function waitForTabComplete(tabId, timeoutMs = 10000) {
  const existing = await chrome.tabs.get(tabId).catch(() => null);
  if (existing?.status === "complete") return;

  await new Promise((resolve, reject) => {
    let done = false;

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for tab reload."));
    }, timeoutMs);

    function cleanup() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    }

    function onUpdated(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId) return;
      if (changeInfo.status === "complete") {
        cleanup();
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert PGN result text into a compact single score label.
 *
 * @param {string|null|undefined} result
 * @returns {string}
 */
function formatResultLabel(result) {
  switch ((result || "").trim()) {
    case "1-0":
      return "Score: 1-0";
    case "0-1":
      return "Score: 0-1";
    case "1/2-1/2":
    case "½-½":
      return "Score: 1/2-1/2";
    default:
      return "Score: -";
  }
}

/* ================================================================= */
/*  Helper — URL detection                                           */
/* ================================================================= */

/**
 * Returns true if the given URL is a Chess.com game page.
 *
 * @param {string} url
 * @returns {boolean}
 */
function isChessComGame(url) {
  return /^https:\/\/(www\.)?chess\.com\/(game|live\/game|analysis\/game\/(live|daily))/.test(
    url,
  );
}

/* ================================================================= */
/*  Injected function — extracts PGN from the Chess.com page          */
/* ================================================================= */

/**
 * Runs **inside the Chess.com tab** context via `chrome.scripting.executeScript`.
 * Tries seven different strategies to find the PGN, from fastest (API) to
 * slowest (DOM scraping). Returns `{ pgn, white, black, result }`.
 */
async function extractPgnFromPage() {
  let pgn = null;
  let white = null;
  let black = null;
  let result = null;

  function extractGameId(url) {
    const patterns = [
      /\/game\/live\/(\d+)/,
      /\/live\/game\/(\d+)/,
      /\/game\/daily\/(\d+)/,
      /\/analysis\/game\/(?:live|daily)\/(\d+)/,
      /\/game\/(\d+)/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
    return null;
  }

  const gameId = extractGameId(window.location.href);

  // ----- Strategy 1: chess.com callback APIs -----
  if (gameId) {
    const endpoints = [
      `https://www.chess.com/callback/live/game/${gameId}`,
      `https://www.chess.com/callback/daily/game/${gameId}`,
    ];

    for (const url of endpoints) {
      if (pgn) break;
      try {
        const resp = await fetch(url);
        if (resp.ok) {
          const data = await resp.json();
          if (data.pgn) {
            pgn = data.pgn;
            // Prefer explicit color fields / PGN headers over
            // positional "top"/"bottom" which depend on viewer perspective.
            white =
              data.pgnHeaders?.White || data.players?.white?.username || null;
            black =
              data.pgnHeaders?.Black || data.players?.black?.username || null;
            result = data.pgnHeaders?.Result || null;
          }
          // Some responses nest game data differently
          if (!pgn && data.game?.pgn) {
            pgn = data.game.pgn;
          }
          if (!pgn && data.gameData?.pgn) {
            pgn = data.gameData.pgn;
          }
        }
      } catch (e) {
        /* try next */
      }
    }
  }

  // ----- Strategy 2: chess.com public API -----
  if (!pgn && gameId) {
    try {
      const resp = await fetch(`https://api.chess.com/pub/live/game/${gameId}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.pgn) {
          pgn = data.pgn;
        }
      }
    } catch (e) {
      /* next */
    }
  }

  // ----- Strategy 3: Look for PGN in textareas / DOM elements -----
  if (!pgn) {
    const selectors = [
      "textarea.share-menu-tab-pgn-textarea",
      ".share-menu-tab-pgn-textarea",
      'textarea[aria-label="PGN"]',
      ".copy-pgn-textarea",
      ".pgn-textarea",
    ];
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          const val = el.value || el.textContent || "";
          if (val.includes("1.")) {
            pgn = val.trim();
            break;
          }
        }
      } catch (e) {
        /* next */
      }
    }
  }

  // ----- Strategy 4: Search ALL textareas for PGN-like content -----
  if (!pgn) {
    try {
      for (const ta of document.querySelectorAll("textarea")) {
        const val = ta.value || "";
        if ((val.includes("[Event") || val.includes("1.")) && val.length > 10) {
          pgn = val.trim();
          break;
        }
      }
    } catch (e) {
      /* next */
    }
  }

  // ----- Strategy 5: Extract from global JS game objects -----
  if (!pgn) {
    try {
      // chess.com may store data in global variables or data attributes
      const scripts = document.querySelectorAll("script:not([src])");
      for (const s of scripts) {
        const text = s.textContent || "";
        // Look for PGN string in inline scripts
        const pgnMatch = text.match(/"pgn"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (pgnMatch) {
          pgn = pgnMatch[1]
            .replace(/\\n/g, "\n")
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, "\\");
          break;
        }
      }
    } catch (e) {
      /* next */
    }
  }

  // ----- Strategy 6: Build PGN from the visible move list -----
  // Helper: extract move text from an element, accounting for chess.com's
  // figurine piece icons (rendered as <span data-figurine="N"> or
  // <img/svg with class containing piece type, or ::before content).
  function getMoveTextFromEl(el) {
    let text = "";
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const fig = node.getAttribute("data-figurine");
        if (fig) {
          text += fig;
        } else if (node.classList) {
          const cls = node.className || "";
          const pieceMatch =
            cls.match(
              /\b(?:piece-letter-|icon-font-chess\s*)(knight|bishop|rook|queen|king)\b/i,
            ) || cls.match(/\b([nbrqk])\b/i);
          if (pieceMatch) {
            const map = {
              knight: "N",
              bishop: "B",
              rook: "R",
              queen: "Q",
              king: "K",
              n: "N",
              b: "B",
              r: "R",
              q: "Q",
              k: "K",
            };
            text += map[pieceMatch[1].toLowerCase()] || "";
          } else {
            text += getMoveTextFromEl(node);
          }
        } else {
          text += getMoveTextFromEl(node);
        }
      }
    }
    // Collapse spaces between piece letter and square: "B g7" -> "Bg7", "N xd4" -> "Nxd4"
    text = text.replace(/([KQRBN])\s+([a-hx])/g, "$1$2");
    // Also collapse "R axc8" -> "Raxc8" etc.
    text = text.replace(/([KQRBN])\s+([a-h1-8])/g, "$1$2");
    return text.trim();
  }

  if (!pgn) {
    try {
      // Find individual move elements (each containing one half-move like "Nf3")
      const moveSelectors = [
        // chess.com node-based move elements
        "[data-ply] .node",
        ".move-node .node",
        ".node[data-ply]",
        ".move-text-component",
        // Whole move rows
        "[data-whole-move-number]",
        ".move-node",
        ".move",
        "[data-ply]",
      ];

      let moveEls = [];
      for (const sel of moveSelectors) {
        const found = document.querySelectorAll(sel);
        if (found.length > 0) {
          moveEls = found;
          break;
        }
      }

      if (moveEls.length > 0) {
        const rawMoves = [];
        moveEls.forEach((el) => {
          const text = getMoveTextFromEl(el);
          if (!text) return;
          // Skip pure move numbers
          if (/^\d+\.?\s*$/.test(text)) return;
          // Check for sub-elements (white/black half)
          const whiteEl = el.querySelector(
            ".white.node, .white-move, [class*=white]",
          );
          const blackEl = el.querySelector(
            ".black.node, .black-move, [class*=black]",
          );
          if (whiteEl || blackEl) {
            if (whiteEl) rawMoves.push(getMoveTextFromEl(whiteEl));
            if (blackEl) rawMoves.push(getMoveTextFromEl(blackEl));
          } else {
            // Extract individual moves via regex
            const moveRegex =
              /([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|O-O(?:-O)?[+#]?)/g;
            let match;
            while ((match = moveRegex.exec(text)) !== null) {
              rawMoves.push(match[1]);
            }
          }
        });

        if (rawMoves.length > 0) {
          let pgnMoves = "";
          for (let i = 0; i < rawMoves.length; i++) {
            if (i % 2 === 0) pgnMoves += `${Math.floor(i / 2) + 1}. `;
            pgnMoves += rawMoves[i] + " ";
          }
          pgn = pgnMoves.trim();
        }
      }
    } catch (e) {
      /* next */
    }
  }

  // ----- Strategy 7: Last resort — grab move text from the move list area -----
  if (!pgn) {
    try {
      const moveListContainers = document.querySelectorAll(
        ".move-list, .vertical-move-list, .horizontal-move-list, [class*=moveList], [class*=move-list]",
      );
      for (const container of moveListContainers) {
        const text = getMoveTextFromEl(container);
        if (text && text.length > 4) {
          const cleaned = text
            .replace(/\s+/g, " ")
            .replace(/(\d+)\.\s*/g, "$1. ");
          if (/1\.\s*[a-hNBRQKO]/.test(cleaned)) {
            pgn = cleaned;
            break;
          }
        }
      }
    } catch (e) {
      /* give up */
    }
  }

  // ----- Parse metadata from PGN headers (authoritative source) -----
  if (pgn) {
    if (!result) {
      const m = pgn.match(/\[Result\s+"([^"]+)"\]/);
      if (m) result = m[1];
      else {
        const endMatch = pgn.match(/(1-0|0-1|1\/2-1\/2|\*)\s*$/);
        if (endMatch) result = endMatch[1];
      }
    }
    if (!white) {
      const m = pgn.match(/\[White\s+"([^"]+)"\]/);
      if (m) white = m[1];
    }
    if (!black) {
      const m = pgn.match(/\[Black\s+"([^"]+)"\]/);
      if (m) black = m[1];
    }
  }

  // ----- Extract player names from the DOM if still missing -----
  if (!white || !black) {
    try {
      // Detect whether the board is flipped (viewing from Black's side).
      // When flipped the bottom player is Black, otherwise White.
      const isFlipped = !!document.querySelector(
        ".board.flipped, wc-chess-board.flipped, wc-chess-board[flipped], " +
          "[class*=board-layout-flipped], [class*=boardFlipped]",
      );

      const usernameSelectors = [
        '[data-test-element="user-tagline-username"]',
        ".user-username-component",
        ".player-header-username",
        ".player-component .user-username-component",
        "[class*=playerName]",
        "[class*=username]",
      ];

      for (const sel of usernameSelectors) {
        const els = document.querySelectorAll(sel);
        if (els.length >= 2) {
          const topName = els[0]?.textContent?.trim();
          const botName = els[1]?.textContent?.trim();
          // Default layout: bottom = White, top = Black.
          // Flipped layout:  bottom = Black, top = White.
          if (isFlipped) {
            white = white || topName;
            black = black || botName;
          } else {
            white = white || botName;
            black = black || topName;
          }
          break;
        }
      }
    } catch (e) {
      /* skip */
    }
  }

  // ----- If PGN has no headers, build them and append result -----
  if (pgn && !pgn.includes("[Event")) {
    // Try to find the result from the page
    if (!result) {
      try {
        // Look for result text in the game over area
        const resultEls = document.querySelectorAll(
          ".game-over-header-header, .result-header, [class*=gameOver], [class*=result]",
        );
        for (const el of resultEls) {
          const t = el.textContent.trim();
          if (/1-0|0-1|1\/2/.test(t)) {
            result = t.match(/(1-0|0-1|1\/2-1\/2)/)?.[1] || null;
            break;
          }
        }
      } catch (e) {
        /* skip */
      }
    }

    const headers = [];
    headers.push('[Event "Live Chess"]');
    headers.push('[Site "Chess.com"]');
    headers.push(
      `[Date "${new Date().toISOString().slice(0, 10).replace(/-/g, ".")}"]`,
    );
    if (white) headers.push(`[White "${white}"]`);
    if (black) headers.push(`[Black "${black}"]`);
    if (result) headers.push(`[Result "${result}"]`);

    const moves = pgn.trim();
    // Append result to move text if not already there
    const resultSuffix = result && !moves.endsWith(result) ? " " + result : "";
    pgn = headers.join("\n") + "\n\n" + moves + resultSuffix;
  }

  return { pgn, white, black, result };
}
