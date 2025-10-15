/**
 * Плагин голосового ввода для чат модуля
 * Обеспечивает распознавание речи и вставку текста в поле ввода
 */
(function() {
    'use strict';

    // Уровень логирования модуля
    const LOG_LEVEL = 'warn';

    // Функция логирования с проверкой уровня
    function log(level, message, ...args) {
        const levels = { debug: 0, warn: 1, error: 2 };
        if (levels[level] >= levels[LOG_LEVEL]) {
            console[level](`[voice-input-plugin] ${message}`, ...args);
        }
    }

    // Состояние плагина
    const pluginState = {
        initialized: false,
        recognition: null,
        isRecording: false,
        mediaStream: null,
        microphonePermission: null,
        currentButton: null,
        mode: 'insert', // 'insert' или 'send'
        originalValue: null, // Исходное значение поля ввода перед записью
        hasRecognizedSpeech: false // Флаг успешного распознавания речи
    };

    /**
     * Инициализация плагина голосового ввода
     */
    function initializeVoiceInput() {
        if (pluginState.initialized) {
            log('debug', 'Voice input plugin already initialized');
            return true;
        }

        // Проверяем поддержку Web Speech API
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            log('error', 'Speech recognition not supported in this browser');
            showNotification('error', 'Ваш браузер не поддерживает распознавание речи. Используйте Chrome, Edge или Яндекс браузер.', 10000);
            return false;
        }

        // Инициализируем распознавание речи
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        pluginState.recognition = new SpeechRecognition();
        
        // Настройки распознавания
        pluginState.recognition.continuous = true; // Непрерывное распознавание
        pluginState.recognition.interimResults = true; // Промежуточные результаты
        pluginState.recognition.lang = 'ru-RU'; // Русский язык
        pluginState.recognition.maxAlternatives = 1;

        // Обработчики событий
        setupRecognitionEventHandlers();

        // Проверяем разрешения микрофона
        checkMicrophonePermission();

        pluginState.initialized = true;
        log('debug', 'Voice input plugin initialized successfully');

        // Уведомляем о готовности плагина
        if (window.eventBus) {
            window.eventBus.emit('module.voice-input-plugin.ready', {
                timestamp: Date.now(),
                moduleId: 'voice-input-plugin'
            });
        }

        return true;
    }

    /**
     * Настройка обработчиков событий распознавания речи
     */
    function setupRecognitionEventHandlers() {
        if (!pluginState.recognition) return;

        pluginState.recognition.onstart = () => {
            log('debug', 'Speech recognition onstart event:', {
                timestamp: Date.now(),
                currentState: {
                    isRecording: pluginState.isRecording,
                    microphonePermission: pluginState.microphonePermission,
                    currentButton: pluginState.currentButton?.id,
                    mode: pluginState.mode
                },
                messageInputValue: document.getElementById('messageInput')?.value || ''
            });

            pluginState.isRecording = true;
            pluginState.hasRecognizedSpeech = false; // Сбрасываем флаг при старте
            updateButtonState(pluginState.currentButton, true);
            showListeningStatus();
            
            // Сохраняем исходное значение поля ввода
            const messageInput = document.getElementById('messageInput');
            if (messageInput) {
                pluginState.originalValue = messageInput.value;
            }
            
            log('debug', 'Speech recognition started');
        };

        pluginState.recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            // Обновляем поле ввода
            const messageInput = document.getElementById('messageInput');
            if (messageInput) {
                if (finalTranscript) {
                    // Окончательный результат - добавляем к существующему тексту на новой строке
                    const existingText = pluginState.originalValue || '';
                    const separator = existingText.trim() ? '\n' : '';
                    messageInput.value = existingText + separator + finalTranscript;
                    
                    // Устанавливаем флаг успешного распознавания
                    pluginState.hasRecognizedSpeech = true;
                    
                    // Сохраняем новое значение как базовое
                    pluginState.originalValue = messageInput.value;
                    
                    // Вызываем autoResizeTextarea для корректного изменения размера поля
                    if (window.chatModule && window.chatModule.autoResizeTextarea) {
                        window.chatModule.autoResizeTextarea.call(messageInput);
                    }

                    // Если режим прямой отправки, отправляем сообщение
                    if (pluginState.mode === 'send') {
                        setTimeout(() => {
                            const sendBtn = document.getElementById('sendBtn');
                            if (sendBtn && messageInput.value.trim()) {
                                sendBtn.click();
                            }
                        }, 500); // Небольшая задержка для завершения распознавания
                    }
                } else if (interimTranscript) {
                    // Промежуточный результат - показываем поверх базового текста на новой строке
                    const existingText = pluginState.originalValue || '';
                    const separator = existingText.trim() ? '\n' : '';
                    messageInput.value = existingText + separator + interimTranscript;
                    
                    // Даже промежуточные результаты считаем успешным распознаванием
                    pluginState.hasRecognizedSpeech = true;
                }
            }
        };

        pluginState.recognition.onend = () => {
            log('debug', 'Speech recognition onend event:', {
                timestamp: Date.now(),
                wasRecording: pluginState.isRecording,
                currentState: {
                    microphonePermission: pluginState.microphonePermission,
                    currentButton: pluginState.currentButton?.id,
                    mode: pluginState.mode,
                    originalValue: pluginState.originalValue
                },
                messageInputValue: document.getElementById('messageInput')?.value || ''
            });

            pluginState.isRecording = false;
            updateButtonState(pluginState.currentButton, false);
            hideListeningStatus();
            
            // Очищаем сохраненное значение
            pluginState.originalValue = null;
            
            log('debug', 'Speech recognition ended');
        };

        pluginState.recognition.onerror = (event) => {
            log('debug', 'Speech recognition error event received:', {
                error: event.error,
                type: event.type,
                timeStamp: event.timeStamp,
                target: event.target,
                currentState: {
                    isRecording: pluginState.isRecording,
                    microphonePermission: pluginState.microphonePermission,
                    recognitionState: pluginState.recognition ? pluginState.recognition.state : 'unknown'
                }
            });
            
            let errorMsg = 'Ошибка распознавания речи';
            let notificationType = 'error';
            
            switch(event.error) {
                case 'network':
                    log('debug', 'Network error details:', {
                        hasRecognizedSpeech: pluginState.hasRecognizedSpeech,
                        navigator: {
                            onLine: navigator.onLine,
                            connection: navigator.connection ? {
                                effectiveType: navigator.connection.effectiveType,
                                downlink: navigator.connection.downlink,
                                rtt: navigator.connection.rtt
                            } : 'not available'
                        },
                        speechRecognition: {
                            lang: pluginState.recognition.lang,
                            continuous: pluginState.recognition.continuous,
                            interimResults: pluginState.recognition.interimResults,
                            maxAlternatives: pluginState.recognition.maxAlternatives
                        },
                        userAgent: navigator.userAgent,
                        protocol: window.location.protocol,
                        host: window.location.host
                    });
                    
                    // Не показываем предупреждение, если распознавание фактически работает
                    if (pluginState.hasRecognizedSpeech) {
                        // Не показываем уведомление и не логируем, если распознавание работает
                        pluginState.isRecording = false;
                        updateButtonState(pluginState.currentButton, false);
                        hideListeningStatus();
                        pluginState.originalValue = null;
                        return; // Выходим без показа уведомления и логирования
                    }
                    
                    errorMsg = 'Сервис распознавания речи временно недоступен. Попробуйте еще раз.';
                    notificationType = 'warning';
                    break;
                case 'not-allowed':
                    log('debug', 'Permission denied error:', {
                        microphonePermission: pluginState.microphonePermission,
                        mediaDevices: !!navigator.mediaDevices,
                        getUserMedia: !!navigator.mediaDevices?.getUserMedia
                    });
                    pluginState.microphonePermission = 'denied';
                    errorMsg = 'Доступ к микрофону запрещен. Разрешите доступ в настройках браузера.';
                    updateMicrophoneButtonsState();
                    break;
                case 'no-speech':
                    log('debug', 'No speech detected error');
                    errorMsg = 'Речь не обнаружена. Попробуйте еще раз.';
                    notificationType = 'warning';
                    break;
                case 'audio-capture':
                    log('debug', 'Audio capture error:', {
                        mediaDevices: !!navigator.mediaDevices,
                        microphonePermission: pluginState.microphonePermission
                    });
                    errorMsg = 'Микрофон недоступен.';
                    break;
                case 'service-not-allowed':
                    log('debug', 'Service not allowed error');
                    errorMsg = 'Сервис распознавания речи недоступен.';
                    break;
                case 'bad-grammar':
                    log('debug', 'Bad grammar error');
                    errorMsg = 'Ошибка грамматики распознавания.';
                    notificationType = 'warning';
                    break;
                case 'language-not-supported':
                    log('debug', 'Language not supported error:', {
                        currentLang: pluginState.recognition.lang,
                        supportedLangs: 'unknown'
                    });
                    errorMsg = 'Язык не поддерживается сервисом распознавания.';
                    break;
                default:
                    log('debug', 'Unknown speech recognition error:', event.error);
                    break;
            }
            
            // Проверяем, не была ли это уже обработанная "network" ошибка при работающем распознавании
            if (event.error === 'network' && pluginState.hasRecognizedSpeech) {
                // Ничего не делаем - уже обработано выше
                return;
            }
            
            showNotification(notificationType, errorMsg, notificationType === 'error' ? 10000 : 5000);
            pluginState.isRecording = false;
            updateButtonState(pluginState.currentButton, false);
            hideListeningStatus();
            
            // Очищаем сохраненное значение при ошибке
            pluginState.originalValue = null;
            
            log(notificationType === 'error' ? 'error' : 'warn', 'Speech recognition error:', event.error);
        };
    }

    /**
     * Проверка разрешений микрофона
     */
    async function checkMicrophonePermission() {
        try {
            // Проверяем поддержку Permissions API
            if ('permissions' in navigator) {
                const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
                pluginState.microphonePermission = permissionStatus.state;
                
                // Слушаем изменения разрешения
                permissionStatus.onchange = () => {
                    pluginState.microphonePermission = permissionStatus.state;
                    updateMicrophoneButtonsState();
                };
            }

            // Если разрешение уже предоставлено, получаем медиапоток заранее
            if (pluginState.microphonePermission === 'granted') {
                await ensureMicrophoneAccess();
            }
        } catch (error) {
            log('warn', 'Permission check unavailable:', error);
        }
        
        updateMicrophoneButtonsState();
    }

    /**
     * Обеспечение доступа к микрофону
     */
    async function ensureMicrophoneAccess() {
        try {
            // Получаем доступ к микрофону один раз
            if (!pluginState.mediaStream) {
                pluginState.mediaStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });
                
                // Сразу останавливаем поток, но разрешение уже сохранено
                pluginState.mediaStream.getTracks().forEach(track => track.stop());
                pluginState.mediaStream = null;
                
                pluginState.microphonePermission = 'granted';
                // Убираем нотификацию, чтобы избежать дублирования
                // showNotification('success', 'Микрофон готов к использованию');
                
                // Небольшая задержка перед очисткой статуса
                setTimeout(() => {
                    // Статус очистится автоматически
                }, 2000);
            }
        } catch (error) {
            pluginState.microphonePermission = 'denied';
            handleMicrophoneError(error);
        }
    }

    /**
     * Обработка ошибок микрофона
     */
    function handleMicrophoneError(error) {
        let errorMsg = 'Ошибка доступа к микрофону';
        
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            errorMsg = 'Доступ к микрофону запрещен. Разрешите доступ и перезагрузите страницу.';
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
            errorMsg = 'Микрофон не найден. Подключите микрофон и попробуйте снова.';
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
            errorMsg = 'Микрофон уже используется другим приложением.';
        }
        
        showNotification('error', errorMsg, 10000);
    }

    /**
     * Начало записи голоса
     */
    async function startRecording(button, mode = 'insert') {
        if (!pluginState.recognition) {
            showNotification('error', 'Распознавание речи недоступно', 10000);
            return;
        }

        if (pluginState.isRecording) {
            stopRecording();
            return;
        }

        try {
            // Проверяем разрешение перед стартом
            if (pluginState.microphonePermission !== 'granted') {
                await ensureMicrophoneAccess();
                if (pluginState.microphonePermission !== 'granted') {
                    return;
                }
            }

            pluginState.currentButton = button;
            pluginState.mode = mode;
            pluginState.recognition.start();
        } catch (error) {
            if (error.name === 'InvalidStateError') {
                // Распознавание уже активно, останавливаем и перезапускаем
                pluginState.recognition.stop();
                setTimeout(() => {
                    pluginState.recognition.start();
                }, 100);
            } else {
                showNotification('error', 'Ошибка запуска записи', 10000);
                log('error', 'Start recording error:', error);
            }
        }
    }

    /**
     * Остановка записи голоса
     */
    function stopRecording() {
        if (pluginState.recognition && pluginState.isRecording) {
            pluginState.recognition.stop();
        }
    }

    /**
     * Обновление состояния кнопки
     */
    function updateButtonState(button, isRecording) {
        if (!button) return;

        if (isRecording) {
            button.classList.remove('btn-outline-secondary');
            button.classList.add('btn-danger');
            
            // Обновляем иконку и tooltip в зависимости от типа кнопки
            const icon = button.querySelector('i');
            if (button.id === 'microphoneBtn') {
                icon.className = 'bi bi-mic-fill';
                button.title = 'Нажмите, чтобы остановить запись';
            } else if (button.id === 'microphoneSendBtn') {
                icon.className = 'bi bi-mic-fill';
                button.title = 'Нажмите, чтобы остановить запись';
            }
        } else {
            button.classList.remove('btn-danger');
            button.classList.add('btn-outline-secondary');
            
            // Восстанавливаем оригинальную иконку и tooltip
            const icon = button.querySelector('i');
            if (button.id === 'microphoneBtn') {
                icon.className = 'bi bi-mic';
                button.title = 'Вставлять распознанный текст в поле ввода чата и не отправлять сообщение';
            } else if (button.id === 'microphoneSendBtn') {
                icon.className = 'bi bi-mic';
                button.title = 'Сразу отправлять распознанный текст как сообщение';
            }
        }
        
        // Обновляем Bootstrap tooltip, если он существует
        const tooltip = bootstrap.Tooltip.getInstance(button);
        if (tooltip) {
            tooltip.dispose();
            new bootstrap.Tooltip(button, {
                trigger: 'hover focus',
                delay: { show: 500, hide: 100 },
                placement: 'auto'
            });
        }
    }

    /**
     * Обновление состояния кнопок микрофона
     */
    function updateMicrophoneButtonsState() {
        const micBtn = document.getElementById('microphoneBtn');
        const micSendBtn = document.getElementById('microphoneSendBtn');
        
        const isDisabled = pluginState.microphonePermission === 'denied';
        
        if (micBtn) {
            micBtn.disabled = isDisabled;
            if (isDisabled) {
                micBtn.title = 'Доступ к микрофону запрещен. Включите его в настройках браузера.';
            } else {
                micBtn.title = 'Вставлять распознанный текст в поле ввода чата и не отправлять сообщение';
            }
            
            // Обновляем Bootstrap tooltip
            const tooltip = bootstrap.Tooltip.getInstance(micBtn);
            if (tooltip) {
                tooltip.dispose();
                new bootstrap.Tooltip(micBtn, {
                    trigger: 'hover focus',
                    delay: { show: 500, hide: 100 },
                    placement: 'auto'
                });
            }
        }
        
        if (micSendBtn) {
            micSendBtn.disabled = isDisabled;
            if (isDisabled) {
                micSendBtn.title = 'Доступ к микрофону запрещен. Включите его в настройках браузера.';
            } else {
                micSendBtn.title = 'Сразу отправлять распознанный текст как сообщение';
            }
            
            // Обновляем Bootstrap tooltip
            const tooltip = bootstrap.Tooltip.getInstance(micSendBtn);
            if (tooltip) {
                tooltip.dispose();
                new bootstrap.Tooltip(micSendBtn, {
                    trigger: 'hover focus',
                    delay: { show: 500, hide: 100 },
                    placement: 'auto'
                });
            }
        }
    }

    /**
     * Показ статуса прослушивания
     */
    function showListeningStatus() {
        const statusElement = document.getElementById('listeningStatus');
        if (statusElement) {
            statusElement.textContent = 'Слушаю... Говорите!';
            statusElement.style.display = 'block';
        }
    }

    /**
     * Скрытие статуса прослушивания
     */
    function hideListeningStatus() {
        const statusElement = document.getElementById('listeningStatus');
        if (statusElement) {
            statusElement.style.display = 'none';
        }
    }

    /**
     * Показ нотификации через EventBus
     */
    function showNotification(type, message, duration = 5000) {
        if (window.eventBus) {
            window.eventBus.emit(`notification.show.${type}`, {
                message: message,
                duration: duration,
                moduleId: 'voice-input-plugin'
            });
        } else {
            // Fallback для случая, когда EventBus недоступен
            console[type === 'error' ? 'error' : 'log'](`[voice-input-plugin] ${message}`);
        }
    }

    /**
     * Получение статистики плагина
     */
    function getStats() {
        return {
            initialized: pluginState.initialized,
            isRecording: pluginState.isRecording,
            microphonePermission: pluginState.microphonePermission,
            mode: pluginState.mode,
            recognitionAvailable: !!pluginState.recognition
        };
    }

    // Инициализация при загрузке DOM
    document.addEventListener('DOMContentLoaded', function() {
        log('debug', 'DOM loaded, initializing voice input plugin');
        setTimeout(() => {
            initializeVoiceInput();
            // Дополнительная проверка разрешений через небольшую задержку
            setTimeout(checkMicrophonePermission, 500);
        }, 100);
    });

    // Публичный API
    window.voiceInputPlugin = {
        // Основные функции
        initialize: initializeVoiceInput,
        startRecording: startRecording,
        stopRecording: stopRecording,
        
        // Утилиты
        checkMicrophonePermission: checkMicrophonePermission,
        updateMicrophoneButtonsState: updateMicrophoneButtonsState,
        
        // Информация о состоянии
        getStats: getStats,
        
        // Проверка готовности
        get isReady() {
            return pluginState.initialized;
        },
        
        get isRecording() {
            return pluginState.isRecording;
        },
        
        get microphonePermission() {
            return pluginState.microphonePermission;
        }
    };

    log('debug', 'Voice input plugin module loaded');

})();