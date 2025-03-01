// options.js
/**
 * Handles the QuickReader extension settings popup, managing rendering mode toggles
 * and syncing with Chrome storage.
 */
document.addEventListener('DOMContentLoaded', function() {
    // Cache DOM elements for better performance
    const fastMode = document.getElementById('fastMode');
    const carefulMode = document.getElementById('carefulMode');
    const offMode = document.getElementById('offMode');
    const currentModeDisplay = document.getElementById('currentMode');

    /**
     * Updates the UI to display the current rendering mode.
     * @param {string} mode - The rendering mode ('fast', 'careful', or 'off')
     */
    function updateModeDisplay(mode) {
        if (!currentModeDisplay) {
            console.error('Current mode display element not found');
            return;
        }
        currentModeDisplay.textContent = `Current Mode: ${mode}`;
    }

    /**
     * Saves the selected rendering mode to Chrome storage and updates the UI.
     * @param {string} mode - The rendering mode to save ('fast', 'careful', or 'off')
     */
    function saveMode(mode) {
        if (!['fast', 'careful', 'off'].includes(mode)) {
            console.error('Invalid mode specified:', mode);
            return;
        }
        chrome.storage.sync.set({ renderMode: mode }, function() {
            if (chrome.runtime.lastError) {
                console.error('Error saving mode to storage:', chrome.runtime.lastError);
                return;
            }
            console.log(`Render mode set to ${mode}`);
            updateModeDisplay(mode);
        });
    }

    /**
     * Retrieves the current rendering mode from Chrome storage and updates the UI.
     */
    function getMode() {
        chrome.storage.sync.get('renderMode', function(data) {
            if (chrome.runtime.lastError) {
                console.error('Error retrieving mode from storage:', chrome.runtime.lastError);
                return;
            }
            const mode = data.renderMode || 'careful';
            // Use strict equality for consistency
            if (mode === 'fast') {
                fastMode.checked = true;
            } else if (mode === 'careful') {
                carefulMode.checked = true;
            } else if (mode === 'off') {
                offMode.checked = true;
            } else {
                console.warn('Unexpected mode retrieved:', mode);
                fastMode.checked = true; // Default to fast as fallback
            }
            updateModeDisplay(mode);
        });
    }

    /**
     * Handles mode change events for the fast rendering mode radio button.
     */
    fastMode.addEventListener('change', function() {
        if (this.checked) saveMode('fast');
    });

    /**
     * Handles mode change events for the careful rendering mode radio button.
     */
    carefulMode.addEventListener('change', function() {
        if (this.checked) saveMode('careful');
    });

    /**
     * Handles mode change events for the off rendering mode radio button.
     */
    offMode.addEventListener('change', function() {
        if (this.checked) saveMode('off');
    });

    // Initial mode fetch on popup load
    getMode();
});