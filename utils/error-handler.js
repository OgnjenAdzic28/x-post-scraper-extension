// Error handling and logging utilities for X Profile Post Scraper

export class ErrorHandler {
  constructor() {
    this.errors = [];
    this.maxErrors = 100; // Keep last 100 errors
  }

  /**
   * Log an error with context
   * @param {Error|string} error - Error object or message
   * @param {string} context - Context where error occurred
   * @param {Object} metadata - Additional metadata
   */
  logError(error, context = 'unknown', metadata = {}) {
    const errorEntry = {
      timestamp: new Date().toISOString(),
      context: context,
      message: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : null,
      metadata: metadata,
      id: this.generateErrorId()
    };

    this.errors.push(errorEntry);
    
    // Keep only the last maxErrors entries
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }

    // Log to console for debugging
    console.error(`[${context}] ${errorEntry.message}`, errorEntry);

    // Send to background script for potential reporting
    this.reportError(errorEntry);

    return errorEntry.id;
  }

  /**
   * Handle DOM-related errors
   * @param {Error} error - DOM error
   * @param {string} selector - CSS selector that failed
   * @param {Element} element - Element context
   */
  handleDOMError(error, selector = '', element = null) {
    const metadata = {
      selector: selector,
      elementExists: !!element,
      elementTag: element?.tagName,
      elementId: element?.id,
      elementClass: element?.className,
      url: window.location.href
    };

    return this.logError(error, 'DOM_ERROR', metadata);
  }

  /**
   * Handle network/communication errors
   * @param {Error} error - Network error
   * @param {string} operation - Operation that failed
   * @param {Object} details - Additional details
   */
  handleNetworkError(error, operation = '', details = {}) {
    const metadata = {
      operation: operation,
      userAgent: navigator.userAgent,
      online: navigator.onLine,
      ...details
    };

    return this.logError(error, 'NETWORK_ERROR', metadata);
  }

  /**
   * Handle scraping-specific errors
   * @param {Error} error - Scraping error
   * @param {string} phase - Scraping phase (scroll, extract, etc.)
   * @param {Object} state - Current scraping state
   */
  handleScrapingError(error, phase = '', state = {}) {
    const metadata = {
      phase: phase,
      scrapingState: state,
      pageHeight: document.documentElement.scrollHeight,
      scrollPosition: window.pageYOffset,
      visiblePosts: document.querySelectorAll('[data-testid="tweet"]').length
    };

    return this.logError(error, 'SCRAPING_ERROR', metadata);
  }

  /**
   * Report error to background script
   * @param {Object} errorEntry - Error entry to report
   */
  reportError(errorEntry) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({
          action: 'logError',
          error: errorEntry
        }).catch(() => {
          // Ignore messaging errors to prevent infinite loops
        });
      }
    } catch (e) {
      // Ignore errors in error reporting
    }
  }

  /**
   * Get recent errors
   * @param {number} count - Number of recent errors to get
   * @returns {Array} Recent errors
   */
  getRecentErrors(count = 10) {
    return this.errors.slice(-count);
  }

  /**
   * Get errors by context
   * @param {string} context - Error context to filter by
   * @returns {Array} Filtered errors
   */
  getErrorsByContext(context) {
    return this.errors.filter(error => error.context === context);
  }

  /**
   * Clear all errors
   */
  clearErrors() {
    this.errors = [];
  }

  /**
   * Generate unique error ID
   * @returns {string} Unique error ID
   */
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get error statistics
   * @returns {Object} Error statistics
   */
  getErrorStats() {
    const contextCounts = {};
    const recentErrors = this.errors.filter(
      error => Date.now() - new Date(error.timestamp).getTime() < 60000 // Last minute
    );

    this.errors.forEach(error => {
      contextCounts[error.context] = (contextCounts[error.context] || 0) + 1;
    });

    return {
      totalErrors: this.errors.length,
      recentErrors: recentErrors.length,
      contextBreakdown: contextCounts,
      oldestError: this.errors.length > 0 ? this.errors[0].timestamp : null,
      newestError: this.errors.length > 0 ? this.errors[this.errors.length - 1].timestamp : null
    };
  }
}

