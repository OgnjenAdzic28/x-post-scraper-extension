// Content script for X Profile Post Scraper
// Runs on X profile pages and handles post extraction and scrolling

// Simple error handler for content script (since we can't import modules)
class SimpleErrorHandler {
  constructor() {
    this.errors = [];
  }

  logError(error, context = "unknown", metadata = {}) {
    const errorEntry = {
      timestamp: new Date().toISOString(),
      context: context,
      message: error instanceof Error ? error.message : error,
      metadata: metadata,
    };

    this.errors.push(errorEntry);
    console.error(`[${context}] ${errorEntry.message}`, errorEntry);

    // Send to background script
    try {
      chrome.runtime
        .sendMessage({
          action: "logError",
          error: errorEntry,
        })
        .catch(() => {});
    } catch (e) {}

    return errorEntry;
  }

  handleScrapingError(error, phase, state = {}) {
    return this.logError(error, `SCRAPING_${phase.toUpperCase()}`, {
      phase: phase,
      scrapingState: state,
      pageHeight: document.documentElement.scrollHeight,
      scrollPosition: window.pageYOffset,
      visiblePosts: document.querySelectorAll('[data-testid="tweet"]').length,
    });
  }
}

class XProfileScraper {
  constructor() {
    this.isScrapingActive = false;
    this.scrapedPosts = new Map(); // Use Map to avoid duplicates
    this.scrollCount = 0;
    this.settings = {
      scrollDelay: 2000,
      maxPosts: 100,
    };
    this.lastScrollHeight = 0;
    this.noNewContentCount = 0;
    this.maxNoNewContentAttempts = 3;
    this.errorHandler = new SimpleErrorHandler();
    this.retryAttempts = 0;
    this.maxRetryAttempts = 3;

    this.initializeListeners();
    this.checkIfProfilePage();
  }

