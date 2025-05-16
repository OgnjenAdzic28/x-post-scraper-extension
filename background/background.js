// Background script for X Profile Post Scraper
// Handles extension lifecycle and communication between components

class BackgroundService {
  constructor() {
    this.initializeListeners();
  }

  initializeListeners() {
    // Handle extension installation
    chrome.runtime.onInstalled.addListener((details) => {
      this.handleInstallation(details);
    });

    // Handle messages from content scripts and popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });

    // Handle tab updates to check if user navigates away from X
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      this.handleTabUpdate(tabId, changeInfo, tab);
    });
  }

  handleInstallation(details) {
    if (details.reason === 'install') {
      console.log('X Profile Post Scraper installed');
      
      // Set default settings
      chrome.storage.local.set({
        scrollDelay: 2000,
        maxPosts: 100,
        isScrapingActive: false,
        scrapedPosts: []
      });
    }
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.action) {
        case 'getTabInfo':
          const tab = await this.getCurrentTab();
          sendResponse({ tab });
          break;

        case 'saveScrapedData':
          await this.saveScrapedData(message.data);
          sendResponse({ success: true });
          break;

        case 'logError':
          console.error('Content script error:', message.error);
          break;

        default:
          console.log('Unknown message action:', message.action);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ error: error.message });
    }
  }

  async handleTabUpdate(tabId, changeInfo, tab) {
    // If user navigates away from X while scraping, stop the scraping
    if (changeInfo.url && !this.isXUrl(changeInfo.url)) {
      const result = await chrome.storage.local.get(['isScrapingActive']);
      if (result.isScrapingActive) {
        await chrome.storage.local.set({ isScrapingActive: false });
        console.log('Scraping stopped due to navigation away from X');
      }
    }
  }

  async getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async saveScrapedData(data) {
    await chrome.storage.local.set({
      scrapedPosts: data.posts,
      lastScrapedAt: new Date().toISOString()
    });
  }

  isXUrl(url) {
    return url && (url.includes('x.com') || url.includes('twitter.com'));
  }
}

// Initialize background service
new BackgroundService();
