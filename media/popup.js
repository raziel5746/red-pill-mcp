// VS Code Webview Popup JavaScript
(function() {
    'use strict';

    // State management
    let timeoutInterval = null;
    let remainingTime = 0;
    let isDisposed = false;

    // Initialize popup
    function initializePopup() {
        console.log('Initializing popup with config:', popupConfig);

        // Set up event listeners
        setupEventListeners();

        // Start timeout countdown if applicable
        if (popupConfig.timeout && popupConfig.timeout > 0) {
            startTimeoutCountdown();
        }

        // Focus first button or close button
        focusFirstInteractiveElement();

        // Mark popup as ready
        console.log('Popup initialized successfully');
    }

    function setupEventListeners() {
        // Close button
        const closeButton = document.getElementById('closeButton');
        if (closeButton) {
            closeButton.addEventListener('click', handleClose);
        }

        // Action buttons
        const buttons = document.querySelectorAll('.popup-button');
        buttons.forEach(button => {
            button.addEventListener('click', handleButtonClick);
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', handleKeyDown);

        // Prevent context menu (optional)
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        // Handle window beforeunload
        window.addEventListener('beforeunload', handleBeforeUnload);
    }

    function handleButtonClick(event) {
        if (isDisposed) return;

        const button = event.currentTarget;
        const buttonId = button.dataset.buttonId;
        const action = button.dataset.action;

        console.log('Button clicked:', { buttonId, action });

        // Add loading state
        button.classList.add('loading');
        button.disabled = true;

        // Prepare response data
        const responseData = {
            type: 'button_click',
            buttonId: buttonId,
            action: action,
            timestamp: Date.now(),
            data: gatherFormData()
        };

        // Send response to extension
        sendMessage(responseData);

        // Prevent multiple clicks
        setTimeout(() => {
            if (!isDisposed) {
                button.classList.remove('loading');
                button.disabled = false;
            }
        }, 1000);
    }

    function handleClose() {
        if (isDisposed) return;

        console.log('Close button clicked');

        const responseData = {
            type: 'dismiss',
            timestamp: Date.now(),
            dismissed: true
        };

        sendMessage(responseData);
    }

    function handleKeyDown(event) {
        if (isDisposed) return;

        switch (event.key) {
            case 'Escape':
                event.preventDefault();
                handleClose();
                break;
            
            case 'Enter':
                // If focus is on a button, trigger click
                if (document.activeElement && document.activeElement.classList.contains('popup-button')) {
                    event.preventDefault();
                    document.activeElement.click();
                } else {
                    // Find primary button and click it
                    const primaryButton = document.querySelector('.popup-button--primary');
                    if (primaryButton) {
                        event.preventDefault();
                        primaryButton.click();
                    }
                }
                break;

            case 'Tab':
                // Enhanced tab navigation
                handleTabNavigation(event);
                break;

            case 'ArrowLeft':
            case 'ArrowRight':
                // Navigate between buttons
                if (document.activeElement && document.activeElement.classList.contains('popup-button')) {
                    event.preventDefault();
                    navigateBetweenButtons(event.key === 'ArrowRight');
                }
                break;
        }
    }

    function handleTabNavigation(event) {
        const focusableElements = document.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        
        const focusableArray = Array.from(focusableElements);
        const currentIndex = focusableArray.indexOf(document.activeElement);
        
        if (event.shiftKey) {
            // Shift+Tab - go backwards
            const prevIndex = currentIndex <= 0 ? focusableArray.length - 1 : currentIndex - 1;
            focusableArray[prevIndex]?.focus();
        } else {
            // Tab - go forwards
            const nextIndex = currentIndex >= focusableArray.length - 1 ? 0 : currentIndex + 1;
            focusableArray[nextIndex]?.focus();
        }
        
        event.preventDefault();
    }

    function navigateBetweenButtons(forward) {
        const buttons = document.querySelectorAll('.popup-button');
        const buttonsArray = Array.from(buttons);
        const currentIndex = buttonsArray.indexOf(document.activeElement);
        
        if (currentIndex !== -1) {
            const newIndex = forward 
                ? (currentIndex + 1) % buttonsArray.length
                : (currentIndex - 1 + buttonsArray.length) % buttonsArray.length;
            
            buttonsArray[newIndex]?.focus();
        }
    }

    function startTimeoutCountdown() {
        remainingTime = Math.ceil(popupConfig.timeout / 1000);
        const timeoutDisplay = document.getElementById('timeoutDisplay');
        
        if (!timeoutDisplay) return;

        timeoutInterval = setInterval(() => {
            remainingTime--;
            timeoutDisplay.textContent = `Timeout: ${remainingTime}s`;
            
            // Add warning class when less than 10 seconds remain
            if (remainingTime <= 10) {
                timeoutDisplay.classList.add('warning');
            }
            
            // Auto-close when timeout reaches 0
            if (remainingTime <= 0) {
                clearInterval(timeoutInterval);
                console.log('Popup timed out');
                
                const responseData = {
                    type: 'timeout',
                    timestamp: Date.now(),
                    dismissed: true
                };
                
                sendMessage(responseData);
            }
        }, 1000);
    }

    function focusFirstInteractiveElement() {
        // Try to focus the primary button first
        let elementToFocus = document.querySelector('.popup-button--primary');
        
        // If no primary button, focus the first button
        if (!elementToFocus) {
            elementToFocus = document.querySelector('.popup-button');
        }
        
        // If no buttons, focus the close button
        if (!elementToFocus) {
            elementToFocus = document.getElementById('closeButton');
        }
        
        if (elementToFocus) {
            elementToFocus.focus();
        }
    }

    function gatherFormData() {
        // Collect any form data from the popup
        const data = {};
        
        // Get all input elements
        const inputs = document.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            if (input.name) {
                data[input.name] = input.value;
            }
        });
        
        // Get any custom data attributes
        const customElements = document.querySelectorAll('[data-custom-value]');
        customElements.forEach(element => {
            const key = element.dataset.customKey || element.id;
            const value = element.dataset.customValue;
            if (key) {
                data[key] = value;
            }
        });
        
        return Object.keys(data).length > 0 ? data : undefined;
    }

    function sendMessage(data) {
        if (isDisposed) return;

        try {
            console.log('Sending message to extension:', data);
            vscode.postMessage(data);
            
            // Mark as disposed to prevent further interactions
            isDisposed = true;
            
            // Clean up
            cleanup();
            
        } catch (error) {
            console.error('Failed to send message:', error);
        }
    }

    function handleBeforeUnload() {
        cleanup();
    }

    function cleanup() {
        if (timeoutInterval) {
            clearInterval(timeoutInterval);
            timeoutInterval = null;
        }
        
        // Disable all interactive elements
        const interactiveElements = document.querySelectorAll('button, input, textarea, select');
        interactiveElements.forEach(element => {
            element.disabled = true;
        });
        
        console.log('Popup cleaned up');
    }

    // Utility functions
    function debounce(func, wait) {
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

    function throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // Error handling
    window.addEventListener('error', (event) => {
        console.error('Popup error:', event.error);
        
        if (!isDisposed) {
            const errorData = {
                type: 'error',
                error: {
                    message: event.error?.message || 'Unknown error',
                    stack: event.error?.stack,
                    filename: event.filename,
                    lineno: event.lineno,
                    colno: event.colno
                },
                timestamp: Date.now()
            };
            
            try {
                vscode.postMessage(errorData);
            } catch (e) {
                console.error('Failed to report error:', e);
            }
        }
    });

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializePopup);
    } else {
        initializePopup();
    }

    // Expose utilities for potential custom extensions
    window.PopupUtils = {
        sendCustomMessage: function(data) {
            if (!isDisposed) {
                sendMessage({ type: 'custom', data, timestamp: Date.now() });
            }
        },
        
        updateContent: function(newContent) {
            const messageElement = document.querySelector('.popup-message');
            if (messageElement && !isDisposed) {
                messageElement.innerHTML = newContent;
            }
        },
        
        addButton: function(buttonConfig) {
            const actionsContainer = document.querySelector('.popup-actions');
            if (actionsContainer && !isDisposed) {
                const button = document.createElement('button');
                button.className = `popup-button popup-button--${buttonConfig.style || 'secondary'}`;
                button.dataset.buttonId = buttonConfig.id;
                button.dataset.action = buttonConfig.action || '';
                button.textContent = buttonConfig.label;
                button.addEventListener('click', handleButtonClick);
                actionsContainer.appendChild(button);
            }
        }
    };

    console.log('Red Pill MCP Popup script loaded');
})();