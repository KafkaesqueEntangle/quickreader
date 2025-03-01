// contentScript.js
/**
 * QuickReader Content Script
 * Enhances web reading speed by bolding the first half of words in visible main content,
 * skipping sidebars, overlays, and interactive elements. Uses a two-tiered observer system
 * for performance and supports fast/careful/off rendering modes via Chrome storage.
 */

/**
 * Constants defining rendering mode configurations with delays for stability and performance.
 * @type {Object}
 */
const RENDERING_MODES = {
  'fast': { LINK_CLICK_DELAY: 250 }, // Quick, focuses on main content
  'careful': { LINK_CLICK_DELAY: 1000 } // Thorough, targets stable rendering
};

let renderingMode = 'fast';
let resetRenderingTimer = null;
let linkClickDelay = RENDERING_MODES.fast.LINK_CLICK_DELAY; // Default to fast mode
let debounceTimer = null; // Global debounce timer for all rendering triggers

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
      // Skip if already rendered by us or within side/interactive content
      if (!element.querySelector('b[quickreader-rendered="true"]') && 
          !element.closest('b[quickreader-rendered="true"]') && 
          !isSideOrInteractiveContent(element)) {
        debounceRender('IntersectionObserver', element);
        visibilityObserver.unobserve(element); // Free it after triggering
      }
    }
  });
}, { rootMargin: '200px', threshold: 0.1 }); // Preload slightly before visible

let debounceQueue = []; // Queue to hold elements during debouncing

/**
 * Debounces rendering requests to prevent excessive DOM manipulation, improving performance.
 * @param {string} trigger - The event triggering the render (e.g., 'IntersectionObserver', 'DOMContentLoaded').
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
      if (!element.querySelector('b[quickreader-rendered="true"]') && 
          !element.closest('b[quickreader-rendered="true"]') && 
          !isSideOrInteractiveContent(element)) {
        renderElement(element);
      }
    }
    debounceTimer = null;
  }, linkClickDelay * 2);
}

// Listener for messages from the popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "updateMode") {
    renderingMode = request.mode;
    linkClickDelay = RENDERING_MODES[renderingMode].LINK_CLICK_DELAY;
    console.log(`Rendering mode updated to ${renderingMode} and link click delay to ${linkClickDelay}ms`);
    if (resetRenderingTimer) clearTimeout(resetRenderingTimer);
    initializeRendering();
  }
});

// Fetch the rendering mode from Chrome storage
chrome.storage.sync.get('renderMode', function(data) {
  renderingMode = data.renderMode || 'fast';
  linkClickDelay = RENDERING_MODES[renderingMode].LINK_CLICK_DELAY;
  console.log(`Rendering mode set to ${renderingMode} and link click delay to ${linkClickDelay}ms`);
  initializeRendering();
});

/**
 * Initializes the QuickReader rendering system, setting up observers and event listeners.
 * Only activates if rendering mode is not 'off'. Uses two-tiered observers for performance:
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
        if (isElementVisible(el) && 
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
        if (!element.querySelector('b[quickreader-rendered="true"]') && 
            !element.closest('b[quickreader-rendered="true"]') && 
            !isSideOrInteractiveContent(element)) {
          debounceRender('IntersectionObserver', element);
        }
      }
    });
  }, { rootMargin: '600px', threshold: 0.001 });

  semanticElements.forEach(tag => {
    document.querySelectorAll(tag).forEach(el => {
      lazyObserver.observe(el);
    });
  });

  const observer = new MutationObserver((mutationsList) => {
    for (let mutation of mutationsList) {
      if (mutation.target.closest('iframe') === null && mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE && 
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
 * Renders a single element by bolding the first half of words, skipping Unicode characters and side content.
 * Uses recursive parsing to process text nodes and their children.
 * @param {Element} element - The DOM element to render.
 */
function renderElement(element) {
  function processNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (text.length > 0) {
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
                rendered += renderWord(word); // Render non-whitespace words with bolding
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

  if (!element.querySelector('b[quickreader-rendered="true"]') && 
      !element.closest('b[quickreader-rendered="true"]') && 
      !isSideOrInteractiveContent(element)) {
    processNode(element);
  }
}

/**
 * Bolds the first half of a word, skipping empty or non-string inputs.
 * Handles edge cases like odd/even lengths, Unicode characters (handled by parent), and potential errors.
 * @param {string} text - The word or text segment to render.
 * @returns {string} HTML string with the first half bolded, or original text if invalid.
 */
function renderWord(text) {
  if (!text || typeof text !== 'string') return text || '';
  text = text.trim();
  if (text.length === 0) return text;
  let middleIndex = Math.floor(text.length / 2);
  try {
    if (text.length % 2 === 0) {
      return `<b>${text.substring(0, middleIndex)}</b>${text.substring(middleIndex)}`;
    } else {
      return `<b>${text.substring(0, middleIndex + 1)}</b>${text.substring(middleIndex + 1)}`;
    }
  } catch (e) {
    console.error('Error rendering word:', text, e);
    return text || '';
  }
}

