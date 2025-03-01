# QuickReader Extension

Welcome to **QuickReader**, an open-source Chrome extension project that enhances reading speed. It works by bolding the first half of each word in text, allowing your brains to fill in the non-bolded part while your eyes can already jump to the next word. Sounds hard to believe, but try it out for yourself. 

## Overview

QuickReader is a lightweight, Manifest V3 Chrome extension that targets main content on web pages (e.g., articles, posts, paragraphs), skipping sidebars, overlays, and interactive elements. It uses a novel two-tiered observer system for optimal performance, debouncing to prevent rapidly occurring (re)renders, and supports three rendering modes: `fast`, `careful`, and `off`.

## Features

- Bolds the first half of words in main content for faster reading.
- Not site-specific, attempts to work on any page.
- Targets content that appears to be the "main content" of a page.
- Attempts to skip side/interactive content such as chat panels, or modals, to maintain good performance and avoid interrupting other code on the web pages.
- Supports three rendering modes:
  - **Fast**: Quick, focuses on main content with minimal delays.
  - **Careful**: Thorough, stable rendering with longer reaction times to changes.
  - **Off**: Disables rendering entirely.

## Installation as a Chrome Extension

1. Clone or download this repository to your local machine:
   ```bash
   git clone https://github.com/KafkaesqueEntangle/quickreader.git
   cd quickreader
   ```
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable "Developer mode" in the top-right corner.
4. Click "Load unpacked" and select the `quickreader` directory.
5. The QuickReader icon will appear in your Chrome toolbar—click it to access settings.

## Usage

1. Install the extension as described above.
2. Click the QuickReader icon in your Chrome toolbar to open the settings popup.
3. Select a rendering mode:
 - **Fast**: Should just work on most sites, focusing on main content.
 - **Careful**: Use for complex or dynamic sites, ensuring stable rendering.
 - **Off**: Disable QuickReader if you want to slow down your reading.
4. Navigate to any web page and QuickReader will automatically bold the first half of words in visible main content.

## Architecture

QuickReader uses a two-tiered observer system for performance:

- **MutationObserver**: Detects new content added to the DOM, passing it to the visibility observer.
- **IntersectionObserver**: Renders only visible elements, unobserving them after processing to prevent re-rendering.

Key components:
- **Rendering Logic**: Bolds word halves using DOM manipulation, skipping Unicode characters and side content via semantic HTML/ARIA checks.
- **Debouncing**: Prevents rapid DOM updates with a `debounceRender` function, improving performance on dynamic pages.
- **Modes**: Managed via Chrome storage, allowing users to toggle `fast`, `careful`, or `off` via the popup.

See `contentScript.js` for the core implementation, with in-code documentation.

## Contributing

Contributions to QuickReader are welcome!

### Steps to Contribute

1. **Fork the Repository**:
 - Clone or fork this repo: `https://github.com/KafkaesqueEntangle/quickreader`.
2. **Set Up Locally**:
 - Follow the installation steps above, ensuring Chrome Developer mode is enabled.
3. **Test and Improve**:
 - Test on various websites where you do a lot of reading (e.g., news, social media, blogs) to ensure compatibility and performance.
 - Propose features (e.g., custom rendering options, performance tweaks) or fix bugs via issues or pull requests.
4. **Submit Changes**:
 - Create a branch: `git checkout -b feature/your-feature`.
 - Commit changes with clear messages: `git commit -m "Add feature: description"`.
 - Push and open a pull request on GitHub.
5. **Code Standards**:
 - Follow the existing code style (e.g., JSDoc for public functions, minimal inline comments).
 - Add tests or update documentation if applicable.

### Issues and Feedback

- Report bugs or suggest features via GitHub Issues.

## Security and Permissions

QuickReader may show a "Full access" warning in Chrome due to its ability to modify web page content for reading enhancement. Rest assured, it only bolds the first half of words in visible main content, and doesn’t process data in any other way or store any data. Permissions need to be large, since it is, after all, changing what you read on the page. Being open source, anyone interested can verify the functionality and safety for themselves.

QuickReader requires the following permissions for functionality:
- `activeTab`: To bold text on the currently active web page.
- `storage`: To save and retrieve rendering mode preferences (fast, careful, off).
- `content_scripts` To apply rendering to the text.

## Credits

QuickReader uses icons from Lineicons, licensed under MIT. Visit https://lineicons.com for more.

## License

QuickReader is released under the [MIT License](LICENSE). It’s permissive, allowing use, modification, and distribution for any purpose, but all forks, modifications, or distributions must retain the copyright notice and credit the original author, `KafkaesqueEntangle`, in the project README, documentation, or codebase.
