/**
 * Модуль улучшения запросов через ЛЛМ
 * Вынесен из chat-module.js для уменьшения размера основного файла
 */
(function() {
    'use strict';

    /**
     * Функция для замены спецсимволов в промптах
     * @param {string} template - Шаблон с переменными в формате ${variableName}
     * @param {Object} variables - Объект с переменными для замены
     * @returns {string} - Строка с замененными переменными
     */
    function replaceTemplateVariables(template, variables) {
        if (!template || typeof template !== 'string') {
            return template;
        }
        
        return template.replace(/\$\{([^}]+)\}/g, (match, variableName) => {
            const trimmedName = variableName.trim();
            
            // Проверяем наличие переменной
            if (variables.hasOwnProperty(trimmedName)) {
                const value = variables[trimmedName];
                // Экранируем специальные символы если необходимо
                return typeof value === 'string' ? value : String(value);
            } else {
                // Если переменная не найдена, оставляем исходный текст
                console.warn(`Template variable '${trimmedName}' not found, keeping original text`);
                return match;
            }
        });
    }

    /**
     * Улучшение запроса через ЛЛМ
     */
    async function enhanceQuery() {
        const messageInput = document.getElementById('messageInput');
        const enhanceBtn = document.getElementById('enhanceQueryBtn');
        const currentText = messageInput.value.trim();
        
        // Валидация входных данных
        if (!currentText) {
            window.eventBus.emit('notification.show.warning', {
                message: 'Поле ввода пустое. Введите текст для улучшения.',
                duration: 3000,
                moduleId: 'enhancement-module'
            });
            return;
        }
        
        if (currentText.length < 3) {
            window.eventBus.emit('notification.show.warning', {
                message: 'Сообщение слишком короткое. Введите минимум 3 символа.',
                duration: 3000,
                moduleId: 'enhancement-module'
            });
            return;
        }
        
        // Проверяем, не выполняется ли уже улучшение
        if (enhanceBtn.disabled) {
            return;
        }
        
        // Сохраняем исходный текст для возможности отмены
        const originalText = currentText;
        
        // Сохраняем в dataset сразу, чтобы Ctrl+Z работал даже при ошибках
        messageInput.dataset.originalText = originalText;
        console.debug('Original text saved for undo:', originalText);
        
        try {
            // Блокируем кнопку и показываем индикатор загрузки
            enhanceBtn.disabled = true;
            const originalIcon = enhanceBtn.querySelector('i');
            const originalIconClass = originalIcon.className;
            originalIcon.className = 'spinner-border spinner-border-sm';
            
            // Получаем промпт для улучшения из настроек
            let enhancePrompt = null;
            
            // Создаем промис для получения промпта
            const getEnhancePrompt = new Promise((resolve) => {
                const handler = (prompt) => {
                    window.eventBus.off('globalVars.enhance.value', handler);
                    resolve(prompt);
                };
                window.eventBus.on('globalVars.enhance.value', handler);
                window.eventBus.emit('globalVars.enhance.get');
            });
            
            enhancePrompt = await getEnhancePrompt;
            
            if (!enhancePrompt) {
                throw new Error('Промпт для улучшения не найден в настройках');
            }
            
            // Заменяем переменные в промпте
            const processedPrompt = replaceTemplateVariables(enhancePrompt, {
                messageInput: currentText
            });
            
            // Получаем настройки чата
            const chatState = window.chatModule.chatState;
            
            // Проверяем настройки ЛЛМ
            if (!chatState.settings.llm_api_url || !chatState.settings.llm_api_key) {
                throw new Error('Не настроены параметры подключения к ЛЛМ. Проверьте настройки.');
            }
            
            // Отправляем запрос к ЛЛМ
            const response = await fetch(chatState.settings.llm_api_url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${chatState.settings.llm_api_key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: chatState.settings.llm_model,
                    messages: [
                        {
                            role: 'user',
                            content: processedPrompt
                        }
                    ],
                    stream: false,
                    max_tokens: 1000
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Извлекаем улучшенный текст из ответа
            if (data.choices && data.choices[0] && data.choices[0].message) {
                const enhancedText = data.choices[0].message.content.trim();
                
                if (enhancedText) {
                    // Заменяем текст в поле ввода
                    messageInput.value = enhancedText;
                    
                    // Автоматически изменяем размер поля ввода
                    if (window.chatModule && typeof window.chatModule.autoResizeTextarea === 'function') {
                        window.chatModule.autoResizeTextarea.call(messageInput);
                    }
                    
                    // Показываем уведомление об успехе
                    window.eventBus.emit('notification.show.success', {
                        message: 'Запрос успешно улучшен! Используйте Ctrl+Z для отмены.',
                        duration: 7000,
                        moduleId: 'enhancement-module'
                    });
                    
                    // Фокусируемся на поле ввода
                    messageInput.focus();
                    
                } else {
                    throw new Error('ЛЛМ вернул пустой ответ');
                }
            } else {
                throw new Error('Неверный формат ответа от ЛЛМ');
            }
            
        } catch (error) {
            console.error('Error enhancing query:', error);
            
            // Показываем уведомление об ошибке
            window.eventBus.emit('notification.show.error', {
                message: `Ошибка улучшения запроса: ${error.message}. Используйте Ctrl+Z для отмены.`,
                duration: 5000,
                moduleId: 'enhancement-module'
            });
            
            // Оставляем исходный текст без изменений
            messageInput.value = originalText;
            
        } finally {
            // Восстанавливаем кнопку
            enhanceBtn.disabled = false;
            const icon = enhanceBtn.querySelector('i');
            icon.className = 'bi bi-magic';
        }
    }

    /**
     * Отмена улучшения запроса (возврат к исходному тексту)
     */
    function undoEnhancement() {
        const messageInput = document.getElementById('messageInput');
        const originalText = messageInput.dataset.originalText;
        
        console.debug('undoEnhancement called, originalText:', originalText);
        
        if (originalText !== undefined) {
            // Восстанавливаем исходный текст
            messageInput.value = originalText;
            
            // Автоматически изменяем размер поля ввода
            if (window.chatModule && typeof window.chatModule.autoResizeTextarea === 'function') {
                window.chatModule.autoResizeTextarea.call(messageInput);
            }
            
            // Удаляем сохраненный исходный текст
            delete messageInput.dataset.originalText;
            
            // Показываем уведомление
            window.eventBus.emit('notification.show.info', {
                message: 'Изменения отменены, восстановлен исходный текст.',
                duration: 3000,
                moduleId: 'enhancement-module'
            });
            
            // Фокусируемся на поле ввода
            messageInput.focus();
            
            console.debug('Enhancement undone, original text restored');
        } else {
            // Если нет сохраненного текста, показываем предупреждение
            window.eventBus.emit('notification.show.warning', {
                message: 'Нет изменений для отмены.',
                duration: 2000,
                moduleId: 'enhancement-module'
            });
        }
    }

    // Экспорт функций для использования в других модулях
    window.enhancementModule = {
        enhanceQuery: enhanceQuery,
        undoEnhancement: undoEnhancement,
        replaceTemplateVariables: replaceTemplateVariables
    };

})();