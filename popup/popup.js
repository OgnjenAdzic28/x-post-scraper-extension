class PopupController {
  constructor() {
    this.isScrapingActive = false;
    this.scrapedPosts = [];
    this.initializeElements();
    this.attachEventListeners();
    this.loadState();
  }

  initializeElements() {
    this.elements = {
      status: document.getElementById("status"),
      startBtn: document.getElementById("startBtn"),
      stopBtn: document.getElementById("stopBtn"),
      downloadBtn: document.getElementById("downloadBtn"),
      progressFill: document.getElementById("progressFill"),
      postCount: document.getElementById("postCount"),
      scrollCount: document.getElementById("scrollCount"),
      scrollDelay: document.getElementById("scrollDelay"),
      maxPosts: document.getElementById("maxPosts"),
    };
  }

  attachEventListeners() {
    this.elements.startBtn.addEventListener("click", () =>
      this.startScraping()
    );
    this.elements.stopBtn.addEventListener("click", () => this.stopScraping());
    this.elements.downloadBtn.addEventListener("click", () =>
      this.downloadData()
    );

    // Save settings when changed
    this.elements.scrollDelay.addEventListener("change", () =>
      this.saveSettings()
    );
    this.elements.maxPosts.addEventListener("change", () =>
      this.saveSettings()
    );
  }

  async loadState() {
    try {
      // Get current tab to check if we're on X
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!this.isXProfilePage(tab.url)) {
        this.updateStatus("Please navigate to an X profile page", "error");
        this.elements.startBtn.disabled = true;
        return;
      }

      // Load saved settings
      const result = await chrome.storage.local.get([
        "scrollDelay",
        "maxPosts",
        "scrapedPosts",
        "isScrapingActive",
      ]);

      if (result.scrollDelay)
        this.elements.scrollDelay.value = result.scrollDelay;
      if (result.maxPosts) this.elements.maxPosts.value = result.maxPosts;
      if (result.scrapedPosts) {
        this.scrapedPosts = result.scrapedPosts;
        this.updateStats();
      }
      if (result.isScrapingActive) {
        this.isScrapingActive = result.isScrapingActive;
        this.updateUIForScrapingState();
      }

      // Listen for updates from content script
      chrome.runtime.onMessage.addListener((message) => {
        this.handleMessage(message);
      });
    } catch (error) {
      console.error("Error loading state:", error);
      this.updateStatus("Error loading extension state", "error");
    }
  }

  isXProfilePage(url) {
    if (!url) return false;
    const xProfilePattern = /^https:\/\/(x|twitter)\.com\/[^\/]+\/?$/;
    return xProfilePattern.test(url);
  }

  async startScraping() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!this.isXProfilePage(tab.url)) {
        this.updateStatus("Please navigate to an X profile page", "error");
        return;
      }

      const settings = {
        scrollDelay: parseInt(this.elements.scrollDelay.value),
        maxPosts: parseInt(this.elements.maxPosts.value),
      };

      // Send message to content script to start scraping
      await chrome.tabs.sendMessage(tab.id, {
        action: "startScraping",
        settings: settings,
      });

      this.isScrapingActive = true;
      this.updateUIForScrapingState();
      this.updateStatus("Scraping in progress...", "scraping");

      // Force UI update to ensure stop button is enabled
      console.log("Enabling stop button, disabling start button");
      this.elements.startBtn.disabled = true;
      this.elements.stopBtn.disabled = false;

      // Save state
      await chrome.storage.local.set({ isScrapingActive: true });

      // Fallback: If we don't get confirmation within 3 seconds, assume scraping started
      setTimeout(() => {
        if (this.isScrapingActive && this.elements.stopBtn.disabled) {
          console.log("Fallback: Enabling stop button after 3 seconds");
          this.elements.stopBtn.disabled = false;
          this.updateUIForScrapingState();
        }
      }, 3000);
    } catch (error) {
      console.error("Error starting scraping:", error);
      this.updateStatus("Error starting scraper", "error");
      // Reset UI state on error
      this.isScrapingActive = false;
      this.updateUIForScrapingState();
    }
  }

  async stopScraping() {
    try {
      console.log("Stop button clicked - stopping scraper");

      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      await chrome.tabs.sendMessage(tab.id, {
        action: "stopScraping",
      });

      this.isScrapingActive = false;

      // Force UI update immediately
      console.log("Disabling stop button, enabling start button");
      this.elements.startBtn.disabled = false;
      this.elements.stopBtn.disabled = true;

      this.updateUIForScrapingState();
      this.updateStatus("Scraping stopped by user", "idle");

      // Save state
      await chrome.storage.local.set({ isScrapingActive: false });

      console.log("Stop operation completed");
    } catch (error) {
      console.error("Error stopping scraping:", error);
      this.updateStatus("Error stopping scraper", "error");
    }
  }

  async downloadData() {
    console.log(`Download requested for ${this.scrapedPosts.length} posts`);

    if (this.scrapedPosts.length === 0) {
      this.updateStatus("No data to download", "error");
      return;
    }

    // Check if downloads permission is available
    try {
      if (!chrome.downloads) {
        throw new Error("Downloads API not available");
      }
    } catch (permError) {
      console.error("Downloads permission error:", permError);
      this.updateStatus("Downloads permission required", "error");
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const url = new URL(tab.url);
      const username = url.pathname.substring(1); // Remove leading slash

      // Get additional metadata from storage
      const result = await chrome.storage.local.get([
        "scrapingStats",
        "scrollDelay",
        "maxPosts",
      ]);

      const data = this.formatDataForDownload(
        username,
        this.scrapedPosts,
        result
      );

      // Update status to show download preparation
      this.updateStatus(
        `Preparing download for ${this.scrapedPosts.length} posts...`,
        "idle"
      );

      try {
        // Create JSON download
        console.log("Starting JSON download...");
        await this.downloadJSON(data, username);

        // Small delay between downloads
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Optionally create CSV format for smaller datasets
        if (this.scrapedPosts.length > 0 && this.scrapedPosts.length <= 500) {
          console.log("Starting CSV download...");
          await this.downloadCSV(this.scrapedPosts, username);
        } else if (this.scrapedPosts.length > 500) {
          console.log("Skipping CSV download for large dataset (>500 posts)");
        }

        this.updateStatus("Download completed successfully", "idle");
      } catch (downloadError) {
        console.error("Download failed:", downloadError);
        this.updateStatus(`Download failed: ${downloadError.message}`, "error");
        throw downloadError;
      }
    } catch (error) {
      console.error("Error downloading data:", error);
      this.updateStatus("Error downloading data", "error");
    }
  }

  formatDataForDownload(username, posts, metadata) {
    const now = new Date();

    return {
      metadata: {
        profile: {
          username: username,
          url: `https://x.com/${username}`,
          scrapedAt: now.toISOString(),
          scrapedDate: now.toLocaleDateString(),
          scrapedTime: now.toLocaleTimeString(),
        },
        scraping: {
          totalPosts: posts.length,
          settings: {
            scrollDelay: metadata.scrollDelay || 2000,
            maxPosts: metadata.maxPosts || 100,
          },
          stats: metadata.scrapingStats || {},
          version: "1.0.0",
          userAgent: navigator.userAgent,
        },
      },
      posts: posts.map((post) => ({
        ...post,
        // Add computed fields
        textLength: post.text ? post.text.length : 0,
        hasMedia: post.media && post.media.length > 0,
        mediaCount: post.media ? post.media.length : 0,
        engagementTotal:
          (post.metrics?.likes || 0) +
          (post.metrics?.retweets || 0) +
          (post.metrics?.replies || 0),
      })),
    };
  }

  async downloadJSON(data, username) {
    try {
      console.log(`Preparing to download JSON with ${data.posts.length} posts`);

      // For large datasets, use compact JSON (no pretty printing)
      const jsonString =
        data.posts.length > 50
          ? JSON.stringify(data)
          : JSON.stringify(data, null, 2);

      console.log(
        `JSON string size: ${(jsonString.length / 1024 / 1024).toFixed(2)} MB`
      );

      const blob = new Blob([jsonString], {
        type: "application/json",
      });

      console.log(`Blob size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);

      const url_blob = URL.createObjectURL(blob);

      const timestamp = new Date().toISOString().split("T")[0];
      const filename = `x-posts-${username}-${timestamp}.json`;

      console.log(`Starting download: ${filename}`);

      const downloadId = await chrome.downloads.download({
        url: url_blob,
        filename: filename,
        saveAs: true,
      });

      console.log(`Download started with ID: ${downloadId}`);

      // Clean up the blob URL after a longer delay for large files
      setTimeout(() => {
        URL.revokeObjectURL(url_blob);
        console.log("Blob URL cleaned up");
      }, 5000);

      return downloadId;
    } catch (error) {
      console.error("Error in downloadJSON:", error);
      throw error;
    }
  }

  async downloadCSV(posts, username) {
    const csvContent = this.convertToCSV(posts);
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url_blob = URL.createObjectURL(blob);

    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `x-posts-${username}-${timestamp}.csv`;

    await chrome.downloads.download({
      url: url_blob,
      filename: filename,
      saveAs: false, // Don't prompt for CSV, just download
    });

    // Clean up the blob URL
    setTimeout(() => URL.revokeObjectURL(url_blob), 1000);
  }

  convertToCSV(posts) {
    if (posts.length === 0) return "";

    // Define CSV headers
    const headers = [
      "Order",
      "ID",
      "Text",
      "Author",
      "Timestamp",
      "URL",
      "Likes",
      "Retweets",
      "Replies",
      "Media Count",
      "Is Retweet",
      "Is Reply",
      "Has Thread",
      "Language",
      "Verified",
      "Scraped At",
    ];

    // Convert posts to CSV rows
    const rows = posts.map((post) => [
      post.finalOrder || post.order || "",
      post.id || "",
      `"${(post.text || "").replace(/"/g, '""')}"`, // Escape quotes
      `"${(post.author || "").replace(/"/g, '""')}"`,
      post.timestamp || "",
      post.url || "",
      post.metrics?.likes || 0,
      post.metrics?.retweets || 0,
      post.metrics?.replies || 0,
      post.media?.length || 0,
      post.metadata?.isRetweet || false,
      post.metadata?.isReply || false,
      post.metadata?.hasThread || false,
      post.metadata?.language || "",
      post.metadata?.verified || false,
      post.scrapedAt || "",
    ]);

    // Combine headers and rows
    const csvLines = [headers.join(","), ...rows.map((row) => row.join(","))];
    return csvLines.join("\n");
  }

  handleMessage(message) {
    switch (message.action) {
      case "updateProgress":
        // Ensure we maintain scraping state during progress updates
        if (!this.isScrapingActive && message.stats && message.stats.isActive) {
          console.log(
            "Content script reports scraping is active - updating UI"
          );
          this.isScrapingActive = true;
          this.updateUIForScrapingState();
        }

        this.scrapedPosts = message.posts;
        this.updateStats();
        this.updateProgress(message.progress);

        // Update status with progress message if provided
        if (message.message) {
          this.updateStatus(message.message, "scraping");
        }
        break;

      case "scrapingStarted":
        console.log(
          "Received scraping started confirmation from content script"
        );
        this.isScrapingActive = true;
        this.updateUIForScrapingState();
        this.updateStatus("Scraping in progress...", "scraping");
        break;

      case "scrapingComplete":
        this.isScrapingActive = false;
        this.scrapedPosts = message.posts;
        this.updateUIForScrapingState();
        this.updateStats();

        // Show detailed completion message
        const stats = message.stats;
        let statusMessage = `Scraping complete! Found ${message.posts.length} posts`;
        if (stats) {
          statusMessage += ` (${stats.postsWithText} with text, ${stats.postsWithMedia} with media)`;
        }

        this.updateStatus(statusMessage, "idle");
        this.elements.scrollCount.textContent = message.totalScrolls || 0;

        chrome.storage.local.set({
          isScrapingActive: false,
          scrapedPosts: message.posts,
          scrapingStats: message.stats,
        });
        break;

      case "scrapingError":
        this.isScrapingActive = false;
        this.updateUIForScrapingState();
        this.updateStatus(`Error: ${message.error}`, "error");
        chrome.storage.local.set({ isScrapingActive: false });
        break;
    }
  }

  updateUIForScrapingState() {
    this.elements.startBtn.disabled = this.isScrapingActive;
    this.elements.stopBtn.disabled = !this.isScrapingActive;
    this.elements.downloadBtn.disabled = this.scrapedPosts.length === 0;

    console.log(
      `UI State - Scraping: ${this.isScrapingActive}, Posts: ${
        this.scrapedPosts.length
      }, Download enabled: ${!this.elements.downloadBtn.disabled}`
    );
  }

  updateStatus(message, type) {
    this.elements.status.textContent = message;
    this.elements.status.className = `status ${type}`;
  }

  updateStats() {
    this.elements.postCount.textContent = this.scrapedPosts.length;
  }

  updateProgress(progress) {
    this.elements.progressFill.style.width = `${progress}%`;
  }

  async saveSettings() {
    const settings = {
      scrollDelay: parseInt(this.elements.scrollDelay.value),
      maxPosts: parseInt(this.elements.maxPosts.value),
    };

    await chrome.storage.local.set(settings);
  }
}

// Initialize popup when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new PopupController();
});
