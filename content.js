/**
 * content.js — Chess.com → Lichess extension
 *
 * Injects a floating action button (FAB) on Chess.com game pages.
 * When clicked it extracts the PGN and opens Lichess for analysis.
 */

(function () {
  "use strict";

  // Prevent double-injection
  if (document.getElementById("lichess-analyze-fab")) return;

  // Wait for the page to fully load the game
  const observer = new MutationObserver(() => {
    if (document.querySelector(".board-layout-main, .board, wc-chess-board")) {
      observer.disconnect();
      injectButton();
    }
  });

  // Start observing
  observer.observe(document.body, { childList: true, subtree: true });

  // Also try immediately if already loaded
  if (document.querySelector(".board-layout-main, .board, wc-chess-board")) {
    observer.disconnect();
    injectButton();
  }

  function injectButton() {
    const fab = document.createElement("button");
    fab.id = "lichess-analyze-fab";
    fab.title = "Analyze on Lichess";
    fab.innerHTML = `
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    `;

    Object.assign(fab.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      width: "52px",
      height: "52px",
      borderRadius: "50%",
      background: "linear-gradient(135deg, #629924, #88cc2e)",
      border: "none",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
      zIndex: "999999",
      transition: "transform 0.15s ease, box-shadow 0.15s ease",
    });

    fab.addEventListener("mouseenter", () => {
      fab.style.transform = "scale(1.1)";
      fab.style.boxShadow = "0 6px 24px rgba(98,153,36,0.5)";
    });

    fab.addEventListener("mouseleave", () => {
      fab.style.transform = "scale(1)";
      fab.style.boxShadow = "0 4px 16px rgba(0,0,0,0.3)";
    });

    fab.addEventListener("click", handleAnalyze);

    document.body.appendChild(fab);
  }

  async function handleAnalyze() {
    const fab = document.getElementById("lichess-analyze-fab");
    if (!fab) return;

    // Show loading state
    fab.style.opacity = "0.6";
    fab.style.pointerEvents = "none";

    try {
      const gameId = extractGameId(window.location.href);
      let pgn = null;

      // Strategy 1: Fetch from chess.com API
      if (gameId) {
        pgn = await fetchPgnFromApi(gameId);
      }

      // Strategy 2: Extract from DOM
      if (!pgn) {
        pgn = extractPgnFromDom();
      }

      if (!pgn) {
        showToast("Could not extract PGN from this game page.", "error");
        return;
      }

      // Copy PGN to clipboard as a convenience fallback
      try {
        await navigator.clipboard.writeText(pgn);
      } catch {
        // Clipboard API may not be available — not critical
      }

      // Open Lichess paste page
      window.open("https://lichess.org/paste", "_blank");
      showToast("Opening Lichess — PGN copied to clipboard.", "info");
    } catch (err) {
      console.error("[Chess.com→Lichess]", err);
      showToast("Error: " + err.message, "error");
    } finally {
      fab.style.opacity = "1";
      fab.style.pointerEvents = "auto";
    }
  }

  async function fetchPgnFromApi(gameId) {
    // Try live game callback
    try {
      const resp = await fetch(
        `https://www.chess.com/callback/live/game/${gameId}`,
      );
      if (resp.ok) {
        const data = await resp.json();
        if (data.pgn) return data.pgn;
        if (data.game?.pgn) return data.game.pgn;
        if (data.gameData?.pgn) return data.gameData.pgn;
      }
    } catch (e) {
      /* try next */
    }

    // Try daily game callback
    try {
      const resp = await fetch(
        `https://www.chess.com/callback/daily/game/${gameId}`,
      );
      if (resp.ok) {
        const data = await resp.json();
        if (data.pgn) return data.pgn;
        if (data.game?.pgn) return data.game.pgn;
      }
    } catch (e) {
      /* try next */
    }

    // Try public API
    try {
      const resp = await fetch(`https://api.chess.com/pub/live/game/${gameId}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.pgn) return data.pgn;
      }
    } catch (e) {
      /* give up on API */
    }

    return null;
  }

  function extractPgnFromDom() {
    // Strategy A: Look for PGN in textareas
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
          if (val.includes("1.")) return val.trim();
        }
      } catch (e) {
        /* next */
      }
    }

    // Strategy B: Search ALL textareas
    try {
      for (const ta of document.querySelectorAll("textarea")) {
        const val = ta.value || "";
        if ((val.includes("[Event") || val.includes("1.")) && val.length > 10) {
          return val.trim();
        }
      }
    } catch (e) {
      /* next */
    }

    // Strategy C: Look for PGN in inline scripts
    try {
      for (const s of document.querySelectorAll("script:not([src])")) {
        const text = s.textContent || "";
        const pgnMatch = text.match(/"pgn"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (pgnMatch) {
          return pgnMatch[1]
            .replace(/\\n/g, "\n")
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, "\\");
        }
      }
    } catch (e) {
      /* next */
    }

    // Helper: extract move text accounting for chess.com figurine icons
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
      return text.trim();
    }

    // Collapse spaces between piece letters and squares: "B g7" -> "Bg7"
    function cleanMoveText(t) {
      t = t.replace(/([KQRBN])\s+([a-hx])/g, "$1$2");
      t = t.replace(/([KQRBN])\s+([a-h1-8])/g, "$1$2");
      return t;
    }

    // Strategy D: Build PGN from visible move list
    try {
      const moveSelectors = [
        "[data-ply] .node",
        ".move-node .node",
        ".node[data-ply]",
        ".move-text-component",
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
          const text = cleanMoveText(getMoveTextFromEl(el));
          if (!text || /^\d+\.?\s*$/.test(text)) return;
          const whiteEl = el.querySelector(
            ".white.node, .white-move, [class*=white]",
          );
          const blackEl = el.querySelector(
            ".black.node, .black-move, [class*=black]",
          );
          if (whiteEl || blackEl) {
            if (whiteEl)
              rawMoves.push(cleanMoveText(getMoveTextFromEl(whiteEl)));
            if (blackEl)
              rawMoves.push(cleanMoveText(getMoveTextFromEl(blackEl)));
          } else {
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
          return pgnMoves.trim();
        }
      }
    } catch (e) {
      /* next */
    }

    // Strategy E: Last resort — grab text from move list containers
    try {
      const containers = document.querySelectorAll(
        ".move-list, .vertical-move-list, .horizontal-move-list, [class*=moveList], [class*=move-list]",
      );
      for (const container of containers) {
        const text = cleanMoveText(getMoveTextFromEl(container));
        if (text && text.length > 4) {
          const cleaned = text
            .replace(/\s+/g, " ")
            .replace(/(\d+)\.\s*/g, "$1. ");
          if (/1\.\s*[a-hNBRQKO]/.test(cleaned)) return cleaned;
        }
      }
    } catch (e) {
      /* give up */
    }

    return null;
  }

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

  function showToast(message, type = "info") {
    const existing = document.getElementById("lichess-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "lichess-toast";
    toast.textContent = message;

    const bg =
      type === "error" ? "#ef5350" : type === "info" ? "#42a5f5" : "#66bb6a";

    Object.assign(toast.style, {
      position: "fixed",
      bottom: "80px",
      right: "20px",
      background: bg,
      color: "#fff",
      padding: "10px 16px",
      borderRadius: "8px",
      fontSize: "13px",
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      zIndex: "999999",
      transition: "opacity 0.3s ease",
      maxWidth: "280px",
    });

    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
})();