  initializeListeners() {
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open
    });
  }

  checkIfProfilePage() {
    const isProfilePage = this.isXProfilePage(window.location.href);
    if (isProfilePage) {
      console.log("X Profile Scraper: Ready on profile page");
    }
  }

  isXProfilePage(url) {
    const profilePattern = /^https:\/\/(x|twitter)\.com\/[^\/]+\/?$/;
    return profilePattern.test(url);
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.action) {
        case "startScraping":
          await this.startScraping(message.settings);
          sendResponse({ success: true });
          break;

        case "stopScraping":
          this.stopScraping();
          sendResponse({ success: true });
          break;

        default:
          console.log("Unknown message action:", message.action);
      }
    } catch (error) {
      console.error("Error handling message:", error);
      this.sendErrorToPopup(error.message);
      sendResponse({ error: error.message });
    }
  }

  async startScraping(settings) {
    try {
      if (!this.isXProfilePage(window.location.href)) {
        throw new Error("Not on a valid X profile page");
      }

      this.settings = { ...this.settings, ...settings };
      this.isScrapingActive = true;
      this.scrapedPosts.clear();
      this.scrollCount = 0;
      this.lastScrollHeight = 0;
      this.noNewContentCount = 0;
      this.retryAttempts = 0;

      console.log("Starting X profile scraping with settings:", this.settings);

      // Send immediate confirmation that scraping started
      chrome.runtime
        .sendMessage({
          action: "scrapingStarted",
          message: "Scraping started successfully",
        })
        .catch((error) => {
          console.warn("Error sending scraping started message:", error);
        });

      // Send initial progress update
      this.sendProgressUpdate("Initializing scraper...", 0);

      await this.scrapeCurrentPosts();
      await this.startAutoScroll();
    } catch (error) {
      this.isScrapingActive = false;
      this.errorHandler.handleScrapingError(error, "initialization", {
        settings: this.settings,
        url: window.location.href,
      });

      this.sendErrorToPopup(`Scraping failed: ${error.message}`);
      throw error;
    }
  }

  stopScraping() {
    console.log("STOP SIGNAL RECEIVED - Setting isScrapingActive to false");
    this.isScrapingActive = false;

    // Send immediate feedback to popup
    this.sendProgressUpdate("Stopping scraper...", null);

    // Complete scraping with current posts
    setTimeout(() => {
      if (!this.isScrapingActive) {
        console.log("Completing scraping after stop signal");
        this.completeScraping();
      }
    }, 500);
  }

  async scrapeCurrentPosts() {
    // Wait for page to load
    await this.waitForElement('[data-testid="primaryColumn"]', 5000);

    const posts = this.extractPostsFromDOM();
    console.log(`Found ${posts.length} posts in current view`);

    posts.forEach((post) => {
      if (post.id && !this.scrapedPosts.has(post.id)) {
        this.scrapedPosts.set(post.id, post);
      }
    });

    this.sendProgressUpdate();
  }

  extractPostsFromDOM() {
    const posts = [];

    // Enhanced post detection with multiple selector strategies
    const postSelectors = [
      '[data-testid="tweet"]',
      'article[data-testid="tweet"]',
      '[data-testid="cellInnerDiv"] article',
      'div[data-testid="tweet"]',
      'article[role="article"]',
    ];

    let postElements = [];
    for (const selector of postSelectors) {
      try {
        postElements = document.querySelectorAll(selector);
        if (postElements.length > 0) {
          console.log(
            `Using selector: ${selector}, found ${postElements.length} posts`
          );
          break;
        }
      } catch (error) {
        console.warn(`Invalid selector: ${selector}`, error);
      }
    }

    if (postElements.length === 0) {
      console.warn("No post elements found with any selector");
      return posts;
    }

    // Filter out non-visible or duplicate elements
    const visiblePosts = Array.from(postElements).filter((element) => {
      return this.isElementVisible(element) && this.isValidPost(element);
    });

    console.log(
      `Found ${visiblePosts.length} visible, valid posts out of ${postElements.length} total`
    );

    visiblePosts.forEach((element, index) => {
      try {
        const post = this.extractPostData(element, index);
        if (post && this.isValidPostData(post)) {
          posts.push(post);
        }
      } catch (error) {
        console.warn("Error extracting post data:", error);
      }
    });

    return posts;
  }

  isElementVisible(element) {
    try {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);

      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0"
      );
    } catch (error) {
      return false;
    }
  }

  isValidPost(element) {
    // Check if element contains typical post content
    const hasText =
      element.querySelector('[data-testid="tweetText"]') ||
      element.querySelector("div[lang]") ||
      element.querySelector('div[dir="auto"]');

    const hasTime =
      element.querySelector("time") || element.querySelector("[datetime]");

    const hasMedia =
      element.querySelector('img[src*="pbs.twimg.com"]') ||
      element.querySelector("video");

    return hasText || hasTime || hasMedia;
  }

  isValidPostData(post) {
    // Ensure post has minimum required data
    return post.id && (post.text.length > 0 || post.media.length > 0);
  }

  extractPostData(element, index) {
    try {
      // Generate a unique ID for the post
      const postId = this.generatePostId(element);

      // Extract text content with multiple fallback strategies
      const text = this.extractPostText(element);

      // Extract timestamp with multiple strategies
      const timestamp = this.extractTimestamp(element);

      // Extract author info with multiple strategies
      const author = this.extractAuthor(element);

      // Extract engagement metrics
      const metrics = this.extractEngagementMetrics(element);

      // Extract media info
      const media = this.extractMediaInfo(element);

      // Only include posts with actual content
      if (!text && !media.length) {
        return null;
      }

      return {
        id: postId,
        order: this.scrapedPosts.size + 1,
        text: text,
        author: author,
        timestamp: timestamp,
        url: this.extractPostUrl(element),
        metrics: metrics,
        media: media,
        metadata: this.extractPostMetadata(element),
        scrapedAt: new Date().toISOString(),
        scrollPosition: this.scrollCount,
      };
    } catch (error) {
      console.warn("Error extracting individual post:", error);
      return null;
    }
  }

  extractPostText(element) {
    const textSelectors = [
      '[data-testid="tweetText"]',
      "div[lang] span",
      'div[dir="auto"] span',
      '[data-testid="tweetText"] span',
      ".tweet-text",
    ];

    for (const selector of textSelectors) {
      try {
        const textElement = element.querySelector(selector);
        if (textElement) {
          const text =
            textElement.innerText?.trim() || textElement.textContent?.trim();
          if (text && text.length > 0) {
            return text;
          }
        }
      } catch (error) {
        console.warn(`Error with text selector ${selector}:`, error);
      }
    }

    return "";
  }

  extractTimestamp(element) {
    const timeSelectors = [
      "time[datetime]",
      "time",
      "[datetime]",
      'a[href*="/status/"] time',
    ];

    for (const selector of timeSelectors) {
      try {
        const timeElement = element.querySelector(selector);
        if (timeElement) {
          return (
            timeElement.getAttribute("datetime") ||
            timeElement.getAttribute("title") ||
            timeElement.innerText?.trim() ||
            ""
          );
        }
      } catch (error) {
        console.warn(`Error with time selector ${selector}:`, error);
      }
    }

    return "";
  }

  extractAuthor(element) {
    const authorSelectors = [
      '[data-testid="User-Name"] span',
      '[data-testid="User-Names"] span',
      'div[dir="ltr"] span',
      '[data-testid="User-Name"]',
      ".username",
    ];

    for (const selector of authorSelectors) {
      try {
        const authorElement = element.querySelector(selector);
        if (authorElement) {
          const authorText =
            authorElement.innerText?.trim() ||
            authorElement.textContent?.trim();
          if (
            authorText &&
            authorText.length > 0 &&
            !authorText.includes("@")
          ) {
            return authorText;
          }
        }
      } catch (error) {
        console.warn(`Error with author selector ${selector}:`, error);
      }
    }

    return "";
  }

  extractPostMetadata(element) {
    const metadata = {
      isRetweet: false,
      isReply: false,
      hasThread: false,
      language: "",
      verified: false,
    };

    try {
      // Check if it's a retweet
      metadata.isRetweet =
        !!element.querySelector('[data-testid="socialContext"]') ||
        !!element.querySelector('[aria-label*="retweeted"]');

      // Check if it's a reply
      metadata.isReply =
        !!element.querySelector('[data-testid="reply"]') ||
        element.innerText.includes("Replying to");

      // Check for thread indicator
      metadata.hasThread =
        !!element.querySelector('[aria-label*="thread"]') ||
        element.innerText.includes("Show this thread");

      // Extract language
      const langElement = element.querySelector("[lang]");
      if (langElement) {
        metadata.language = langElement.getAttribute("lang") || "";
      }

      // Check for verified badge
      metadata.verified =
        !!element.querySelector('[data-testid="icon-verified"]') ||
        !!element.querySelector('[aria-label*="Verified"]');
    } catch (error) {
      console.warn("Error extracting metadata:", error);
    }

    return metadata;
  }

  generatePostId(element) {
    // Try to find a unique identifier
    const linkElement = element.querySelector('a[href*="/status/"]');
    if (linkElement) {
      const href = linkElement.getAttribute("href");
      const statusMatch = href.match(/\/status\/(\d+)/);
      if (statusMatch) {
        return statusMatch[1];
      }
    }

    // Fallback: use text content hash
    const text = element.innerText.trim();
    return this.simpleHash(text + Date.now());
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString();
  }

  extractPostUrl(element) {
    const linkElement = element.querySelector('a[href*="/status/"]');
    if (linkElement) {
      const href = linkElement.getAttribute("href");
      return href.startsWith("http") ? href : `https://x.com${href}`;
    }
    return "";
  }

  extractEngagementMetrics(element) {
    const metrics = {
      replies: 0,
      retweets: 0,
      likes: 0,
      views: 0,
    };

    try {
      // Look for engagement buttons and their counts
      const buttons = element.querySelectorAll('[role="button"]');
      buttons.forEach((button) => {
        const text = button.innerText.trim();
        const ariaLabel = button.getAttribute("aria-label") || "";

        if (ariaLabel.includes("reply") || ariaLabel.includes("Reply")) {
          metrics.replies = this.parseCount(text);
        } else if (
          ariaLabel.includes("retweet") ||
          ariaLabel.includes("Retweet")
        ) {
          metrics.retweets = this.parseCount(text);
        } else if (ariaLabel.includes("like") || ariaLabel.includes("Like")) {
          metrics.likes = this.parseCount(text);
        }
      });
    } catch (error) {
      console.warn("Error extracting metrics:", error);
    }

    return metrics;
  }

  parseCount(text) {
    if (!text) return 0;

    // Handle K, M suffixes
    const cleanText = text.replace(/[^\d.KMkm]/g, "");
    if (cleanText.includes("K") || cleanText.includes("k")) {
      return Math.floor(parseFloat(cleanText) * 1000);
    } else if (cleanText.includes("M") || cleanText.includes("m")) {
      return Math.floor(parseFloat(cleanText) * 1000000);
    }

    return parseInt(cleanText) || 0;
  }

  extractMediaInfo(element) {
    const media = [];

    try {
      // Images
      const images = element.querySelectorAll('img[src*="pbs.twimg.com"]');
      images.forEach((img) => {
        media.push({
          type: "image",
          url: img.src,
          alt: img.alt || "",
        });
      });

      // Videos
      const videos = element.querySelectorAll("video");
      videos.forEach((video) => {
        media.push({
          type: "video",
          url: video.src || "",
          poster: video.poster || "",
        });
      });
    } catch (error) {
      console.warn("Error extracting media:", error);
    }

    return media;
  }

  async startAutoScroll() {
    console.log("Starting auto-scroll process...");
    let consecutiveEmptyScrolls = 0;
    const maxConsecutiveEmptyScrolls = 2; // Reduced from 3 to 2
    let lastPostCount = 0;
    let noNewPostsStartTime = null;

    while (this.isScrapingActive) {
      // Check if we've reached the max posts limit
      if (this.scrapedPosts.size >= this.settings.maxPosts) {
        console.log(
          `Reached max posts limit: ${this.settings.maxPosts} (current: ${this.scrapedPosts.size})`
        );
        break;
      }
      const postsBeforeScroll = this.scrapedPosts.size;

      // Perform scroll and wait for content
      const scrollResult = await this.performScroll();
      if (!scrollResult.success) {
        console.log("Scroll failed, stopping...");
        break;
      }

      // Check if user stopped scraping
      if (!this.isScrapingActive) {
        console.log("Scraping stopped by user");
        break;
      }

      await this.waitForNewContent();

      // Check again after waiting
      if (!this.isScrapingActive) {
        console.log("Scraping stopped by user during wait");
        break;
      }

      await this.scrapeCurrentPosts();

      const postsAfterScroll = this.scrapedPosts.size;
      const newPostsFound = postsAfterScroll - postsBeforeScroll;

      console.log(
        `Scroll ${this.scrollCount}: Found ${newPostsFound} new posts (total: ${postsAfterScroll})`
      );

      // Check if we've reached the max posts limit
      if (postsAfterScroll >= this.settings.maxPosts) {
        console.log(`Reached max posts limit: ${this.settings.maxPosts}`);
        break;
      }

      // Track when we stop finding new posts
      if (newPostsFound === 0) {
        if (noNewPostsStartTime === null) {
          noNewPostsStartTime = Date.now();
          console.log("Started 5-second countdown - no new posts found");
        } else {
          const timeWithoutNewPosts = Date.now() - noNewPostsStartTime;
          console.log(
            `No new posts for ${Math.round(timeWithoutNewPosts / 1000)}s`
          );

          // If 5 seconds have passed without new posts, stop
          if (timeWithoutNewPosts >= 5000) {
            console.log("5 seconds without new posts - stopping scraper");
            break;
          }
        }
        consecutiveEmptyScrolls++;
      } else {
        // Reset timer when we find new posts
        noNewPostsStartTime = null;
        consecutiveEmptyScrolls = 0;
        console.log("Found new posts - resetting timer");
      }

      // Backup check - if too many consecutive empty scrolls
      if (consecutiveEmptyScrolls >= maxConsecutiveEmptyScrolls) {
        console.log(
          `Too many consecutive empty scrolls (${consecutiveEmptyScrolls})`
        );
        break;
      }

      // Check for rate limiting indicators
      if (await this.checkForRateLimiting()) {
        console.log("Rate limiting detected, stopping...");
        break;
      }

      // Check one more time before delay
      if (!this.isScrapingActive) {
        console.log("Scraping stopped by user before delay");
        break;
      }

      await this.delay(this.settings.scrollDelay);
    }

    this.completeScraping();
  }

  async performScroll() {
    const currentHeight = document.documentElement.scrollHeight;
    const currentScrollTop =
      window.pageYOffset || document.documentElement.scrollTop;

    try {
      // Check if we're already at the bottom
      if (currentScrollTop + window.innerHeight >= currentHeight - 100) {
        console.log("Already near bottom, performing gentle scroll");
        window.scrollBy(0, 100);
      } else {
        // Scroll to bottom with smooth behavior
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: "smooth",
        });
      }

      this.scrollCount++;

      // Wait a bit for smooth scroll to complete
      await this.delay(500);

      const newHeight = document.documentElement.scrollHeight;
      const heightChanged = newHeight > currentHeight;

      console.log(
        `Scroll ${this.scrollCount}: ${currentHeight} -> ${newHeight} (changed: ${heightChanged})`
      );

      return {
        success: true,
        heightChanged: heightChanged,
        oldHeight: currentHeight,
        newHeight: newHeight,
      };
    } catch (error) {
      console.error("Error during scroll:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async waitForNewContent() {
    const initialHeight = document.documentElement.scrollHeight;
    const initialPostCount = document.querySelectorAll(
      '[data-testid="tweet"]'
    ).length;
    const maxWaitTime = 10000; // 10 seconds max wait
    const checkInterval = 500; // Check every 500ms
    let waitTime = 0;

    console.log(
      `Waiting for new content... Initial height: ${initialHeight}, posts: ${initialPostCount}`
    );

    while (waitTime < maxWaitTime && this.isScrapingActive) {
      await this.delay(checkInterval);
      waitTime += checkInterval;

      const currentHeight = document.documentElement.scrollHeight;
      const currentPostCount = document.querySelectorAll(
        '[data-testid="tweet"]'
      ).length;

      // Check for loading indicators
      const isLoading = this.checkForLoadingIndicators();

      if (
        currentHeight > initialHeight ||
        currentPostCount > initialPostCount
      ) {
        console.log(
          `New content loaded - Height: ${currentHeight}, Posts: ${currentPostCount}`
        );
        this.noNewContentCount = 0;
        this.lastScrollHeight = currentHeight;

        // Wait a bit more for content to fully load
        if (isLoading) {
          console.log("Still loading, waiting a bit more...");
          await this.delay(1000);
        }

        return true;
      }

      // If we see loading indicators, extend wait time slightly
      if (isLoading && waitTime < maxWaitTime) {
        console.log("Loading indicators detected, extending wait...");
        continue;
      }
    }

    // No new content loaded
    this.noNewContentCount++;
    console.log(
      `No new content after scroll ${this.scrollCount} (attempt ${this.noNewContentCount})`
    );
    return false;
  }

  checkForLoadingIndicators() {
    const loadingSelectors = [
      '[data-testid="spinner"]',
      ".loading",
      '[aria-label*="Loading"]',
      '[data-testid="cellInnerDiv"] [role="progressbar"]',
    ];

    for (const selector of loadingSelectors) {
      if (document.querySelector(selector)) {
        return true;
      }
    }
    return false;
  }

  async checkForRateLimiting() {
    // Check for common rate limiting indicators
    const rateLimitSelectors = [
      '[data-testid="error"]',
      ".error-message",
      '[aria-label*="error"]',
      'text*="rate limit"',
      'text*="try again"',
    ];

    for (const selector of rateLimitSelectors) {
      try {
        if (document.querySelector(selector)) {
          console.warn("Potential rate limiting detected");
          return true;
        }
      } catch (error) {
        // Ignore selector errors
      }
    }

    // Check if we're getting redirected or blocked
    if (
      window.location.href.includes("error") ||
      window.location.href.includes("suspended") ||
      document.title.includes("Error")
    ) {
      console.warn("Page error detected");
      return true;
    }

    return false;
  }

  hasReachedEnd() {
    return this.noNewContentCount >= this.maxNoNewContentAttempts;
  }

  sendProgressUpdate(message = "", customProgress = null) {
    const progress =
      customProgress !== null
        ? customProgress
        : Math.min(
            (this.scrapedPosts.size / this.settings.maxPosts) * 100,
            100
          );

    const updateData = {
      action: "updateProgress",
      posts: Array.from(this.scrapedPosts.values()),
      progress: progress,
      scrollCount: this.scrollCount,
      message: message,
      stats: {
        postsFound: this.scrapedPosts.size,
        maxPosts: this.settings.maxPosts,
        scrollsPerformed: this.scrollCount,
        noNewContentCount: this.noNewContentCount,
        retryAttempts: this.retryAttempts,
        pageHeight: document.documentElement.scrollHeight,
        isActive: this.isScrapingActive,
      },
      timestamp: new Date().toISOString(),
    };

    chrome.runtime.sendMessage(updateData).catch((error) => {
      console.warn("Error sending progress update:", error);
      this.errorHandler.logError(error, "PROGRESS_UPDATE", updateData);
    });
  }

  completeScraping() {
    this.isScrapingActive = false;

    // Get all posts and sort them
    let posts = Array.from(this.scrapedPosts.values());

    // Remove any duplicates that might have slipped through
    posts = this.removeDuplicatePosts(posts);

    // Sort posts chronologically (newest first) and assign final order numbers
    posts = this.sortAndOrderPosts(posts);

    console.log(
      `Scraping complete! Found ${posts.length} unique posts after deduplication and sorting`
    );

    chrome.runtime
      .sendMessage({
        action: "scrapingComplete",
        posts: posts,
        totalScrolls: this.scrollCount,
        stats: this.getScrapingStats(posts),
      })
      .catch((error) => {
        console.warn("Error sending completion message:", error);
      });
  }

  removeDuplicatePosts(posts) {
    const seen = new Set();
    const uniquePosts = [];

    for (const post of posts) {
      // Create a content-based hash for additional deduplication
      const contentHash = this.createContentHash(post);

      if (!seen.has(post.id) && !seen.has(contentHash)) {
        seen.add(post.id);
        seen.add(contentHash);
        uniquePosts.push(post);
      } else {
        console.log(`Removing duplicate post: ${post.id}`);
      }
    }

    console.log(`Removed ${posts.length - uniquePosts.length} duplicate posts`);
    return uniquePosts;
  }

  createContentHash(post) {
    // Create a hash based on text content and timestamp for additional deduplication
    const content = `${post.text}|${post.timestamp}|${post.author}`;
    return this.simpleHash(content);
  }

  sortAndOrderPosts(posts) {
    // Sort posts by timestamp (newest first), then by scroll position as fallback
    posts.sort((a, b) => {
      // Try to parse timestamps
      const timeA = this.parseTimestamp(a.timestamp);
      const timeB = this.parseTimestamp(b.timestamp);

      if (timeA && timeB) {
        return timeB - timeA; // Newest first
      }

      // Fallback to scroll position (earlier scroll = older post)
      return a.scrollPosition - b.scrollPosition;
    });

    // Assign final order numbers
    posts.forEach((post, index) => {
      post.finalOrder = index + 1;
    });

    return posts;
  }

  parseTimestamp(timestamp) {
    if (!timestamp) return null;

    try {
      // Handle ISO format timestamps
      if (timestamp.includes("T") && timestamp.includes("Z")) {
        return new Date(timestamp);
      }

      // Handle relative timestamps like "2h", "1d", etc.
      const relativeMatch = timestamp.match(/(\d+)([smhd])/);
      if (relativeMatch) {
        const value = parseInt(relativeMatch[1]);
        const unit = relativeMatch[2];
        const now = new Date();

        switch (unit) {
          case "s":
            return new Date(now.getTime() - value * 1000);
          case "m":
            return new Date(now.getTime() - value * 60 * 1000);
          case "h":
            return new Date(now.getTime() - value * 60 * 60 * 1000);
          case "d":
            return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
        }
      }

      // Try to parse as regular date
      return new Date(timestamp);
    } catch (error) {
      console.warn("Error parsing timestamp:", timestamp, error);
      return null;
    }
  }

  getScrapingStats(posts) {
    const stats = {
      totalPosts: posts.length,
      totalScrolls: this.scrollCount,
      postsWithMedia: posts.filter((p) => p.media && p.media.length > 0).length,
      postsWithText: posts.filter((p) => p.text && p.text.length > 0).length,
      retweets: posts.filter((p) => p.metadata && p.metadata.isRetweet).length,
      replies: posts.filter((p) => p.metadata && p.metadata.isReply).length,
      threads: posts.filter((p) => p.metadata && p.metadata.hasThread).length,
      verified: posts.filter((p) => p.metadata && p.metadata.verified).length,
      languages: [
        ...new Set(posts.map((p) => p.metadata?.language).filter(Boolean)),
      ],
      dateRange: this.getDateRange(posts),
    };

    return stats;
  }

  getDateRange(posts) {
    const dates = posts
      .map((p) => this.parseTimestamp(p.timestamp))
      .filter(Boolean)
      .sort((a, b) => a - b);

    if (dates.length === 0) return null;

    return {
      oldest: dates[0].toISOString(),
      newest: dates[dates.length - 1].toISOString(),
      span: dates.length > 1 ? dates[dates.length - 1] - dates[0] : 0,
    };
  }

  sendErrorToPopup(error) {
    chrome.runtime
      .sendMessage({
        action: "scrapingError",
        error: error,
      })
      .catch((err) => {
        console.warn("Error sending error message:", err);
      });
  }

  async waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (element) {
          observer.disconnect();
          resolve(element);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element ${selector} not found within ${timeout}ms`));
      }, timeout);
    });
  }

  delay(ms) {
    return new Promise((resolve) => {
      const checkInterval = 100; // Check every 100ms
      let elapsed = 0;

      const intervalId = setInterval(() => {
        elapsed += checkInterval;

        // If scraping was stopped, resolve immediately
        if (!this.isScrapingActive) {
          clearInterval(intervalId);
          resolve();
          return;
        }

        // If delay time has elapsed, resolve
        if (elapsed >= ms) {
          clearInterval(intervalId);
          resolve();
        }
      }, checkInterval);
    });
  }
}

// Initialize scraper when content script loads
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    new XProfileScraper();
  });
} else {
  new XProfileScraper();
}
