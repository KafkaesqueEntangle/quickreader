/**
 * QuickReader Content Script
 * Enhances web reading speed by bolding the first or half of words in visible main content,
 * skipping sidebars, overlays, and interactive elements. Uses a two-tiered observer system
 * for performance and supports on/off rendering modes via Chrome storage, with a bolding style setting.
 */

let renderingMode = 'on'; // Default to 'on' for immediate rendering
let boldingMode = 'half'; // Default to 'half' for current behavior (bold first half of words)
let debounceTimer = null; // Global debounce timer for all rendering triggers
let debounceQueue = []; // Queue to hold elements during debouncing

/**
 * List of HTML elements likely containing main text content for rendering.
 * @type {string[]}
 */
const semanticElements = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'article', 'section', 'main', 'div', 'li', 'td', 'th', 'body'];

/**
 * QuerySelectorAll result excluding interactive/overlay/side content for performance and compatibility.
 * @type {NodeList}
 */
const textElements = document.querySelectorAll(semanticElements.map(tag => 
  `:not([aria-hidden="true"]):not([aria-modal="true"]):not([role="dialog"]):not([role="alertdialog"]):not([role="complementary"]):not(aside):not(dialog):not(nav):not([tabindex]):not(.modal):not(.dialog):not(.overlay):not(.sidebar) ${tag}`
).join(', '));

/**
 * Checks if an element is part of sidebars, overlays, or interactive content, skipping it from rendering.
 * @param {Element} element - The DOM element to check.
 * @returns {boolean} True if the element is side/interactive content, false otherwise.
 */
function isSideOrInteractiveContent(element) {
  return element.closest('aside:not([role="main"]):not([role="contentinfo"]), [role="complementary"]:not([role="main"]), [role="dialog"], [role="alertdialog"]') ||
          element.matches('.modal, .dialog, .overlay, .sidebar');
}

/**
 * Observes elements for visibility, triggering rendering for visible elements and unobserving already rendered ones.
 * Improves performance by rendering only content in the viewport.
 * @type {IntersectionObserver}
 */
const visibilityObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const element = entry.target;
      // Skip if already rendered by us, within side/interactive content, or mode is 'off'
      if (renderingMode === 'on' && !element.querySelector('b[quickreader-rendered="true"]') && 
          !element.closest('b[quickreader-rendered="true"]') && 
          !isSideOrInteractiveContent(element)) {
        debounceRender('intersectionObserver', element);
        visibilityObserver.unobserve(element); // Free it after triggering
      }
    }
  });
}, { rootMargin: '200px', threshold: 0.1 }); // Preload slightly before visible

/**
 * Debounces rendering requests to prevent excessive DOM manipulation, improving performance.
 * @param {string} trigger - The event triggering the render (e.g., 'intersectionObserver', 'DOMContentLoaded').
 * @param {Element} [element] - The DOM element to render, if provided.
 */
function debounceRender(trigger, element) {
  if (element) {
    debounceQueue.push({ trigger, element });
  } else {
    console.log('Debounce', trigger, '...');
  }

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    console.log('Debounce timer expired, starting to render from element', debounceQueue.length > 0 ? debounceQueue[0].element.tagName : 'none');
    while (debounceQueue.length > 0) {
      const { trigger, element } = debounceQueue.shift();
      if (renderingMode === 'on' && !element.querySelector('b[quickreader-rendered="true"]') && 
          !element.closest('b[quickreader-rendered="true"]') && 
          !isSideOrInteractiveContent(element)) {
        renderElement(element);
      }
    }
    debounceTimer = null;
  }, 250); // Fixed delay, using 'fast' mode's 250ms as default
}

// Listener for messages from the popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "updateSettings") {
    renderingMode = request.renderMode; // 'on' or 'off'
    boldingMode = request.boldingStyle; // 'start' or 'half'
    console.log(`Rendering mode updated to ${renderingMode}, Bolding mode updated to ${boldingMode}`);
    initializeRendering();
  }
});

// Fetch the rendering mode and bolding style from Chrome storage
chrome.storage.sync.get(['renderMode', 'boldingStyle'], function(data) {
  renderingMode = data.renderMode || 'on'; // Default to 'on' for immediate rendering
  boldingMode = data.boldingStyle || 'half'; // Default to 'half' for current behavior (bold first half of words)
  console.log(`Rendering mode set to ${renderingMode}, Bolding mode set to ${boldingMode}`);
  initializeRendering();
});

/**
 * Initializes the QuickReader rendering system, setting up observers and event listeners.
 * Only activates if rendering mode is 'on'. Uses two-tiered observers for performance:
 * 1. MutationObserver detects new content.
 * 2. IntersectionObserver renders only visible content, reducing unnecessary processing.
 */
