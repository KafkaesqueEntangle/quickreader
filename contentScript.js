/**
 * QuickReader Content Script
 * Enhances web reading speed by bolding the first or half of words in visible main content,
 * skipping sidebars, overlays, and interactive elements. Uses a two-tiered observer system
 * for performance and supports on/off rendering modes via Chrome storage, with a bolding style setting.
 */

let renderingMode = 'on'; // Default to 'on' for immediate rendering
let boldingMode = 'half'; // Default to 'half' for current behavior (bold first half of words)
let debounceTimer = null; // Global debounce timer for all rendering triggers
let boldQueue = []; // Queue to hold elements during debouncing
let unboldQueue = []; // Queue to hold elements for unrendering
let observer; // MutationObserver for content changes

// Configurable container levels for tagging (levels after <body>)
const CONTAINER_LEVELS = [3, 4]; // Tag elements at levels 3 and 4 by default

/**
 * List of HTML elements likely containing main text content or structural containers for rendering.
 * @type {string[]}
 */
const semanticElements = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'article', 'section', 'main', 'div', 'li', 'td', 'th', 'body'];

/**
 * Checks if an element is part of sidebars, overlays, or interactive content, skipping it from rendering/tagging.
 * @param {Element} element - The DOM element to check.
 * @returns {boolean} True if the element is side/interactive content, false otherwise.
 */
function isSideOrInteractiveContent(element) {
  return (
    element.closest('aside:not([role="main"]):not([role="contentinfo"]), [role="complementary"]:not([role="main"]), [role="dialog"], [role="alertdialog"]') ||
    element.matches('.modal, .dialog, .sidebar, .overlay')
  );
}

/**
 * Tags all level-3 semantic elements (children of <body>'s children) as potential containers with
 * `quickreader-container="inactive"`. Skips shallow DOMs or side/interactive content.
 */
function tagPotentialContainers() {
  // Build selectors for each level and collect elements
  const selectors = CONTAINER_LEVELS.map(level => `:scope${' > *'.repeat(level)}`);
  const allElements = new Set();
  
  selectors.forEach(selector => {
    const elements = document.body.querySelectorAll(selector);
    elements.forEach(element => allElements.add(element));
  });

  console.log(`[tagPotentialContainers] Found ${allElements.size} potential containers`);

  if (allElements.size === 0) {
    console.warn('[tagPotentialContainers] Shallow DOM detected, skipping container tagging');
    return;
  }

  allElements.forEach(element => {
    if (semanticElements.includes(element.tagName.toLowerCase()) && !isSideOrInteractiveContent(element)) {
      console.log(`[tagPotentialContainers] Tagging element: ${element.tagName}, id=${element.id || 'none'}, class=${element.className || 'none'}`);
      element.setAttribute('quickreader-container', 'inactive');
    }
  });
}

// TODO: Dynamic Content Detection and Unrendering
// - Enhance MutationObserver to tag dynamically added nodes with quickreader-container="inactive".
// - Ensure unrendering handles untagged bolded content by retagging containers before unrendering.
// - Add error handling for detached nodes and pause observers during rendering/unrendering to prevent race conditions.
// - Test on SPAs (e.g., Wikipedia) with lazy-loaded content; optimize with throttling and batching.

// TODO: Investigate YouTube Unrendering Issue
// - Check if containers are tagged/marked as active (DOM depth, Shadow DOM).
// - Verify rendering applies (styling conflicts, interactive content).
// - Monitor for YouTube's DOM mutations overriding QuickReader's changes.
// - Test with adjusted CONTAINER_LEVELS and Shadow DOM traversal.

/**
 * Observes elements for visibility, triggering rendering for visible elements and unobserving them.
 * Improves performance by processing only viewport content.
 * @type {IntersectionObserver}
 */
const visibilityObserver = new IntersectionObserver(
  entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const element = entry.target;
        if (
          renderingMode === 'on' &&
          !element.querySelector('b[quickreader-rendered="true"]') &&
          !element.closest('b[quickreader-rendered="true"]') &&
          !isSideOrInteractiveContent(element)
        ) {
          debounceRenderBold('intersectionObserver', element);
          visibilityObserver.unobserve(element); // Free after triggering
        } else if (
          renderingMode === 'off' &&
          (element.querySelector('b[quickreader-rendered="true"]') || element.closest('b[quickreader-rendered="true"]'))
        ) {
          debounceRenderUnbold('intersectionObserver', element);
        }
      }
    });
  },
  { rootMargin: '200px', threshold: 0.1 } // Preload slightly before visible
);

/**
 * Debounces rendering requests to prevent excessive DOM manipulation.
 * @param {string} trigger - The event triggering the render (e.g., 'intersectionObserver').
 * @param {Element} [element] - The DOM element to render.
 */
