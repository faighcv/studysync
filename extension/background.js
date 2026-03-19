// background.js — service worker for StudySync

const API_BASE = "https://studysync-tyz6.onrender.com";

// Pin the API base URL on first install
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.sync.set({ apiBase: API_BASE });
});