function initializeRendering() {
  if (renderingMode === 'off') {
    console.log(`Rendering mode is off, not doing anything.`);
    return;
  }

  document.addEventListener('DOMContentLoaded', () => {
    semanticElements.forEach(tag => {
      document.querySelectorAll(tag).forEach(el => {
        if (renderingMode === 'on' && isElementVisible(el) && 
            !el.querySelector('b[quickreader-rendered="true"]') && 
            !el.closest('b[quickreader-rendered="true"]') && 
            !isSideOrInteractiveContent(el)) {
          debounceRender('DOMContentLoaded', el);
        }
      });
    });
  });

  const lazyObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const element = entry.target;
        if (renderingMode === 'on' && !element.querySelector('b[quickreader-rendered="true"]') && 
            !element.closest('b[quickreader-rendered="true"]') && 
            !isSideOrInteractiveContent(element)) {
          debounceRender('intersectionObserver', element);
        }
      }
    });
  }, { rootMargin: '600px', threshold: 0.001 });

  semanticElements.forEach(tag => {
    document.querySelectorAll(tag).forEach(el => {
      lazyObserver.observe(el);
    });
  });

  if (!observer) {
    observer = new MutationObserver((mutationsList) => {
      for (let mutation of mutationsList) {
        if (mutation.target.closest('iframe') === null && mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (renderingMode === 'on' && node.nodeType === Node.ELEMENT_NODE && 
                node.textContent.trim().length > 0 && 
                !node.querySelector('b[quickreader-rendered="true"]') && 
                !node.closest('b[quickreader-rendered="true"]') && 
                !isSideOrInteractiveContent(node)) {
              visibilityObserver.observe(node);
            }
          });
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false
    });
    console.log('MutationObserver initialized');
  }

  // Helper function to check if an element is visible
  function isElementVisible(el) {
    const rect = el.getBoundingClientRect();
    const isVisible = (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
    return isVisible || (rect.top < window.innerHeight && rect.bottom > 0); // Allow partial visibility
  }
}

/**
 * Renders a single element by bolding the first or half of words, skipping Unicode characters and side content.
 * Uses recursive parsing to process text nodes and their children.
 * @param {Element} element - The DOM element to render.
 */
function renderElement(element) {
  function processNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (text.length > 0 && renderingMode === 'on') {
        // Skip rendering if the node is within side or interactive content
        if (node.parentElement && isSideOrInteractiveContent(node.parentElement)) {
          return;
        }

        let wrapper = document.createElement('span');
        /**
         * Regex pattern to match Unicode characters like emojis, symbols, and pictographs,
         * ensuring they’re skipped during rendering to avoid processing issues.
         * Uses Unicode property escapes for modern browser compatibility.
         * @type {RegExp}
         */
        const unicodePattern = /([\p{Emoji}\p{Symbol}\p{Extended_Pictographic}\u{1F000}-\u{1FFFF}])/u;
        let segments = text.split(unicodePattern).filter(segment => segment !== '');
        let rendered = '';

        segments.forEach(segment => {
          if (unicodePattern.test(segment)) {
            rendered += segment; // Preserve Unicode characters (e.g., emojis) unchanged
          } else {
            let words = segment.match(/(\s+|\S+)/g) || [segment]; // Split into words and whitespace
            words.forEach(word => {
              if (word.match(/\S/)) {
                rendered += renderWord(word); // Render non-whitespace words with bolding based on mode
              } else {
                rendered += word; // Preserve whitespace to maintain layout
              }
            });
          }
        });

        wrapper.innerHTML = rendered;
        wrapper.querySelectorAll('b').forEach(b => b.setAttribute('quickreader-rendered', 'true'));
        try {
          node.parentNode.replaceChild(wrapper, node);
        } catch (e) {
          console.error('Error replacing node:', node, 'with wrapper:', wrapper, e);
        }
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (!node.querySelector('b[quickreader-rendered="true"]') && !node.closest('b[quickreader-rendered="true"]')) {
        Array.from(node.childNodes).forEach(child => processNode(child));
      }
    }
  }

  if (renderingMode === 'on' && !element.querySelector('b[quickreader-rendered="true"]') && 
      !element.closest('b[quickreader-rendered="true"]') && 
      !isSideOrInteractiveContent(element)) {
    processNode(element);
  }
}

/**
 * Bolds the first or half of a word based on the bolding mode, skipping empty or <3-character inputs.
 * Handles edge cases like odd/even lengths, Unicode characters (handled by parent), and potential errors.
 * @param {string} text - The word or text segment to render.
 * @returns {string} HTML string with the appropriate portion bolded, or original text if invalid or short.
 */
function renderWord(text) {
  if (!text || typeof text !== 'string') return text || '';
  text = text.trim();
  if (text.length < 2) return text; // Skip too short words
  if (text.length === 0) return text;
  try {
    if (boldingMode === 'start') {
      // There are no firm study results of optimal share of words to bold to provide best fixation. TBD.
      let boldLength = Math.min(7, Math.max(1, Math.round(text.length * 0.3))); // At least 1, max 7, avg. 30%
      return `<b>${text.substring(0, boldLength)}</b>${text.substring(boldLength)}`;
    } else if (boldingMode === 'half') {
      // Bold the first half of the word (current behavior, unchanged)
      let middleIndex = Math.floor(text.length / 2);
      if (text.length % 2 === 0) {
        return `<b>${text.substring(0, middleIndex)}</b>${text.substring(middleIndex)}`;
      } else {
        return `<b>${text.substring(0, middleIndex + 1)}</b>${text.substring(middleIndex + 1)}`;
      }
    } else {
      console.warn('Unexpected bolding mode:', boldingMode);
      // Default to half word if mode is invalid
      let middleIndex = Math.floor(text.length / 2);
      if (text.length % 2 === 0) {
        return `<b>${text.substring(0, middleIndex)}</b>${text.substring(middleIndex)}`;
      } else {
        return `<b>${text.substring(0, middleIndex + 1)}</b>${text.substring(middleIndex + 1)}`;
      }
    }
  } catch (e) {
    console.error('Error rendering word:', text, e);
    return text || '';
  }
}