function debounceRenderBold(trigger, element) {
  if (element) {
    boldQueue.push({ trigger, element });
  }

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    console.log('Debounce timer expired, starting to render from element', boldQueue.length > 0 ? boldQueue[0].element.tagName : 'none');
    while (boldQueue.length > 0) {
      const { trigger, element } = boldQueue.shift();
      if (
        renderingMode === 'on' &&
        !element.querySelector('b[quickreader-rendered="true"]') &&
        !element.closest('b[quickreader-rendered="true"]') &&
        !isSideOrInteractiveContent(element)
      ) {
        renderElement(element);
      }
    }
    debounceTimer = null;
  }, 250); // Fixed 250ms delay
}

/**
 * Debounces unrendering requests to optimize performance.
 * @param {string} trigger - The event triggering the unrender.
 * @param {Element} [element] - The DOM element to unrender.
 */
function debounceRenderUnbold(trigger, element) {
  if (element) {
    unboldQueue.push({ trigger, element });
  }

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    console.log('Debounce timer expired, starting to unbold from element', unboldQueue.length > 0 ? unboldQueue[0].element.tagName : 'none');
    while (unboldQueue.length > 0) {
      const { trigger, element } = unboldQueue.shift();
      if (
        renderingMode === 'off' &&
        (element.querySelector('b[quickreader-rendered="true"]') || element.closest('b[quickreader-rendered="true"]'))
      ) {
        processContainers(); // Use container-based unrendering
      }
    }
    debounceTimer = null;
  }, 250); // Fixed 250ms delay
}

/**
 * Processes level-3 containers, removing "inactive" tags and unrendering "active" containers.
 * Uses batching to handle large pages efficiently.
 */
function processContainers() {
  const containers = document.querySelectorAll('[quickreader-container]');
  console.log(`[processContainers] Found ${containers.length} containers to process`);

  if (containers.length === 0) {
    console.warn('[processContainers] No containers found with quickreader-container attribute, falling back to direct unrendering');
    const boldTags = document.querySelectorAll('b[quickreader-rendered="true"]');
    boldTags.forEach(b => {
      console.log(`[processContainers] Removing bold tag: "${b.textContent}"`);
      const parent = b.parentNode;
      const boldText = b.textContent;
      const nextSibling = b.nextSibling;
      const boldTextNode = document.createTextNode(boldText); // Create the Text node explicitly
      b.replaceWith(boldTextNode); // Replace with the Text node

      // Check if the next sibling is a Text node (the unbolded part) and merge
      if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE) {
        console.log(`[processContainers] Merging bolded "${boldText}" with unbolded "${nextSibling.textContent}"`);
        boldTextNode.textContent += nextSibling.textContent;
        nextSibling.remove();
      }
    });
    return;
  }

  let index = 0;
  const batchSize = 5;
  let hasActiveContainers = false;

  function processBatch() {
    const end = Math.min(index + batchSize, containers.length);
    console.log(`[processContainers] Processing batch: containers ${index} to ${end - 1}`);

    for (; index < end; index++) {
      const container = containers[index];
      const status = container.getAttribute('quickreader-container');
      console.log(`[processContainers] Container ${index}: tag=${container.tagName}, status=${status}`);

      if (status === 'inactive') {
        console.log(`[processContainers] Removing inactive status from container ${index}`);
        container.removeAttribute('quickreader-container');
      } else if (status === 'active') {
        hasActiveContainers = true;
        console.log(`[processContainers] Unrendering active container ${index}`);
        const clone = container.cloneNode(true);
        const boldTags = clone.querySelectorAll('b[quickreader-rendered="true"]');
        console.log(`[processContainers] Found ${boldTags.length} bold tags in container ${index}`);

        if (boldTags.length === 0) {
          console.warn(`[processContainers] No bold tags found in active container ${index}, skipping`);
          continue;
        }

        let tagIndex = 0;
        const tagBatchSize = 100;

        function processTagBatch() {
          const tagEnd = Math.min(tagIndex + tagBatchSize, boldTags.length);
          console.log(`[processContainers] Processing tag batch: tags ${tagIndex} to ${tagEnd - 1}`);

          for (; tagIndex < tagEnd; tagIndex++) {
            const boldTag = boldTags[tagIndex];
            console.log(`[processContainers] Replacing bold tag ${tagIndex}: "${boldTag.textContent}"`);
            const parent = boldTag.parentNode;
            const boldText = boldTag.textContent;
            const nextSibling = boldTag.nextSibling;
            const boldTextNode = document.createTextNode(boldText); // Create the Text node explicitly
            boldTag.replaceWith(boldTextNode); // Replace with the Text node

            // Check if the next sibling is a Text node (the unbolded part) and merge
            if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE) {
              console.log(`[processContainers] Merging bolded "${boldText}" with unbolded "${nextSibling.textContent}"`);
              boldTextNode.textContent += nextSibling.textContent;
              nextSibling.remove();
            }
          }

          if (tagIndex < boldTags.length) {
            console.log(`[processContainers] Scheduling next tag batch for container ${index}`);
            setTimeout(processTagBatch, 0);
          } else {
            console.log(`[processContainers] Finished processing tags, replacing container ${index}`);
            try {
              if (!container.parentNode) {
                console.error(`[processContainers] Container ${index} has no parent, cannot replace`);
                return;
              }
              container.parentNode.replaceChild(clone, container);
              console.log(`[processContainers] Successfully replaced container ${index}`);
              clone.removeAttribute('quickreader-container');
            } catch (e) {
              console.error(`[processContainers] Error replacing container ${index}: ${e.message}`);
            }
          }
        }
        processTagBatch();
      } else {
        console.warn(`[processContainers] Container ${index} has unexpected status: ${status}`);
      }
    }

    if (index < containers.length) {
      console.log(`[processContainers] Scheduling next container batch`);
      setTimeout(processBatch, 0);
    } else {
      console.log('[processContainers] Finished processing all containers');
      if (!hasActiveContainers) {
        console.warn('[processContainers] No active containers found, falling back to direct unrendering');
        const boldTags = document.querySelectorAll('b[quickreader-rendered="true"]');
        boldTags.forEach(b => {
          console.log(`[processContainers] Removing bold tag: "${b.textContent}"`);
          const parent = b.parentNode;
          const boldText = b.textContent;
          const nextSibling = b.nextSibling;
          const boldTextNode = document.createTextNode(boldText);
          b.replaceWith(boldTextNode);

          if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE) {
            console.log(`[processContainers] Merging bolded "${boldText}" with unbolded "${nextSibling.textContent}"`);
            boldTextNode.textContent += nextSibling.textContent;
            nextSibling.remove();
          }
        });
      }
    }
  }
  processBatch();
}

