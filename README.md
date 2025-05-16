# X Profile Post Scraper

A Chrome extension that scrapes posts from X (Twitter) profile pages and downloads them as structured JSON and CSV files.

## Features

- 🔄 **Auto-scroll**: Automatically scrolls through profile pages to load more posts
- 📊 **Comprehensive Data**: Extracts text, author, timestamp, engagement metrics, and media
- 🎯 **Smart Deduplication**: Prevents duplicate posts using multiple strategies
- 📈 **Progress Tracking**: Real-time progress updates with detailed statistics
- 📁 **Multiple Formats**: Downloads data as both JSON and CSV
- 🛡️ **Error Handling**: Robust error handling with retry mechanisms
- ⚙️ **Configurable**: Adjustable scroll delay and maximum post limits

## Installation

### Method 1: Load Unpacked Extension (Recommended for Development)

1. **Download or Clone** this repository to your local machine
2. **Open Chrome** and navigate to `chrome://extensions/`
3. **Enable Developer Mode** by toggling the switch in the top right corner
4. **Click "Load unpacked"** and select the `x-scraper` folder
5. **Pin the extension** to your toolbar for easy access

### Method 2: Manual Installation

1. Download the extension files
2. Open Chrome Extensions page (`chrome://extensions/`)
3. Enable Developer Mode
4. Click "Load unpacked" and select the extension folder

## Usage

### Basic Usage

1. **Navigate** to any X (Twitter) profile page (e.g., `https://x.com/username`)
2. **Click** the extension icon in your toolbar
3. **Configure** settings if needed:
   - **Scroll Delay**: Time between scrolls (500-10000ms, default: 2000ms)
   - **Max Posts**: Maximum number of posts to scrape (10-1000, default: 100)
4. **Click "Start Scraping"** to begin
5. **Monitor progress** in the popup window
6. **Click "Download JSON"** when scraping is complete

### Advanced Features

- **Real-time Progress**: Watch as posts are discovered and processed
- **Statistics**: View detailed stats including media count, engagement metrics
- **Error Recovery**: Automatic retry on temporary failures
- **Rate Limiting Detection**: Stops gracefully if rate limits are detected

## Data Structure

### JSON Output

```json
{
  "metadata": {
    "profile": {
      "username": "example_user",
      "url": "https://x.com/example_user",
      "scrapedAt": "2024-01-15T10:30:00.000Z"
    },
    "scraping": {
      "totalPosts": 150,
      "settings": {
        "scrollDelay": 2000,
        "maxPosts": 200
      },
      "stats": {
        "postsWithText": 145,
        "postsWithMedia": 67,
        "retweets": 23,
        "replies": 12
      }
    }
  },
  "posts": [
    {
      "id": "1234567890",
      "finalOrder": 1,
      "text": "This is a sample tweet...",
      "author": "Example User",
      "timestamp": "2024-01-15T09:15:00.000Z",
      "url": "https://x.com/example_user/status/1234567890",
      "metrics": {
        "likes": 42,
        "retweets": 7,
        "replies": 3
      },
      "media": [
        {
          "type": "image",
          "url": "https://pbs.twimg.com/media/example.jpg",
          "alt": "Image description"
        }
      ],
      "metadata": {
        "isRetweet": false,
        "isReply": false,
        "hasThread": false,
        "language": "en",
        "verified": false
      },
      "scrapedAt": "2024-01-15T10:30:15.000Z"
    }
  ]
}
```

### CSV Output

The CSV file includes the following columns:
- Order, ID, Text, Author, Timestamp, URL
- Likes, Retweets, Replies, Media Count
- Is Retweet, Is Reply, Has Thread, Language, Verified
- Scraped At

## Configuration

### Settings

- **Scroll Delay**: Controls how long to wait between scrolls (default: 2000ms)
  - Lower values = faster scraping but higher chance of rate limiting
  - Higher values = slower but more reliable
- **Max Posts**: Maximum number of posts to scrape (default: 100)
  - Set based on your needs and time constraints

### Performance Tips

1. **Use appropriate scroll delays** (2-3 seconds recommended)
2. **Monitor for rate limiting** warnings
3. **Start with smaller limits** for testing
4. **Ensure stable internet connection**

## Troubleshooting

### Common Issues

**Extension not working on X pages:**
- Ensure you're on a profile page (not home feed or search)
- Check that the URL matches: `https://x.com/username`
- Refresh the page and try again

**No posts found:**
- Make sure the profile has public posts
- Check if the account is protected/private
- Verify the page has fully loaded before starting

**Scraping stops early:**
- May have hit rate limits (wait and try again)
- Check browser console for error messages
- Try increasing scroll delay

**Download not working:**
- Check Chrome's download permissions
- Ensure popup blockers aren't interfering
- Try downloading with "Save As" dialog

### Error Messages

- **"Not on a valid X profile page"**: Navigate to a profile page first
- **"Rate limiting detected"**: Wait before trying again
- **"No data to download"**: No posts were successfully scraped

## Technical Details

### Architecture

- **Manifest V3**: Uses the latest Chrome extension format
- **Content Script**: Runs on X pages to extract data
- **Background Script**: Handles extension lifecycle
- **Popup Interface**: Provides user controls and feedback

### Data Extraction

- **DOM Parsing**: Uses CSS selectors to find post elements
- **Multiple Strategies**: Fallback selectors for reliability
- **Content Validation**: Ensures data quality before storage
- **Deduplication**: Prevents duplicate posts using ID and content hashing

### Privacy & Security

- **Local Processing**: All data processing happens locally
- **No External Servers**: No data is sent to external services
- **Minimal Permissions**: Only requests necessary permissions
- **User Control**: User initiates all scraping actions

## Development

### Project Structure

```
x-scraper/
├── manifest.json          # Extension configuration
├── popup/                 # User interface
│   ├── popup.html
│   ├── popup.js
├── content/              # Page interaction
│   └── content.js
├── background/           # Extension lifecycle
│   └── background.js
├── utils/               # Utility functions
│   ├── selectors.js
│   └── error-handler.js
└── icons/               # Extension icons
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is for educational purposes. Please respect X's Terms of Service and rate limits.

## Disclaimer

This tool is for educational and research purposes only. Users are responsible for complying with X's Terms of Service and applicable laws. The developers are not responsible for any misuse of this tool.
