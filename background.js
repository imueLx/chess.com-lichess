/**
 * background.js — Service worker for Chess.com → Lichess extension.
 *
 * Manages PGN paste injection into Lichess import pages. When the popup
 * opens a lichess.org/paste tab, this worker waits for the page to finish
 * loading and then fills in the PGN textarea automatically.
 */

"use strict";

/** @type {Map<number, string>} tabId → pgn */
const pendingPastes = new Map();

/* ------------------------------------------------------------------ */
/*  Lifecycle                                                          */
/* ------------------------------------------------------------------ */

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Chess.com→Lichess] Extension installed.");
});

/* ------------------------------------------------------------------ */
/*  Message handling                                                   */
/* ------------------------------------------------------------------ */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "schedulePgnPaste" && message.pgn && message.tabId) {
    pendingPastes.set(message.tabId, message.pgn);
    sendResponse({ ok: true });
  }
  return false;
});

/* ------------------------------------------------------------------ */
/*  Tab lifecycle — inject PGN when Lichess paste page is ready        */
/* ------------------------------------------------------------------ */

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !pendingPastes.has(tabId)) return;

  const pgn = pendingPastes.get(tabId);
  const url = tab?.url || "";

  // If user navigated away from /paste, clean up
  if (url && !url.includes("lichess.org/paste")) {
    pendingPastes.delete(tabId);
    return;
  }

  // Remove immediately to prevent re-injection on subsequent reloads
  pendingPastes.delete(tabId);

  // Inject script that fills the PGN textarea
  chrome.scripting
    .executeScript({
      target: { tabId },
      func: fillPgnTextarea,
      args: [pgn],
    })
    .catch((err) =>
      console.error("[Chess.com→Lichess] Failed to inject PGN:", err),
    );
});

chrome.tabs.onRemoved.addListener((tabId) => {
  pendingPastes.delete(tabId);
});

/* ------------------------------------------------------------------ */
/*  Injected function — runs inside the Lichess tab                    */
/* ------------------------------------------------------------------ */

/**
 * Attempts to fill the Lichess import textarea with the given PGN.
 * Retries up to 10 times (300 ms apart) to account for slow page loads.
 *
 * @param {string} pgnText - the PGN string to paste
 */
function fillPgnTextarea(pgnText) {
  function tryFill(attempts) {
    const textarea = document.querySelector(
      "textarea.copyable, textarea[name='pgn'], .paste textarea, form textarea",
    );

    if (textarea) {
      // Use the native setter to trigger React/Svelte change detection
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;

      if (setter) {
        setter.call(textarea, pgnText);
      } else {
        textarea.value = pgnText;
      }

      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
      textarea.focus();
    } else if (attempts > 0) {
      setTimeout(() => tryFill(attempts - 1), 300);
    }
  }

  tryFill(10);
}