/**
 * Initializes QuickReader, tagging level-3 containers or handling shallow DOMs.
 */
function initializeQuickReader() {
  const levelThreeElements = document.body.querySelectorAll(':scope > * > *');
  if (levelThreeElements.length === 0) {
    console.warn('Shallow DOM detected, unrendering without containers');
    // Fallback: Unrender all <b quickreader-rendered="true"> directly
    document.querySelectorAll('b[quickreader-rendered="true"]').forEach(b => {
      b.replaceWith(b.textContent);
    });
    return;
  }
  tagPotentialContainers();

  // Initialize existing rendering logic
  document.addEventListener('DOMContentLoaded', () => {
    semanticElements.forEach(tag => {
      document.querySelectorAll(tag).forEach(el => {
        if (
          renderingMode === 'on' &&
          isElementVisible(el) &&
          !el.querySelector('b[quickreader-rendered="true"]') &&
          !el.closest('b[quickreader-rendered="true"]') &&
          !isSideOrInteractiveContent(el)
        ) {
          debounceRenderBold('DOMContentLoaded', el);
        }
      });
    });
  });

  const lazyObserver = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const element = entry.target;
          if (
            renderingMode === 'on' &&
            !element.querySelector('b[quickreader-rendered="true"]') &&
            !element.closest('b[quickreader-rendered="true"]') &&
            !isSideOrInteractiveContent(element)
          ) {
            debounceRenderBold('intersectionObserver', element);
          }
        }
      });
    },
    { rootMargin: '600px', threshold: 0.001 }
  );

  semanticElements.forEach(tag => {
    document.querySelectorAll(tag).forEach(el => {
      lazyObserver.observe(el);
    });
  });

  if (!observer) {
    observer = new MutationObserver(mutationsList => {
      for (let mutation of mutationsList) {
        if (mutation.target.closest('iframe') === null && mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (
              renderingMode === 'on' &&
              node.nodeType === Node.ELEMENT_NODE &&
              node.textContent.trim().length > 0 &&
              !node.querySelector('b[quickreader-rendered="true"]') &&
              !node.closest('b[quickreader-rendered="true"]') &&
              !isSideOrInteractiveContent(node)
            ) {
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
}

/**
 * Renders a single element by bolding words, tagging level-3 containers as "active".
 * @param {Element} element - The DOM element to render.
 */
function renderElement(element) {
  function processNode(node) {
    if (node.nodeType === Node.TEXT_NODE && renderingMode === 'on') {
      const text = node.textContent || '';
      if (
        text.trim().length === 0 ||
        !node.parentNode ||
        !node.parentElement ||
        !document.body.contains(node) ||
        (node.parentElement && isSideOrInteractiveContent(node.parentElement))
      ) {
        return;
      }
  
      const unicodePattern = /([\p{Emoji}\p{Symbol}\p{Extended_Pictographic}\u{1F000}-\u{1FFFF}])/u;
      const segments = text.split(unicodePattern).filter(segment => segment !== '');
      let rendered = '';
  
      segments.forEach(segment => {
        if (unicodePattern.test(segment)) {
          rendered += segment;
        } else {
          const words = segment.match(/(\s+|\S+)/g) || [segment];
          words.forEach(word => {
            rendered += word.match(/\S/) ? renderWord(word) : word;
          });
        }
      });
  
      const fragment = document.createDocumentFragment();
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = rendered;
      while (tempDiv.firstChild) {
        fragment.appendChild(tempDiv.firstChild);
      }
      fragment.querySelectorAll('b').forEach(b => b.setAttribute('quickreader-rendered', 'true'));
  
      try {
        if (!node.parentNode || !document.body.contains(node)) {
          return;
        }
        const parentElement = node.parentElement;
        node.parentNode.replaceChild(fragment, node);
  
        // Traverse the DOM starting from parentElement
        let currentElement = parentElement;
        let path = [];
        while (currentElement && currentElement !== document.body) {
          path.push(`${currentElement.tagName}${currentElement.hasAttribute('quickreader-container') ? `[quickreader-container=${currentElement.getAttribute('quickreader-container')}]` : ''}`);
          currentElement = currentElement.parentElement;
        }
  
        const container = parentElement.closest('[quickreader-container]');
        if (container) {
          container.setAttribute('quickreader-container', 'active');
        } else {
          console.warn(`[renderElement] No quickreader-container found for node: "${text.slice(0, 50)}..."`);
        }
      } catch (e) {
        if (!processNode.errorCache) processNode.errorCache = new Set();
        const errorKey = `${e.name}:${e.message}`;
        if (!processNode.errorCache.has(errorKey)) {
          processNode.errorCache.add(errorKey);
          console.error(`Error replacing node: ${e.message}, Node content: "${text.slice(0, 50)}...", Parent: ${node.parentElement?.tagName || 'none'}`);
        }
      }
    } else if (
      node.nodeType === Node.ELEMENT_NODE &&
      !node.querySelector('b[quickreader-rendered="true"]') &&
      !node.closest('b[quickreader-rendered="true"]')
    ) {
      Array.from(node.childNodes).forEach(processNode);
    }
  }

  if (
    renderingMode === 'on' &&
    !element.querySelector('b[quickreader-rendered="true"]') &&
    !element.closest('b[quickreader-rendered="true"]') &&
    !isSideOrInteractiveContent(element)
  ) {
    processNode(element);
  }
}

/**
 * Bolds the first or half of a word based on bolding mode.
 * @param {string} text - The word to render.
 * @returns {string} HTML string with bolded portion.
 */
function renderWord(text) {
  if (!text || typeof text !== 'string') return text || '';
  text = text.trim();
  if (text.length < 2) return text;
  try {
    if (boldingMode === 'start') {
      let boldLength = Math.min(7, Math.max(1, Math.round(text.length * 0.3)));
      return `<b>${text.substring(0, boldLength)}</b>${text.substring(boldLength)}`;
    } else if (boldingMode === 'half') {
      let middleIndex = Math.floor(text.length / 2);
      return `<b>${text.substring(0, middleIndex + (text.length % 2))}</b>${text.substring(middleIndex + (text.length % 2))}`;
    } else {
      console.warn('Unexpected bolding mode:', boldingMode);
      let middleIndex = Math.floor(text.length / 2);
      return `<b>${text.substring(0, middleIndex + (text.length % 2))}</b>${text.substring(middleIndex + (text.length % 2))}`;
    }
  } catch (e) {
    console.error('Error rendering word:', text, e);
    return text || '';
  }
}

/**
 * Helper function to check if an element is visible.
 * @param {Element} el - The DOM element to check.
 * @returns {boolean} True if visible or partially visible.
 */
function isElementVisible(el) {
  const rect = el.getBoundingClientRect();
  const isVisible =
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth);
  return isVisible || (rect.top < window.innerHeight && rect.bottom > 0);
}

// Listener for settings updates
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateSettings') {
    renderingMode = request.renderMode;
    boldingMode = request.boldingStyle;
    console.log(`Rendering mode updated to ${renderingMode}, Bolding mode updated to ${boldingMode}`);
    if (renderingMode === 'off') {
      processContainers(); // Unrender when mode switches to off
    } else {
      initializeQuickReader(); // Reinitialize rendering
    }
  }
});

// Fetch initial settings
chrome.storage.sync.get(['renderMode', 'boldingStyle'], data => {
  renderingMode = data.renderMode || 'on';
  boldingMode = data.boldingStyle || 'half';
  console.log(`Rendering mode set to ${renderingMode}, Bolding mode set to ${boldingMode}`);
  initializeQuickReader();
});