/**
 * Progress tracking utility
 */
export class ProgressTracker {
  constructor() {
    this.phases = new Map();
    this.currentPhase = null;
    this.startTime = null;
    this.callbacks = [];
  }

  /**
   * Start tracking a new phase
   * @param {string} phaseName - Name of the phase
   * @param {number} totalSteps - Total steps in this phase
   */
  startPhase(phaseName, totalSteps = 100) {
    const phase = {
      name: phaseName,
      startTime: Date.now(),
      totalSteps: totalSteps,
      currentStep: 0,
      status: 'active',
      metadata: {}
    };

    this.phases.set(phaseName, phase);
    this.currentPhase = phaseName;
    
    if (!this.startTime) {
      this.startTime = Date.now();
    }

    this.notifyCallbacks();
  }

  /**
   * Update progress for current phase
   * @param {number} step - Current step number
   * @param {string} message - Progress message
   * @param {Object} metadata - Additional metadata
   */
  updateProgress(step, message = '', metadata = {}) {
    if (!this.currentPhase) return;

    const phase = this.phases.get(this.currentPhase);
    if (phase) {
      phase.currentStep = step;
      phase.lastMessage = message;
      phase.metadata = { ...phase.metadata, ...metadata };
      phase.lastUpdate = Date.now();
    }

    this.notifyCallbacks();
  }

  /**
   * Complete current phase
   * @param {string} message - Completion message
   */
  completePhase(message = '') {
    if (!this.currentPhase) return;

    const phase = this.phases.get(this.currentPhase);
    if (phase) {
      phase.status = 'completed';
      phase.endTime = Date.now();
      phase.duration = phase.endTime - phase.startTime;
      phase.completionMessage = message;
    }

    this.currentPhase = null;
    this.notifyCallbacks();
  }

  /**
   * Fail current phase
   * @param {string} error - Error message
   */
  failPhase(error = '') {
    if (!this.currentPhase) return;

    const phase = this.phases.get(this.currentPhase);
    if (phase) {
      phase.status = 'failed';
      phase.endTime = Date.now();
      phase.duration = phase.endTime - phase.startTime;
      phase.error = error;
    }

    this.currentPhase = null;
    this.notifyCallbacks();
  }

  /**
   * Add progress callback
   * @param {Function} callback - Callback function
   */
  addCallback(callback) {
    this.callbacks.push(callback);
  }

  /**
   * Remove progress callback
   * @param {Function} callback - Callback function to remove
   */
  removeCallback(callback) {
    const index = this.callbacks.indexOf(callback);
    if (index > -1) {
      this.callbacks.splice(index, 1);
    }
  }

  /**
   * Notify all callbacks
   */
  notifyCallbacks() {
    const progress = this.getProgress();
    this.callbacks.forEach(callback => {
      try {
        callback(progress);
      } catch (error) {
        console.warn('Error in progress callback:', error);
      }
    });
  }

  /**
   * Get current progress
   * @returns {Object} Progress information
   */
  getProgress() {
    const phases = Array.from(this.phases.values());
    const totalDuration = this.startTime ? Date.now() - this.startTime : 0;

    return {
      phases: phases,
      currentPhase: this.currentPhase,
      totalDuration: totalDuration,
      overallProgress: this.calculateOverallProgress(),
      isActive: !!this.currentPhase
    };
  }

  /**
   * Calculate overall progress percentage
   * @returns {number} Progress percentage (0-100)
   */
  calculateOverallProgress() {
    const phases = Array.from(this.phases.values());
    if (phases.length === 0) return 0;

    let totalWeight = phases.length;
    let completedWeight = 0;

    phases.forEach(phase => {
      if (phase.status === 'completed') {
        completedWeight += 1;
      } else if (phase.status === 'active') {
        completedWeight += (phase.currentStep / phase.totalSteps);
      }
    });

    return Math.round((completedWeight / totalWeight) * 100);
  }

  /**
   * Reset progress tracker
   */
  reset() {
    this.phases.clear();
    this.currentPhase = null;
    this.startTime = null;
  }
}

// Global instances
export const errorHandler = new ErrorHandler();
export const progressTracker = new ProgressTracker();
