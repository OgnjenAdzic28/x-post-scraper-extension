// X (Twitter) DOM selectors and utilities
// These selectors may need updates as X changes their DOM structure

export const X_SELECTORS = {
  // Post containers
  POSTS: [
    '[data-testid="tweet"]',
    'article[data-testid="tweet"]',
    '[data-testid="cellInnerDiv"] article',
    'div[data-testid="tweet"]'
  ],

  // Post content
  POST_TEXT: [
    '[data-testid="tweetText"]',
    'div[lang] span',
    'div[dir="auto"] span',
    '.tweet-text'
  ],

  // Author information
  AUTHOR: [
    '[data-testid="User-Name"] span',
    '[data-testid="User-Names"] span',
    'div[dir="ltr"] span',
    '.username'
  ],

  // Timestamp
  TIMESTAMP: [
    'time',
    '[datetime]',
    'a[href*="/status/"] time',
    '.tweet-timestamp'
  ],

  // Post URL
  POST_URL: [
    'a[href*="/status/"]',
    'time[datetime] parent::a',
    '.tweet-link'
  ],

  // Engagement metrics
  REPLY_BUTTON: [
    '[data-testid="reply"]',
    '[aria-label*="reply" i]',
    '[aria-label*="Reply" i]'
  ],

  RETWEET_BUTTON: [
    '[data-testid="retweet"]',
    '[aria-label*="retweet" i]',
    '[aria-label*="Retweet" i]'
  ],

  LIKE_BUTTON: [
    '[data-testid="like"]',
    '[aria-label*="like" i]',
    '[aria-label*="Like" i]'
  ],

  // Media
  IMAGES: [
    'img[src*="pbs.twimg.com"]',
    'img[src*="abs.twimg.com"]',
    '.tweet-media img'
  ],

  VIDEOS: [
    'video',
    '[data-testid="videoPlayer"] video',
    '.tweet-media video'
  ],

  // Profile specific
  PROFILE_COLUMN: [
    '[data-testid="primaryColumn"]',
    'main[role="main"]',
    '.main-content'
  ],

  // Loading indicators
  LOADING_SPINNER: [
    '[data-testid="spinner"]',
    '.loading',
    '[aria-label*="Loading"]'
  ]
};

export class SelectorUtils {
  /**
   * Find element using multiple selector strategies
   * @param {Element} container - Container to search within
   * @param {string[]} selectors - Array of selectors to try
   * @returns {Element|null} - First matching element or null
   */
  static findElement(container, selectors) {
    for (const selector of selectors) {
      try {
        const element = container.querySelector(selector);
        if (element) return element;
      } catch (error) {
        console.warn(`Invalid selector: ${selector}`, error);
      }
    }
    return null;
  }

  /**
   * Find all elements using multiple selector strategies
   * @param {Element} container - Container to search within
   * @param {string[]} selectors - Array of selectors to try
   * @returns {NodeList|Array} - All matching elements
   */
  static findElements(container, selectors) {
    for (const selector of selectors) {
      try {
        const elements = container.querySelectorAll(selector);
        if (elements.length > 0) return elements;
      } catch (error) {
        console.warn(`Invalid selector: ${selector}`, error);
      }
    }
    return [];
  }

  /**
   * Extract text content safely
   * @param {Element} element - Element to extract text from
   * @returns {string} - Cleaned text content
   */
  static extractText(element) {
    if (!element) return '';
    
    try {
      return element.innerText?.trim() || element.textContent?.trim() || '';
    } catch (error) {
      console.warn('Error extracting text:', error);
      return '';
    }
  }

  /**
   * Extract attribute safely
   * @param {Element} element - Element to extract attribute from
   * @param {string} attribute - Attribute name
   * @returns {string} - Attribute value or empty string
   */
  static extractAttribute(element, attribute) {
    if (!element) return '';
    
    try {
      return element.getAttribute(attribute) || '';
    } catch (error) {
      console.warn(`Error extracting attribute ${attribute}:`, error);
      return '';
    }
  }

  /**
   * Check if element is visible
   * @param {Element} element - Element to check
   * @returns {boolean} - True if element is visible
   */
  static isVisible(element) {
    if (!element) return false;
    
    try {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      
      return rect.width > 0 && 
             rect.height > 0 && 
             style.display !== 'none' && 
             style.visibility !== 'hidden' && 
             style.opacity !== '0';
    } catch (error) {
      console.warn('Error checking visibility:', error);
      return false;
    }
  }

  /**
   * Parse engagement count (handles K, M suffixes)
   * @param {string} text - Text containing count
   * @returns {number} - Parsed count
   */
  static parseEngagementCount(text) {
    if (!text) return 0;
    
    try {
      // Remove non-numeric characters except K, M, and decimal points
      const cleanText = text.replace(/[^\d.KMkm]/g, '');
      
      if (cleanText.includes('K') || cleanText.includes('k')) {
        return Math.floor(parseFloat(cleanText) * 1000);
      } else if (cleanText.includes('M') || cleanText.includes('m')) {
        return Math.floor(parseFloat(cleanText) * 1000000);
      }
      
      return parseInt(cleanText) || 0;
    } catch (error) {
      console.warn('Error parsing engagement count:', error);
      return 0;
    }
  }

  /**
   * Generate a simple hash for content
   * @param {string} content - Content to hash
   * @returns {string} - Hash string
   */
  static generateHash(content) {
    let hash = 0;
    if (!content) return '0';
    
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString();
  }

  /**
   * Wait for element to appear in DOM
   * @param {string} selector - CSS selector
   * @param {number} timeout - Timeout in milliseconds
   * @param {Element} container - Container to search within (default: document)
   * @returns {Promise<Element>} - Promise that resolves with element
   */
  static waitForElement(selector, timeout = 5000, container = document) {
    return new Promise((resolve, reject) => {
      const element = container.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver(() => {
        const element = container.querySelector(selector);
        if (element) {
          observer.disconnect();
          resolve(element);
        }
      });

      observer.observe(container, {
        childList: true,
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element ${selector} not found within ${timeout}ms`));
      }, timeout);
    });
  }

  /**
   * Debounce function calls
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in milliseconds
   * @returns {Function} - Debounced function
   */
  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
}
