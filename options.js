/**
 * Handles the QuickReader extension settings popup, managing the on/off rendering toggle
 * and bolding style selection, syncing with Chrome storage.
 */
document.addEventListener('DOMContentLoaded', function() {
    // Cache DOM elements for better performance
    const onMode = document.getElementById('onMode');
    const offMode = document.getElementById('offMode');
    const startMode = document.getElementById('startMode');
    const halfMode = document.getElementById('halfMode');
    const currentModeDisplay = document.getElementById('currentMode');

    /**
     * Updates the UI to display the current rendering mode and bolding style.
     * @param {string} renderMode - The rendering mode ('on' or 'off')
     * @param {string} boldingStyle - The bolding style ('start' or 'half')
     */
    function updateModeDisplay(renderMode, boldingStyle) {
        if (!currentModeDisplay) {
            console.error('Current mode display element not found');
            return;
        }
        const renderStatus = renderMode === 'on' ? 'On' : 'Off';
        const boldingStatus = boldingStyle === 'start' ? 'Start of word' : 'Half word';
        currentModeDisplay.textContent = `Rendering: ${renderStatus}, Bolding: ${boldingStyle}`;
    }

    /**
     * Saves the selected rendering mode and bolding style to Chrome storage and updates the UI.
     * @param {string} renderMode - The rendering mode to save ('on' or 'off')
     * @param {string} boldingStyle - The bolding style to save ('start' or 'half')
     */
    function saveSettings(renderMode, boldingStyle) {
        if (!['on', 'off'].includes(renderMode)) {
            console.error('Invalid render mode specified:', renderMode);
            return;
        }
        if (!['start', 'half'].includes(boldingStyle)) {
            console.error('Invalid bolding style specified:', boldingStyle);
            return;
        }
        chrome.storage.sync.set({ renderMode: renderMode, boldingStyle: boldingStyle }, function() {
            if (chrome.runtime.lastError) {
                console.error('Error saving settings to storage:', chrome.runtime.lastError);
                return;
            }
            console.log(`Render mode set to ${renderMode}, Bolding style set to ${boldingStyle}`);
            updateModeDisplay(renderMode, boldingStyle);
            // Notify content script of settings change
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: "updateSettings",
                    renderMode: renderMode,
                    boldingStyle: boldingStyle
                });
            });
        });
    }

    /**
     * Retrieves the current rendering mode and bolding style from Chrome storage and updates the UI.
     */
    function getSettings() {
        chrome.storage.sync.get(['renderMode', 'boldingStyle'], function(data) {
            if (chrome.runtime.lastError) {
                console.error('Error retrieving settings from storage:', chrome.runtime.lastError);
                return;
            }
            const renderMode = data.renderMode || 'on';
            const boldingStyle = data.boldingStyle || 'half'; // Default to 'half' (current behavior)
            if (renderMode === 'on') {
                onMode.checked = true;
            } else if (renderMode === 'off') {
                offMode.checked = true;
            } else {
                console.warn('Unexpected render mode retrieved:', renderMode);
                onMode.checked = true; // Default to 'on' as fallback
            }
            if (boldingStyle === 'start') {
                startMode.checked = true;
            } else if (boldingStyle === 'half') {
                halfMode.checked = true;
            } else {
                console.warn('Unexpected bolding style retrieved:', boldingStyle);
                halfMode.checked = true; // Default to 'half' as fallback
            }
            updateModeDisplay(renderMode, boldingStyle);
        });
    }

    /**
     * Handles mode change events for the on rendering mode radio button.
     */
    onMode.addEventListener('change', function() {
        if (this.checked) {
            const boldingStyle = startMode.checked ? 'start' : 'half';
            saveSettings('on', boldingStyle);
        }
    });

    /**
     * Handles mode change events for the off rendering mode radio button.
     */
    offMode.addEventListener('change', function() {
        if (this.checked) saveSettings('off', startMode.checked ? 'start' : 'half');
    });

    /**
     * Handles mode change events for the start of word bolding style radio button.
     */
    startMode.addEventListener('change', function() {
        if (this.checked) {
            const renderMode = onMode.checked ? 'on' : 'off';
            saveSettings(renderMode, 'start');
        }
    });

    /**
     * Handles mode change events for the half word bolding style radio button.
     */
    halfMode.addEventListener('change', function() {
        if (this.checked) {
            const renderMode = onMode.checked ? 'on' : 'off';
            saveSettings(renderMode, 'half');
        }
    });

    // Initial settings fetch on popup load
    getSettings();
});