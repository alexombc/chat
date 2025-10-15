/**
 * Модуль чата (IIFE) с поддержкой markdown-it и интеграцией с EventBus
 */
(function() {
    'use strict';

    // Уровень логирования модуля
    // Доступные уровни: 'debug', 'warn', 'error'
    // debug - все сообщения, warn - предупреждения и ошибки, error - только ошибки
    const LOG_LEVEL = 'warn';

    // Функция логирования с проверкой уровня
    function log(level, message, ...args) {
        const levels = { debug: 0, warn: 1, error: 2 };
        if (levels[level] >= levels[LOG_LEVEL]) {
            console[level](message, ...args);
        }
    }

    // Состояние модуля чата
    const chatState = {
        currentChatId: null,
        messages: [],
        settings: {
            llm_api_url: "",
            llm_api_key: "",
            llm_model: "",
            enable_llm_stream: true
        },
        isLoading: false,
        searchMode: false,
        researchMode: false,
        selectedFiles: [],
        isRecording: false
    };


    // Инициализация при загрузке DOM
    document.addEventListener('DOMContentLoaded', function() {
        // Проверяем доступность зависимостей
        checkDependencies();
        
        initializeChatModule();
        setupEventBusListeners();
        requestInitialSettings();
        
        
        // Уведомляем о готовности модуля чата
        window.eventBus.emit('module.chat-module.ready', {
            timestamp: Date.now(),
            moduleId: 'chat-module'
        });
    });

    /**
     * Проверка доступности зависимостей
     */
    function checkDependencies() {
        if (!window.eventBus) {
            log('error', 'EventBus is required for chat module');
            return false;
        }
        
        if (!window.messageRenderer) {
            log('error', 'Message renderer is required for chat module');
            return false;
        }
        
        if (!window.markdownCore) {
            log('warn', 'Markdown core not available - markdown rendering will be limited');
        }

        if (!window.enhancementModule) {
            log('warn', 'Enhancement module not available - query enhancement will be disabled');
        }
        
        if (!window.filePreview) {
            log('warn', 'File preview module not available - file preview functionality will be limited');
        } else {
            log('debug', 'File preview module loaded successfully');
        }
        
        if (!window.voiceInputPlugin) {
            log('warn', 'Voice input plugin not available - voice input functionality will be disabled');
        } else {
            log('debug', 'Voice input plugin loaded successfully');
        }
        
        return true;
    }

    /**
     * Инициализация модуля чата
     */
    function initializeChatModule() {
        renderChatInterface();
        setupChatEventListeners();
        log('debug', 'Chat module initialized');
    }

    /**
     * Отрисовка интерфейса чата
     */
    function renderChatInterface() {
        const chatContainer = document.getElementById('chatContainer');
        chatContainer.innerHTML = `
            <div class="d-flex flex-column h-100">
                <!-- Заголовок чата -->
                <div class="border-bottom p-3 bg-body-secondary d-flex justify-content-between align-items-center">
                    <h5 class="mb-0" id="chatTitle">Выберите чат</h5>
                    
                    <!-- Блок лимитов и расходов чата -->
                    <div class="d-flex align-items-center gap-2 text-muted" style="font-size: 0.85rem;">
                        <!-- Израсходованные токены -->
                        <span id="usedTokens">49.6тыс</span>
                        
                        <!-- Прогресс-бар -->
                        <div style="width: 200px; height: 8px; border: 1.6px solid var(--bs-border-color); border-radius: 4px; background-color: transparent; position: relative;">
                            <div style="width: 25%; height: 100%; background-color: var(--bs-primary); border-radius: 3px;"
                                 role="progressbar" aria-valuenow="25" aria-valuemin="0" aria-valuemax="100">
                            </div>
                        </div>
                        
                        <!-- Лимит токенов -->
                        <span id="tokenLimit">200.0тыс</span>
                        
                        <!-- Иконка сжатия контекста -->
                        <button class="btn btn-sm btn-link p-0 text-muted" id="compressContextBtn"
                                title="Интеллектуально сжать контекст истории чата" data-bs-toggle="tooltip">
                            <i class="bi bi-arrow-down-circle" style="font-size: 1rem;"></i>
                        </button>
                        
                        <!-- Сумма расходов -->
                        <span id="chatCost" class="text-secondary fw-bold">$0.22</span>
                        
                        <!-- Кнопки управления чатом -->
                        <button class="btn btn-sm btn-link p-0 text-muted ms-2" id="copyChatBtn"
                                title="Копировать весь чат в буфер обмена" data-bs-toggle="tooltip">
                            <i class="bi bi-clipboard" style="font-size: 1rem;"></i>
                        </button>
                        
                        <button class="btn btn-sm btn-link p-0 text-muted" id="downloadChatBtn"
                                title="Скачать весь чат в файл" data-bs-toggle="tooltip">
                            <i class="bi bi-download" style="font-size: 1rem;"></i>
                        </button>
                        
                        <button class="btn btn-sm btn-link p-0 text-muted" id="helpChatBtn"
                                title="Помощь по использованию чата" data-bs-toggle="tooltip">
                            <i class="bi bi-question-circle" style="font-size: 1rem;"></i>
                        </button>
                    </div>
                </div>
                
                <!-- Область сообщений -->
                <div class="flex-grow-1 overflow-auto p-3" id="messagesArea">
                    <div class="text-center text-muted">
                        <i class="bi bi-chat-dots fs-1"></i>
                        <p class="mt-2">Начните новый разговор</p>
                    </div>
                </div>
                
                <!-- Область ввода -->
                <div class="border-top p-3">
                    <div class="mb-2">
                        <!-- Контейнер с имитацией поля ввода -->
                        <div class="input-container-wrapper" style="position: relative; border: 1px solid var(--bs-border-color); border-radius: 0.375rem; background-color: var(--bs-body-bg);">
                            <div style="display: flex; align-items: stretch;">
                                <!-- Поле ввода сообщения без бордюра -->
                                <textarea class="form-control" id="messageInput" rows="3"
                                          placeholder="Введите ваше сообщение..."
                                          style="resize: none; overflow-y: auto; min-height: 60px; border: none; box-shadow: none; background: transparent; flex: 1; margin-right: 50px;"></textarea>
                                
                                <!-- Область для кнопок справа -->
                                <div class="input-buttons-area" style="position: absolute; right: 8px; top: 8px; bottom: 8px; width: 42px; display: flex; flex-direction: column; justify-content: space-between; align-items: center;">
                                    <!-- Кнопка улучшения запроса (верх) -->
                                    <button class="btn btn-link p-0" id="enhanceQueryBtn"
                                            title="Улучшить запрос через ЛЛМ" data-bs-toggle="tooltip"
                                            style="color: var(--bs-secondary); font-size: 1.2rem; line-height: 1; border: none; background: none; margin-top: 4px;">
                                        <i class="bi bi-magic"></i>
                                    </button>
                                    
                                    <!-- Кнопка отправки (низ) -->
                                    <button class="btn btn-primary" id="sendBtn"
                                            style="width: 40px; height: 40px; padding: 0; font-size: 1rem; line-height: 1; display: flex; align-items: center; justify-content: center;">
                                        <i class="bi bi-send"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Прикрепленный файл -->
                        <div id="attachedFileInfo" class="mt-2 d-none">
                            <div class="alert alert-info d-flex justify-content-between align-items-center">
                                <span>
                                    <i class="bi bi-paperclip"></i>
                                    <span id="attachedFileName"></span>
                                </span>
                                <button type="button" class="btn btn-sm btn-outline-danger" id="removeFileBtn">
                                    <i class="bi bi-x"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Панель инструментов -->
                    <div class="d-flex justify-content-between align-items-center">
                        <!-- Левые иконки -->
                        <div class="d-flex gap-2">
                            <button class="btn btn-sm btn-outline-secondary" id="snippetsBtn"
                                    title="Готовые фразы" data-bs-toggle="tooltip">
                                <i class="bi bi-chat-quote"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-secondary" id="searchBtn"
                                    title="Поиск" data-bs-toggle="tooltip">
                                <i class="bi bi-search"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-secondary" id="researchBtn"
                                    title="Глубокое исследование" data-bs-toggle="tooltip">
                                <i class="bi bi-lightbulb"></i>
                            </button>
                        </div>
                        
                        <!-- Центральная область - статус прослушивания -->
                        <div class="text-center">
                            <span id="listeningStatus" class="text-success fw-bold listening-indicator" style="display: none; font-size: 1.0rem;">🎤 Слушаю... Говорите!</span>
                        </div>
                        
                        <!-- Правые иконки -->
                        <div class="d-flex gap-2">
                            <button class="btn btn-sm btn-outline-secondary d-flex align-items-center justify-content-between" id="modelSelectBtn"
                                    title="Выбор модели" data-bs-toggle="tooltip"
                                    style="width: 4cm; border-radius: 20px; padding: 4px 12px; min-width: 4cm;">
                                <span id="selectedModelName" class="text-truncate" style="flex: 1; text-align: left; font-size: 0.8rem;">Модель не выбрана</span>
                                <i class="bi bi-chevron-down" style="margin-left: 4px;"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-secondary" id="attachFileBtn"
                                    title="Прикрепить файл" data-bs-toggle="tooltip">
                                <i class="bi bi-paperclip"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-secondary" id="microphoneBtn"
                                    title="Вставлять распознанный текст в поле ввода чата и не отправлять сообщение" data-bs-toggle="tooltip">
                                <i class="bi bi-mic"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-secondary" id="microphoneSendBtn"
                                    title="Сразу отправлять распознанный текст как сообщение" data-bs-toggle="tooltip"
                                    style="position: relative;">
                                <i class="bi bi-mic" style="margin-right: 2px;"></i><i class="bi bi-send" style="font-size: 0.8em;"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Выпадающий список готовых фраз -->
            <div id="snippetsDropdown" class="position-absolute bg-body border rounded shadow-sm d-none"
                 style="max-width: 400px; max-height: 300px; overflow-y: auto; z-index: 1000;">
                <div class="p-2 border-bottom bg-body-secondary">
                    <small class="text-muted fw-bold">Готовые фразы</small>
                </div>
                <div id="snippetsList" class="p-1">
                    <!-- Список фраз будет загружен динамически -->
                </div>
            </div>
            
            <!-- Скрытый input для файлов -->
            <input type="file" id="fileInput" class="d-none" accept="*/*" multiple>
            
            <!-- Модальное окно помощи -->
            <div class="modal fade" id="chatHelpModal" tabindex="-1" aria-labelledby="chatHelpModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="chatHelpModalLabel">
                                <i class="bi bi-question-circle me-2"></i>
                                Помощь по использованию чата
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть"></button>
                        </div>
                        <div class="modal-body">
                            <div class="text-center text-muted">
                                <i class="bi bi-tools fs-1 mb-3"></i>
                                <h6>Описание разрабатывается</h6>
                                <p>Подробная справка по использованию чата будет добавлена в ближайшее время.</p>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Закрыть</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Модальное окно для просмотра сообщений -->
            <div class="modal fade" id="messageViewModal" tabindex="-1" aria-labelledby="messageViewModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-fullscreen-sm-down" style="max-width: 90vw;">
                    <div class="modal-content" style="height: 90vh;">
                        <div class="modal-header">
                            <h5 class="modal-title" id="messageViewModalLabel">
                                <i class="bi bi-eye me-2"></i>
                                Просмотр сообщения
                            </h5>
                            <div class="d-flex align-items-center ms-auto">
                                <!-- Кнопки режимов просмотра -->
                                <button type="button" class="btn btn-sm btn-outline-primary modal-view-btn"
                                        data-mode="rendered" title="Просмотр">
                                    <i class="bi bi-eye"></i>
                                </button>
                                <button type="button" class="btn btn-sm btn-outline-primary modal-split-btn ms-1"
                                        data-mode="split" title="Сплит">
                                    <i class="bi bi-layout-split"></i>
                                </button>
                                <button type="button" class="btn btn-sm btn-outline-primary modal-view-btn ms-1"
                                        data-mode="markdown" title="Исходный код Markdown">
                                    <i class="bi bi-code"></i>
                                </button>
                                <button type="button" class="btn btn-sm btn-outline-secondary modal-edit-btn ms-1"
                                        title="Редактировать">
                                    <i class="bi bi-pencil"></i>
                                </button>
                                <button type="button" class="btn btn-sm btn-outline-secondary modal-copy-btn ms-1"
                                        title="Копировать в буфер обмена">
                                    <i class="bi bi-clipboard"></i>
                                </button>
                                <button type="button" class="btn btn-sm btn-outline-secondary modal-download-btn ms-1"
                                        title="Скачать сообщение в файл md">
                                    <i class="bi bi-download"></i>
                                </button>
                                
                                <!-- Вертикальный сепаратор -->
                                <div class="vr" style="margin-left: 16px; margin-right: 16px;"></div>
                                
                                <!-- Кнопка закрытия в стиле других кнопок -->
                                <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal" aria-label="Закрыть">
                                    <i class="bi bi-x-lg"></i>
                                </button>
                            </div>
                        </div>
                        <div class="modal-body p-0 overflow-hidden">
                            <!-- Контейнер для обычного просмотра -->
                            <div id="modalSingleView" class="h-100 p-3 overflow-auto">
                                <div id="modalMessageContent" class="message-content"></div>
                            </div>
                            
                            <!-- Контейнер для сплит-режима -->
                            <div id="modalSplitView" class="h-100 d-none">
                                <div class="d-flex flex-column flex-lg-row h-100">
                                    <!-- Левая панель - редактор -->
                                    <div class="border-end-lg border-bottom border-bottom-lg-0" style="flex: 0 0 40%; min-width: 40%;">
                                        <div class="p-2 bg-body-secondary border-bottom">
                                            <small class="fw-bold text-muted">Markdown исходный код</small>
                                        </div>
                                        <div class="position-relative" style="height: calc(100% - 40px);">
                                            <textarea id="modalSplitEditor" class="form-control h-100 border-0 rounded-0 split-sync-scroll"
                                                      style="resize: none; font-family: monospace;"></textarea>
                                        </div>
                                    </div>
                                    
                                    <!-- Правая панель - превью -->
                                    <div class="flex-fill">
                                        <div class="p-2 bg-body-secondary border-bottom">
                                            <small class="fw-bold text-muted">Предварительный просмотр</small>
                                        </div>
                                        <div id="modalSplitPreview" class="h-100 p-3 split-sync-scroll" style="height: calc(100% - 40px);"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Закрыть</button>
                            <button type="button" class="btn btn-primary d-none" id="modalSaveBtn">Сохранить изменения</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Инициализация tooltips с правильной конфигурацией
        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl, {
                trigger: 'hover focus',  // Показывать только при наведении мыши или фокусе
                delay: { show: 500, hide: 100 },  // Задержка показа/скрытия
                placement: 'auto'  // Автоматическое позиционирование
            });
        });
    }

    /**
     * Настройка обработчиков событий чата
     */
    function setupChatEventListeners() {
        // Отправка сообщения
        document.getElementById('sendBtn').addEventListener('click', sendMessage);
        
        // Кнопка улучшения запроса
        document.getElementById('enhanceQueryBtn').addEventListener('click', function() {
            if (window.enhancementModule) {
                window.enhancementModule.enhanceQuery();
            } else {
                console.error('Enhancement module not loaded');
            }
        });
        
        // Отправка по Enter (Ctrl+Enter для новой строки)
        const messageInput = document.getElementById('messageInput');
        messageInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
            
            // Обработка Ctrl+Z для отмены улучшения запроса (универсальная поддержка всех раскладок)
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey && !e.altKey && !e.repeat && !e.defaultPrevented) {
                e.preventDefault();
                e.stopPropagation();
                log('debug', 'Ctrl+Z pressed in messageInput, calling undoEnhancement');
                if (window.enhancementModule) {
                    window.enhancementModule.undoEnhancement();
                } else {
                    console.error('Enhancement module not loaded');
                }
                return false;
            }
        });
        
        // Автоматическое изменение высоты поля ввода
        messageInput.addEventListener('input', autoResizeTextarea);
        
        // Инициализируем размер при загрузке
        autoResizeTextarea.call(messageInput);
        
        // Кнопки режимов
        document.getElementById('snippetsBtn').addEventListener('click', toggleSnippetsDropdown);
        document.getElementById('searchBtn').addEventListener('click', toggleSearchMode);
        document.getElementById('researchBtn').addEventListener('click', toggleResearchMode);
        
        // Кнопки инструментов
        document.getElementById('modelSelectBtn').addEventListener('click', openModelSelection);
        document.getElementById('attachFileBtn').addEventListener('click', attachFile);
        document.getElementById('microphoneBtn').addEventListener('click', handleMicrophoneClick);
        document.getElementById('microphoneSendBtn').addEventListener('click', handleMicrophoneSendClick);
        
        // Файловый input
        document.getElementById('fileInput').addEventListener('change', handleFileSelection);
        document.getElementById('removeFileBtn').addEventListener('click', removeAttachedFile);
        
        // Кнопка сжатия контекста
        document.getElementById('compressContextBtn').addEventListener('click', compressContext);
        
        // Кнопки управления чатом
        document.getElementById('copyChatBtn').addEventListener('click', copyChatToClipboard);
        document.getElementById('downloadChatBtn').addEventListener('click', downloadChatToFile);
        document.getElementById('helpChatBtn').addEventListener('click', showChatHelp);
    }

    /**
     * Настройка слушателей EventBus
     */
    function setupEventBusListeners() {
        // Получение настроек из нового модуля настроек
        window.eventBus.on('globalVars.llm_api_url.value', (url) => {
            chatState.settings.llm_api_url = url;
        });
        
        window.eventBus.on('globalVars.llm_api_key.value', (key) => {
            chatState.settings.llm_api_key = key;
        });
        
        window.eventBus.on('globalVars.llm_model.value', (model) => {
            chatState.settings.llm_model = model;
            updateModelSelectButton(model);
        });
        
        window.eventBus.on('globalVars.enable_llm_stream.value', (enableStream) => {
            chatState.settings.enable_llm_stream = enableStream;
        });
        
        // Получение всех настроек сразу
        window.eventBus.on('globalVars.chat-settings.value', (settings) => {
            chatState.settings = { ...chatState.settings, ...settings };
        });
        
        // Изменения настроек из нового модуля настроек
        window.eventBus.on('globalVars.chat-settings.changed', (settings) => {
            chatState.settings = { ...chatState.settings, ...settings };
        });
        
        window.eventBus.on('globalVars.llm_api_url.changed', (url) => {
            chatState.settings.llm_api_url = url;
        });
        
        window.eventBus.on('globalVars.llm_api_key.changed', (key) => {
            chatState.settings.llm_api_key = key;
        });
        
        window.eventBus.on('globalVars.llm_model.changed', (model) => {
            chatState.settings.llm_model = model;
            updateModelSelectButton(model);
        });
        
        window.eventBus.on('globalVars.enable_llm_stream.changed', (enableStream) => {
            chatState.settings.enable_llm_stream = enableStream;
        });
        
        // Управление чатами
        window.eventBus.on('user.action.newChat', (data) => {
            switchToChat(data.chatId, data.chatName, []);
        });
        
        window.eventBus.on('user.action.switchChat', (data) => {
            switchToChat(data.chatId, data.chatName, data.messages);
        });
        
        // Подписка на изменения темы
        window.eventBus.on('globalVars.bootstrapTheme.changed', (theme) => {
            updateThemeStyles(theme);
        });
        
        // Подписка на готовность плагина голосового ввода
        window.eventBus.on('module.voice-input-plugin.ready', () => {
            log('debug', 'Voice input plugin is ready');
            // Обновляем состояние кнопок микрофона
            if (window.voiceInputPlugin) {
                window.voiceInputPlugin.updateMicrophoneButtonsState();
            }
        });
    }

    /**
     * Запрос начальных настроек
     */
    function requestInitialSettings() {
        // Запрашиваем все настройки сразу из нового модуля настроек
        window.eventBus.emit('globalVars.chat-settings.get');
        
        // Также запрашиваем конкретные настройки для совместимости
        window.eventBus.emit('globalVars.llm_api_url.get');
        window.eventBus.emit('globalVars.llm_api_key.get');
        window.eventBus.emit('globalVars.llm_model.get');
        window.eventBus.emit('globalVars.enable_llm_stream.get');
    }

    /**
     * Обновление кнопки выбора модели
     */
    function updateModelSelectButton(model) {
        const selectedModelName = document.getElementById('selectedModelName');
        if (selectedModelName) {
            if (model && model.trim()) {
                // Сокращаем длинные названия моделей для лучшего отображения
                let displayName = model;
                if (displayName.length > 20) {
                    displayName = displayName.substring(0, 17) + '...';
                }
                selectedModelName.textContent = displayName;
                selectedModelName.title = model; // Полное название в tooltip
            } else {
                selectedModelName.textContent = 'Модель не выбрана';
                selectedModelName.title = '';
            }
        }
    }

    /**
     * Переключение на другой чат
     */
    function switchToChat(chatId, chatName, messages) {
        chatState.currentChatId = chatId;
        chatState.messages = messages || [];
        
        document.getElementById('chatTitle').textContent = chatName;
        
        if (window.messageRenderer) {
            window.messageRenderer.render(chatState.messages);
        } else {
            console.error('Message renderer not available');
        }
    }


    /**
     * Отправка сообщения
     */
    async function sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const content = messageInput.value.trim();
        
        if (!content && chatState.selectedFiles.length === 0) return;
        if (chatState.isLoading) return;
        
        // Сохраняем копию файлов для этого сообщения
        const messageFiles = chatState.selectedFiles.length > 0 ? [...chatState.selectedFiles] : [];
        
        // Создание пользовательского сообщения
        const userMessage = {
            id: Date.now(),
            role: 'user',
            content: content,
            timestamp: Date.now(),
            files: messageFiles.length > 0 ? messageFiles.map(file => ({
                name: file.name,
                type: file.type,
                size: file.size
            })) : null,
            // Сохраняем ссылки на сами файлы для чтения содержимого
            _fileObjects: messageFiles.length > 0 ? messageFiles : null
        };
        
        // Добавление сообщения в чат
        chatState.messages.push(userMessage);
        if (window.messageRenderer) {
            window.messageRenderer.render(chatState.messages);
        }
        
        // Очистка поля ввода
        messageInput.value = '';
        // Ресайзим поле ввода обратно к минимальному размеру после очистки
        autoResizeTextarea.call(messageInput);
        removeAllFiles();
        
        // Отправка в LLM
        await sendToLLM();
        
        // Обновление сообщений в главном модуле
        if (window.mainPageModule && typeof window.mainPageModule.updateChatMessages === 'function') {
            window.mainPageModule.updateChatMessages(chatState.currentChatId, chatState.messages);
        } else {
            log('warn', 'mainPageModule not available for updating chat messages');
        }
        
        // Уведомление о отправке сообщения
        window.eventBus.emit('user.action.messageSent', {
            chatId: chatState.currentChatId,
            message: userMessage
        });
    }


    /**
     * Чтение содержимого файла как текста
     */
    async function readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = function(e) {
                resolve(e.target.result);
            };
            
            reader.onerror = function(e) {
                const errorMsg = `Ошибка чтения файла ${file.name}: ${e.target.error}`;
                // Отправляем нотификацию об ошибке
                window.eventBus.emit('notification.show.error', {
                    message: errorMsg,
                    duration: 5000,
                    moduleId: 'chat-module'
                });
                reject(new Error(errorMsg));
            };
            
            // Определяем тип файла для выбора метода чтения
            const fileType = window.filePreview ? window.filePreview.determineFileType(file) : 'other';
            const isTextFile = window.filePreview ? window.filePreview.isTextFile(file) : false;
            
            if (isTextFile || fileType === 'document' || fileType === 'code' || fileType === 'config') {
                // Читаем как текст
                reader.readAsText(file);
            } else if (fileType === 'image') {
                // Для изображений читаем как Data URL (base64)
                reader.readAsDataURL(file);
            } else {
                // Для других типов файлов возвращаем только метаданные
                resolve(`[Файл: ${file.name}, тип: ${file.type || 'неизвестен'}, размер: ${window.filePreview ? window.filePreview.formatFileSize(file.size) : file.size + ' байт'}]`);
            }
        });
    }

    /**
     * Подготовка сообщений для отправки в LLM с учетом файлов
     */
    async function prepareMessagesForLLM() {
        const messages = [];
        
        for (const message of chatState.messages.filter(m => !m.isLoading)) {
            let content = message.content;
            
            // Если у сообщения есть файлы, добавляем их содержимое
            if (message.files && message.files.length > 0) {
                const fileContents = [];
                
                // Если у сообщения есть сохраненные файлы, используем их
                if (message._fileObjects && message._fileObjects.length > 0) {
                    for (const file of message._fileObjects) {
                        try {
                            const fileContent = await readFileContent(file);
                            fileContents.push(`\n\n--- Содержимое файла "${file.name}" ---\n${fileContent}\n--- Конец файла "${file.name}" ---`);
                        } catch (error) {
                            log('error', 'Ошибка чтения файла:', error);
                            // Отправляем нотификацию об ошибке
                            window.eventBus.emit('notification.show.error', {
                                message: `Ошибка чтения файла "${file.name}": ${error.message}`,
                                duration: 5000,
                                moduleId: 'chat-module'
                            });
                            fileContents.push(`\n\n--- Файл "${file.name}" ---\nОшибка чтения файла: ${error.message}\n--- Конец файла ---`);
                        }
                    }
                } else {
                    // Для старых сообщений без сохраненных файлов показываем только метаданные
                    for (const fileInfo of message.files) {
                        fileContents.push(`\n\n--- Файл "${fileInfo.name}" (${fileInfo.type}, ${window.filePreview ? window.filePreview.formatFileSize(fileInfo.size) : fileInfo.size + ' байт'}) ---\n[Содержимое файла недоступно для исторических сообщений]\n--- Конец файла ---`);
                    }
                }
                
                // Добавляем содержимое файлов к тексту сообщения
                if (fileContents.length > 0) {
                    content = content + fileContents.join('');
                }
            }
            
            messages.push({
                role: message.role,
                content: content
            });
        }
        
        return messages;
    }

    /**
     * Отправка запроса к LLM
     */
    async function sendToLLM() {
        if (!chatState.settings.llm_api_url || !chatState.settings.llm_api_key) {
            addSystemMessage('Ошибка: не настроены параметры подключения к LLM');
            return;
        }
        
        chatState.isLoading = true;
        updateSendButton();
        
        // Создание сообщения ассистента
        const assistantMessage = {
            id: Date.now(),
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            isStreaming: chatState.settings.enable_llm_stream,
            isLoading: !chatState.settings.enable_llm_stream // Показываем лоадер только если стрим отключен
        };
        
        chatState.messages.push(assistantMessage);
        if (window.messageRenderer) {
            window.messageRenderer.render(chatState.messages);
        }
        
        // Запускаем анимацию лоадера если потоковая передача отключена
        let loadingInterval = null;
        if (!chatState.settings.enable_llm_stream) {
            loadingInterval = startLoadingAnimation(assistantMessage);
        }
        
        try {
            // Подготавливаем сообщения с содержимым файлов
            const messagesForLLM = await prepareMessagesForLLM();
            
            const response = await fetch(chatState.settings.llm_api_url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${chatState.settings.llm_api_key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: chatState.settings.llm_model,
                    messages: messagesForLLM,
                    stream: chatState.settings.enable_llm_stream
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            if (chatState.settings.enable_llm_stream) {
                // Обработка потокового ответа
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                
                while (true) {
                    const { done, value } = await reader.read();
                    
                    if (done) {
                        break;
                    }
                    
                    // Декодируем полученные данные
                    buffer += decoder.decode(value, { stream: true });
                    
                    // Обрабатываем строки SSE
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || ''; // Сохраняем неполную строку в буфере
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6).trim();
                            
                            // Пропускаем пустые строки и сигнал завершения
                            if (data === '' || data === '[DONE]') {
                                continue;
                            }
                            
                            try {
                                const parsed = JSON.parse(data);
                                
                                // Извлекаем содержимое из ответа
                                if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta) {
                                    const delta = parsed.choices[0].delta;
                                    
                                    if (delta.content) {
                                        // Добавляем новый контент к сообщению
                                        assistantMessage.content += delta.content;
                                        
                                        // Обновляем отображение сообщения в реальном времени
                                        if (window.messageRenderer) {
                                            window.messageRenderer.updateStreaming(assistantMessage);
                                        }
                                    }
                                }
                            } catch (parseError) {
                                log('warn', 'Ошибка парсинга SSE данных:', parseError, 'Данные:', data);
                            }
                        }
                    }
                }
                
                // Завершение потоковой передачи
                assistantMessage.isStreaming = false;
                if (window.messageRenderer) {
                    window.messageRenderer.updateStreaming(assistantMessage);
                }
            } else {
                // Обработка обычного ответа (без потоковой передачи)
                const responseData = await response.json();
                
                if (responseData.choices && responseData.choices[0] && responseData.choices[0].message) {
                    // Останавливаем анимацию лоадера
                    if (loadingInterval) {
                        clearInterval(loadingInterval);
                    }
                    
                    assistantMessage.content = responseData.choices[0].message.content;
                    assistantMessage.isLoading = false;
                } else {
                    throw new Error('Неожиданный формат ответа от LLM');
                }
                
                // Обновляем отображение сообщения
                if (window.messageRenderer) {
                    window.messageRenderer.render(chatState.messages);
                }
            }
            
            
        } catch (error) {
            log('error', 'Error sending to LLM:', error);
            
            // Останавливаем анимацию лоадера в случае ошибки
            if (loadingInterval) {
                clearInterval(loadingInterval);
            }
            
            // Отправляем нотификацию об ошибке
            window.eventBus.emit('notification.show.error', {
                message: `Ошибка при отправке запроса к LLM: ${error.message}`,
                duration: 7000,
                moduleId: 'chat-module'
            });
            
            // Удаление сообщения о загрузке/потоке
            chatState.messages = chatState.messages.filter(m => !m.isStreaming && !m.isLoading);
            
            addSystemMessage(`Ошибка при отправке запроса: ${error.message}`);
        } finally {
            chatState.isLoading = false;
            updateSendButton();
        }
    }

    /**
     * Запуск анимации лоадера для сообщения
     */
    function startLoadingAnimation(message) {
        const baseText = 'Идет генерация ответа';
        let dotCount = 0; // Начинаем с 0, чтобы первый шаг дал 1 точку
        const maxDots = 7;
        
        // Функция обновления содержимого
        const updateContent = () => {
            dotCount++;
            if (dotCount > maxDots) {
                dotCount = 1; // Сбрасываем к одной точке
            }
            
            const dots = '.'.repeat(dotCount);
            message.content = `${baseText} ${dots}`;
            
            // Добавляем отладочную информацию в консоль
            log('debug', `Loading animation: ${dotCount} dots - "${message.content}"`);
            
            if (window.messageRenderer) {
                window.messageRenderer.render(chatState.messages);
            }
        };
        
        // Устанавливаем начальный текст
        updateContent();
        
        // Запускаем интервал для анимации точек
        return setInterval(updateContent, 500); // Интервал 500мс для комфортного восприятия
    }

    /**
     * Добавление системного сообщения
     */
    function addSystemMessage(content) {
        chatState.messages.push({
            id: Date.now(),
            role: 'system',
            content: content,
            timestamp: Date.now()
        });
        if (window.messageRenderer) {
            window.messageRenderer.render(chatState.messages);
        }
    }

    /**
     * Обновление кнопки отправки
     */
    function updateSendButton() {
        const sendBtn = document.getElementById('sendBtn');
        if (chatState.isLoading) {
            sendBtn.innerHTML = '<div class="spinner-border spinner-border-sm" role="status" style="width: 0.8rem; height: 0.8rem;"></div>';
            sendBtn.disabled = true;
        } else {
            sendBtn.innerHTML = '<i class="bi bi-send"></i>';
            sendBtn.disabled = false;
        }
    }

    /**
     * Показ уведомления о том, что функционал находится в разработке
     */
    function showDevelopmentNotification(featureName) {
        // Отправляем уведомление через EventBus
        window.eventBus.emit('notification.show.info', {
            message: `Функционал "${featureName}" находится в разработке`,
            duration: 10000, // 10 секунд
            moduleId: 'chat-module'
        });
    }

    /**
     * Переключение режима поиска
     */
    function toggleSearchMode() {
        // Показываем уведомление о том, что функционал в разработке
        showDevelopmentNotification('Поиск');
    }

    /**
     * Переключение режима исследования
     */
    function toggleResearchMode() {
        // Показываем уведомление о том, что функционал в разработке
        showDevelopmentNotification('Глубокое исследование');
    }

    /**
     * Открытие выбора модели
     */
    function openModelSelection() {
        window.eventBus.emit('user.action.openModelSelection');
    }

    /**
     * Прикрепление файла
     */
    function attachFile() {
        document.getElementById('fileInput').click();
    }

    /**
     * Обработка выбора файлов
     */
    function handleFileSelection(event) {
        const files = Array.from(event.target.files);
        if (files.length > 0) {
            // Добавляем новые файлы к существующим
            chatState.selectedFiles = [...chatState.selectedFiles, ...files];
            
            // Обновляем UI с компактным превью
            updateCompactFilePreview();
        }
    }

    /**
     * Компактное превью файлов для чата
     */
    function updateCompactFilePreview() {
        const attachedFileInfo = document.getElementById('attachedFileInfo');
        
        if (chatState.selectedFiles.length === 0) {
            attachedFileInfo.classList.add('d-none');
            return;
        }
        
        let previewHTML = '<div class="alert alert-info p-2">';
        previewHTML += '<div class="d-flex justify-content-between align-items-center mb-2">';
        previewHTML += `<small class="fw-bold">Прикреплено файлов: ${chatState.selectedFiles.length}</small>`;
        previewHTML += '<button type="button" class="btn btn-sm btn-outline-danger" onclick="removeAllFiles()"><i class="bi bi-x"></i></button>';
        previewHTML += '</div>';
        
        // Компактный список файлов
        previewHTML += '<div class="d-flex flex-wrap gap-1 mb-2">';
        chatState.selectedFiles.forEach((file, index) => {
            const fileType = window.filePreview ? window.filePreview.determineFileType(file) : 'other';
            const config = window.filePreview ? window.filePreview.FILE_TYPES[fileType] : { icon: 'bi-file-earmark', color: '#6c757d' };
            const fileSize = window.filePreview ? window.filePreview.formatFileSize(file.size) : '';
            
            previewHTML += `
                <div class="badge bg-secondary text-white d-flex align-items-center gap-1 p-2 position-relative" style="max-width: 200px; cursor: pointer;" onclick="toggleFilePreview(${index})">
                    <i class="${config.icon}" style="color: ${config.color};"></i>
                    <span class="text-truncate" title="${file.name}">${file.name}</span>
                    <small class="opacity-75">${fileSize}</small>
                    <button type="button" class="btn btn-sm p-0 ms-1 text-white" onclick="event.stopPropagation(); removeFile(${index})" style="font-size: 0.7rem;">
                        <i class="bi bi-x"></i>
                    </button>
                </div>
            `;
        });
        previewHTML += '</div>';
        
        // Область для развернутого превью
        previewHTML += '<div id="expandedPreview" class="d-none"></div>';
        
        previewHTML += '</div>';
        
        attachedFileInfo.innerHTML = previewHTML;
        attachedFileInfo.classList.remove('d-none');
    }

    /**
     * Переключение развернутого превью файла
     */
    async function toggleFilePreview(index) {
        log('debug', 'toggleFilePreview called with index:', index);
        log('debug', 'selectedFiles:', chatState.selectedFiles);
        log('debug', 'window.filePreview available:', !!window.filePreview);
        
        const expandedPreview = document.getElementById('expandedPreview');
        const file = chatState.selectedFiles[index];
        
        if (!file) {
            log('error', 'File not found at index:', index);
            return;
        }
        
        if (!expandedPreview) {
            log('error', 'expandedPreview element not found');
            return;
        }
        
        if (!expandedPreview.classList.contains('d-none') && expandedPreview.dataset.currentIndex == index) {
            // Скрываем превью если тот же файл
            expandedPreview.classList.add('d-none');
            expandedPreview.dataset.currentIndex = '';
            log('debug', 'Preview hidden');
            return;
        }
        
        // Показываем превью для выбранного файла
        if (window.filePreview) {
            try {
                log('debug', 'Creating preview for file:', file.name);
                const fileType = window.filePreview ? window.filePreview.determineFileType(file) : 'other';
                const config = window.filePreview ? window.filePreview.FILE_TYPES[fileType] : { icon: 'bi-file-earmark', color: '#6c757d' };
                const fileSize = window.filePreview ? window.filePreview.formatFileSize(file.size) : '';
                const previewContentHTML = await window.filePreview.createFilePreviewContent(file);
                
                expandedPreview.innerHTML = `
                    <div class="border rounded p-2 bg-body-secondary">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <div class="d-flex align-items-center">
                                <i class="${config.icon} me-2" style="color: ${config.color};"></i>
                                <span class="fw-bold text-body me-2">${file.name}</span>
                                <span class="badge bg-secondary me-2">${fileType.toUpperCase()}</span>
                                <small class="text-muted">${fileSize}</small>
                            </div>
                            <button type="button" class="btn btn-sm btn-outline-secondary" onclick="toggleFilePreview(${index})">
                                <i class="bi bi-x"></i>
                            </button>
                        </div>
                        <div class="preview-content-only">
                            ${previewContentHTML}
                        </div>
                    </div>
                `;
                expandedPreview.classList.remove('d-none');
                expandedPreview.dataset.currentIndex = index;
                log('debug', 'Preview shown successfully');
            } catch (error) {
                log('error', 'Ошибка создания превью:', error);
                // Отправляем нотификацию об ошибке
                window.eventBus.emit('notification.show.error', {
                    message: `Ошибка создания превью файла "${file.name}": ${error.message}`,
                    duration: 5000,
                    moduleId: 'chat-module'
                });
                expandedPreview.innerHTML = `
                    <div class="alert alert-danger">
                        Ошибка создания превью: ${error.message}
                    </div>
                `;
                expandedPreview.classList.remove('d-none');
            }
        } else {
            log('error', 'window.filePreview not available');
            expandedPreview.innerHTML = `
                <div class="alert alert-warning">
                    Модуль превью файлов не загружен
                </div>
            `;
            expandedPreview.classList.remove('d-none');
        }
    }

    /**
     * Удаление конкретного файла
     */
    function removeFile(index) {
        chatState.selectedFiles.splice(index, 1);
        updateCompactFilePreview();
        
        // Очищаем input если файлов не осталось
        if (chatState.selectedFiles.length === 0) {
            document.getElementById('fileInput').value = '';
        }
    }

    /**
     * Удаление всех прикрепленных файлов
     */
    function removeAllFiles() {
        chatState.selectedFiles = [];
        document.getElementById('attachedFileInfo').classList.add('d-none');
        document.getElementById('fileInput').value = '';
    }

    // Устаревшая функция для совместимости
    function removeAttachedFile() {
        removeAllFiles();
    }

    /**
     * Обработчик клика по кнопке микрофона (вставка текста)
     */
    function handleMicrophoneClick() {
        if (window.voiceInputPlugin && window.voiceInputPlugin.isReady) {
            const btn = document.getElementById('microphoneBtn');
            window.voiceInputPlugin.startRecording(btn, 'insert');
        } else {
            // Отправляем нотификацию об ошибке
            window.eventBus.emit('notification.show.error', {
                message: 'Плагин голосового ввода не готов. Попробуйте перезагрузить страницу.',
                duration: 10000,
                moduleId: 'chat-module'
            });
        }
    }

    /**
     * Обработчик клика по кнопке микрофона с отправкой
     */
    function handleMicrophoneSendClick() {
        if (window.voiceInputPlugin && window.voiceInputPlugin.isReady) {
            const btn = document.getElementById('microphoneSendBtn');
            window.voiceInputPlugin.startRecording(btn, 'send');
        } else {
            // Отправляем нотификацию об ошибке
            window.eventBus.emit('notification.show.error', {
                message: 'Плагин голосового ввода не готов. Попробуйте перезагрузить страницу.',
                duration: 10000,
                moduleId: 'chat-module'
            });
        }
    }

    /**
     * Сжатие контекста истории чата
     */
    function compressContext() {
        // Показываем уведомление о том, что функционал в разработке
        showDevelopmentNotification('Интеллектуально сжать контекст истории чата');
    }

    /**
     * Копирование всего чата в буфер обмена
     */
    function copyChatToClipboard() {
        if (chatState.messages.length === 0) {
            alert('Чат пуст. Нечего копировать.');
            return;
        }

        const chatText = formatChatForExport();
        
        navigator.clipboard.writeText(chatText).then(() => {
            // Временное изменение иконки для обратной связи
            const btn = document.getElementById('copyChatBtn');
            const icon = btn.querySelector('i');
            const originalClass = icon.className;
            icon.className = 'bi bi-check';
            setTimeout(() => {
                icon.className = originalClass;
            }, 2000);
        }).catch(err => {
            log('error', 'Ошибка копирования в буфер обмена:', err);
            alert('Ошибка копирования в буфер обмена');
        });
    }

    /**
     * Скачивание чата в MD файл
     */
    function downloadChatToFile() {
        if (chatState.messages.length === 0) {
            alert('Чат пуст. Нечего скачивать.');
            return;
        }

        const chatText = formatChatForExport();
        const chatTitle = document.getElementById('chatTitle').textContent || 'Чат';
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `${chatTitle}_${timestamp}.md`;
        
        const blob = new Blob([chatText], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Временное изменение иконки для обратной связи
        const btn = document.getElementById('downloadChatBtn');
        const icon = btn.querySelector('i');
        const originalClass = icon.className;
        icon.className = 'bi bi-check';
        setTimeout(() => {
            icon.className = originalClass;
        }, 2000);
    }

    /**
     * Показ модального окна помощи
     */
    function showChatHelp() {
        const modal = new bootstrap.Modal(document.getElementById('chatHelpModal'));
        modal.show();
    }

    /**
     * Скачивание отдельного сообщения в MD файл
     */
    function downloadMessageToFile(messageId) {
        const message = chatState.messages.find(m => `msg_${m.id}` === messageId);
        if (!message) {
            alert('Сообщение не найдено.');
            return;
        }

        const rolePrefix = message.role === 'user' ? 'Пользователь' : 'Ассистент';
        const timestamp = new Date(message.timestamp).toLocaleString('ru-RU');
        const chatTitle = document.getElementById('chatTitle').textContent || 'Чат';
        
        let messageText = `# Сообщение из чата "${chatTitle}"\n\n`;
        messageText += `**Автор:** ${rolePrefix}\n`;
        messageText += `**Время:** ${timestamp}\n\n`;
        messageText += `---\n\n`;
        messageText += message.content;
        
        // Добавляем информацию о файлах, если они есть
        if (message.files && message.files.length > 0) {
            messageText += `\n\n---\n\n**Прикрепленные файлы:**\n`;
            message.files.forEach(file => {
                messageText += `- ${file.name} (${file.type || 'неизвестный тип'}, ${window.filePreview ? window.filePreview.formatFileSize(file.size) : file.size + ' байт'})\n`;
            });
        }
        
        const messageTimestamp = new Date(message.timestamp).toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `${rolePrefix}_сообщение_${messageTimestamp}.md`;
        
        const blob = new Blob([messageText], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Временное изменение иконки для обратной связи
        const btn = document.querySelector(`[data-message-id="${messageId}"].download-message-btn`);
        if (btn) {
            const icon = btn.querySelector('i');
            const originalClass = icon.className;
            icon.className = 'bi bi-check';
            setTimeout(() => {
                icon.className = originalClass;
            }, 2000);
        }
    }

    /**
     * Форматирование чата для экспорта
     */
    function formatChatForExport() {
        const separator = '\n\n---\n\n';
        const chatTitle = document.getElementById('chatTitle').textContent || 'Чат';
        const timestamp = new Date().toLocaleString('ru-RU');
        
        let chatText = `# ${chatTitle}\n\n*Экспортировано: ${timestamp}*\n\n`;
        
        const formattedMessages = chatState.messages
            .filter(message => !message.isLoading && message.role !== 'system')
            .map(message => {
                const rolePrefix = message.role === 'user' ? '**Пользователь:**' : '**Ассистент:**';
                let content = message.content;
                
                // Добавляем информацию о файлах, если они есть
                if (message.files && message.files.length > 0) {
                    const filesList = message.files.map(file => `- ${file.name} (${file.type || 'неизвестный тип'})`).join('\n');
                    content += `\n\n*Прикрепленные файлы:*\n${filesList}`;
                }
                
                return `${rolePrefix}\n\n${content}`;
            });
        
        chatText += formattedMessages.join(separator);
        
        return chatText;
    }

    /**
     * Переключение выпадающего списка готовых фраз
     */
    async function toggleSnippetsDropdown() {
        const dropdown = document.getElementById('snippetsDropdown');
        const snippetsBtn = document.getElementById('snippetsBtn');
        const isVisible = !dropdown.classList.contains('d-none');
        
        if (isVisible) {
            dropdown.classList.add('d-none');
        } else {
            await loadSnippets();
            
            // Позиционируем окно снипетов относительно кнопки
            if (snippetsBtn) {
                const btnRect = snippetsBtn.getBoundingClientRect();
                const chatContainer = document.getElementById('chatContainer');
                const containerRect = chatContainer.getBoundingClientRect();
                
                // Вычисляем позицию: нижний правый угол окна касается верхнего левого угла кнопки
                // Для этого нужно позиционировать окно так, чтобы его правый край был у левого края кнопки,
                // а нижний край - у верхнего края кнопки
                const right = containerRect.right - btnRect.left; // расстояние от правого края контейнера до левого края кнопки
                const bottom = containerRect.bottom - btnRect.top; // расстояние от нижнего края контейнера до верхнего края кнопки
                
                dropdown.style.right = right + 'px';
                dropdown.style.bottom = bottom + 'px';
                dropdown.style.left = 'auto'; // убираем left позиционирование
                dropdown.style.top = 'auto'; // убираем top позиционирование
            }
            
            dropdown.classList.remove('d-none');
        }
    }

    /**
     * Простой парсер YAML для снипетов
     */
    function parseYAML(yamlText) {
        const lines = yamlText.split('\n');
        const result = { snippets: [] };
        let currentSnippet = null;
        let inPrompt = false;
        let promptLines = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            
            // Пропускаем пустые строки и комментарии только если мы НЕ внутри промпта
            if (!trimmed || (!inPrompt && trimmed.startsWith('#'))) continue;
            
            // Начало нового снипета
            if (trimmed.startsWith('- name:')) {
                // Сохраняем предыдущий снипет если есть
                if (currentSnippet && currentSnippet.name) {
                    if (inPrompt && promptLines.length > 0) {
                        currentSnippet.prompt = promptLines.join('\n');
                    }
                    result.snippets.push(currentSnippet);
                }
                
                // Создаем новый снипет
                currentSnippet = {};
                inPrompt = false;
                promptLines = [];
                
                // Извлекаем имя
                const nameMatch = line.match(/- name:\s*["']?([^"']+)["']?/);
                if (nameMatch) {
                    currentSnippet.name = nameMatch[1];
                }
            }
            // Начало промпта
            else if (trimmed.startsWith('prompt:')) {
                inPrompt = true;
                promptLines = [];
                
                // Проверяем, есть ли текст на той же строке после prompt:
                const promptMatch = line.match(/prompt:\s*(.+)/);
                if (promptMatch && promptMatch[1].trim() && !promptMatch[1].includes('|') && !promptMatch[1].includes('|-')) {
                    // Если это строковое значение в кавычках, убираем кавычки
                    let promptText = promptMatch[1].trim();
                    if ((promptText.startsWith('"') && promptText.endsWith('"')) ||
                        (promptText.startsWith("'") && promptText.endsWith("'"))) {
                        promptText = promptText.slice(1, -1);
                    }
                    currentSnippet.prompt = promptText;
                    inPrompt = false; // Однострочный промпт
                }
            }
            // Содержимое многострочного промпта
            else if (inPrompt && currentSnippet) {
                // Пропускаем строки с | и |-
                if (trimmed === '|' || trimmed === '|-') continue;
                
                // Добавляем строку промпта с учетом отступов
                const indentMatch = line.match(/^(\s*)/);
                const indent = indentMatch ? indentMatch[1].length : 0;
                
                // Если строка имеет отступ больше или равен базовому (6 пробелов для содержимого промпта)
                if (indent >= 6) {
                    const contentAfterIndent = line.substring(6);
                    promptLines.push(contentAfterIndent); // Убираем базовый отступ, может быть пустой строкой
                } else if (trimmed) {
                    // Строка с содержимым но меньшим отступом
                    promptLines.push(trimmed);
                } else {
                    // Полностью пустая строка или строка только с пробелами
                    promptLines.push('');
                }
            }
        }
        
        // Сохраняем последний снипет
        if (currentSnippet && currentSnippet.name) {
            if (inPrompt && promptLines.length > 0) {
                currentSnippet.prompt = promptLines.join('\n');
            }
            result.snippets.push(currentSnippet);
        }
        
        return result;
    }

    /**
     * Загрузка готовых фраз из YAML файла
     */
    async function loadSnippets() {
        try {
            const response = await fetch('./snippets/snippets-for-chat.yaml');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const yamlText = await response.text();
            const data = parseYAML(yamlText);
            renderSnippets(data.snippets || []);
        } catch (error) {
            log('warn', 'Snippets file not found, using default phrases:', error.message);
            // Отправляем нотификацию о предупреждении
            window.eventBus.emit('notification.show.warning', {
                message: `Файл готовых фраз не найден, используются фразы по умолчанию`,
                duration: 4000,
                moduleId: 'chat-module'
            });
            // Используем базовые фразы по умолчанию
            renderSnippets(getDefaultSnippets());
        }
    }

    /**
     * Получение базовых готовых фраз по умолчанию
     */
    function getDefaultSnippets() {
        return [
            { name: "Объяснение", prompt: "Объясни подробно" },
            { name: "Примеры", prompt: "Приведи примеры" },
            { name: "Альтернативы", prompt: "Какие есть альтернативы?" },
            { name: "Показать код", prompt: "Покажи код" },
            { name: "Исправить ошибки", prompt: "Исправь ошибки" },
            { name: "Оптимизация", prompt: "Оптимизируй это" },
            { name: "Комментарии", prompt: "Добавь комментарии" },
            { name: "Перевод", prompt: "Переведи на русский" },
            { name: "Резюме", prompt: "Сделай краткое резюме" }
        ];
    }

    /**
     * Отрисовка списка готовых фраз
     */
    function renderSnippets(snippets) {
        const snippetsList = document.getElementById('snippetsList');
        
        // Сохраняем снипеты в глобальной переменной для доступа по индексу
        window.chatSnippets = snippets;
        
        snippetsList.innerHTML = snippets.map((snippet, index) => `
            <div class="snippet-item p-2 border-bottom cursor-pointer"
                 data-snippet-index="${index}"
                 title="${window.messageRenderer ? window.messageRenderer.escapeHtml(snippet.prompt.substring(0, 200) + (snippet.prompt.length > 200 ? '...' : '')) : snippet.prompt.substring(0, 200) + (snippet.prompt.length > 200 ? '...' : '')}"
                 style="cursor: pointer;">
                <small class="text-muted">${snippet.name}</small>
            </div>
        `).join('');
    }

    /**
     * Вставка выбранной фразы в поле чата
     */
    function insertSnippet(snippetText) {
        const messageInput = document.getElementById('messageInput');
        const currentValue = messageInput.value;
        
        // Добавляем фразу в поле ввода с двумя переводами строки после промпта
        if (currentValue.trim()) {
            messageInput.value = currentValue + '\n' + snippetText + '\n\n';
        } else {
            messageInput.value = snippetText + '\n\n';
        }
        
        // Автоматически изменяем размер поля ввода после вставки
        autoResizeTextarea.call(messageInput);
        
        // Скрываем выпадающий список
        document.getElementById('snippetsDropdown').classList.add('d-none');
        
        // Фокусируемся на поле ввода
        messageInput.focus();
    }

    /**
     * Переключение режима редактирования сообщения
     */
    function toggleEditMode(messageId) {
        const message = chatState.messages.find(m => `msg_${m.id}` === messageId);
        if (!message) return;
        
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`).closest('.mb-3');
        const contentElement = document.getElementById(messageId + '_content');
        
        if (messageElement.dataset.editMode === 'true') {
            // Выход из режима редактирования без сохранения
            exitEditMode(messageId, false);
        } else {
            // Вход в режим редактирования
            enterEditMode(messageId, message, messageElement, contentElement);
        }
    }
    
    /**
     * Вход в режим редактирования
     */
    function enterEditMode(messageId, message, messageElement, contentElement) {
        const isUser = message.role === 'user';
        
        // Сохраняем оригинальное содержимое
        messageElement.dataset.originalContent = message.content;
        messageElement.dataset.editMode = 'true';
        
        // Изменяем фон карточки на серый для режима редактирования и устанавливаем ширину
        const cardElement = messageElement.querySelector('.card');
        const messageContainer = messageElement.querySelector('.d-inline-block');
        if (cardElement && messageContainer) {
            // Сохраняем оригинальные классы и стили
            messageElement.dataset.originalCardClasses = cardElement.className;
            messageElement.dataset.originalContainerStyle = messageContainer.style.cssText;
            
            // Устанавливаем серый фон для всех сообщений в режиме редактирования
            cardElement.className = 'card bg-body-secondary';
            
            // Устанавливаем ширину контейнера сообщения 80% в режиме редактирования
            messageContainer.style.maxWidth = '80%';
            messageContainer.style.width = '80%';
        }
        
        // Создаем textarea для редактирования
        const textarea = document.createElement('textarea');
        textarea.className = 'form-control';
        textarea.style.resize = 'vertical';
        textarea.style.width = '100%';
        textarea.style.backgroundColor = 'transparent';
        textarea.style.border = '1px solid var(--bs-border-color)';
        textarea.value = message.content;
        textarea.id = messageId + '_editor';
        
        // Рассчитываем высоту на основе содержимого
        const lines = message.content.split('\n').length;
        const lineHeight = 20; // примерная высота строки в пикселях
        const minHeight = 200;
        const maxHeight = Math.floor(window.innerHeight * 0.5); // 50% от высоты окна
        const calculatedHeight = Math.max(minHeight, Math.min(maxHeight, lines * lineHeight + 40));
        
        textarea.style.minHeight = minHeight + 'px';
        textarea.style.height = calculatedHeight + 'px';
        textarea.style.maxHeight = maxHeight + 'px';
        
        // Заменяем содержимое на редактор
        contentElement.innerHTML = '';
        contentElement.appendChild(textarea);
        
        // Создаем кнопки управления
        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'd-flex gap-2 mt-2';
        buttonsContainer.id = messageId + '_edit_buttons';
        
        if (isUser) {
            // Кнопки для сообщения пользователя: Сохранить, Отменить, Отправить
            buttonsContainer.innerHTML = `
                <button class="btn btn-sm btn-success" onclick="saveEditedMessage('${messageId}')">
                    <i class="bi bi-check"></i> Сохранить
                </button>
                <button class="btn btn-sm btn-secondary" onclick="cancelEditMessage('${messageId}')">
                    <i class="bi bi-x"></i> Отменить
                </button>
                <button class="btn btn-sm btn-primary" onclick="resendEditedMessage('${messageId}')">
                    <i class="bi bi-send"></i> Отправить
                </button>
            `;
        } else {
            // Кнопки для сообщения ассистента: Сохранить, Отменить
            buttonsContainer.innerHTML = `
                <button class="btn btn-sm btn-success" onclick="saveEditedMessage('${messageId}')">
                    <i class="bi bi-check"></i> Сохранить
                </button>
                <button class="btn btn-sm btn-secondary" onclick="cancelEditMessage('${messageId}')">
                    <i class="bi bi-x"></i> Отменить
                </button>
            `;
        }
        
        contentElement.appendChild(buttonsContainer);
        
        // Фокусируемся на textarea
        textarea.focus();
        
        // Устанавливаем курсор в конец
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
    
    /**
     * Выход из режима редактирования
     */
    function exitEditMode(messageId, save = false) {
        const message = chatState.messages.find(m => `msg_${m.id}` === messageId);
        if (!message) return;
        
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`).closest('.mb-3');
        const contentElement = document.getElementById(messageId + '_content');
        const textarea = document.getElementById(messageId + '_editor');
        
        if (save && textarea) {
            // Сохраняем изменения
            message.content = textarea.value;
        }
        
        // Восстанавливаем обычный режим просмотра
        messageElement.dataset.editMode = 'false';
        delete messageElement.dataset.originalContent;
        
        // Восстанавливаем оригинальные классы карточки и стили контейнера
        const cardElement = messageElement.querySelector('.card');
        const messageContainer = messageElement.querySelector('.d-inline-block');
        
        if (cardElement && messageElement.dataset.originalCardClasses) {
            cardElement.className = messageElement.dataset.originalCardClasses;
            delete messageElement.dataset.originalCardClasses;
        }
        
        if (messageContainer && messageElement.dataset.originalContainerStyle !== undefined) {
            messageContainer.style.cssText = messageElement.dataset.originalContainerStyle;
            delete messageElement.dataset.originalContainerStyle;
        }
        
        // Восстанавливаем содержимое в зависимости от текущего режима
        const currentMode = messageElement.getAttribute('data-mode') || (message.role === 'user' ? 'markdown' : 'rendered');
        
        if (currentMode === 'markdown') {
            const escapedContent = window.messageRenderer ? window.messageRenderer.escapeHtml(message.content) : message.content;
            contentElement.innerHTML = `<pre style="white-space: pre-wrap; word-wrap: break-word; overflow-wrap: break-word;"><code>${escapedContent}</code></pre>`;
        } else {
            // Режим rendered - отображаем отрендеренный markdown
            const md = window.messageRenderer ? window.messageRenderer.getMarkdownInstance() : null;
            if (md) {
                contentElement.innerHTML = md.render(message.content);
                // Рендеринг плагинов после восстановления
                setTimeout(() => {
                    if (window.messageRenderer) {
                        window.messageRenderer.renderPlugins();
                    }
                }, 100);
            } else {
                if (message.role === 'user') {
                    const escapedContent = window.messageRenderer ? window.messageRenderer.escapeHtml(message.content) : message.content;
                    contentElement.innerHTML = escapedContent.replace(/\n/g, '<br>');
                } else {
                    contentElement.innerHTML = message.content;
                }
            }
        }
    }
    
    /**
     * Сохранение отредактированного сообщения
     */
    function saveEditedMessage(messageId) {
        exitEditMode(messageId, true);
        
        // Обновляем сообщения в главном модуле
        if (window.mainPageModule && typeof window.mainPageModule.updateChatMessages === 'function') {
            window.mainPageModule.updateChatMessages(chatState.currentChatId, chatState.messages);
        } else {
            log('warn', 'mainPageModule not available for updating chat messages');
        }
        
        // Уведомление о изменении сообщения
        window.eventBus.emit('user.action.messageEdited', {
            chatId: chatState.currentChatId,
            messageId: messageId
        });
    }
    
    /**
     * Отмена редактирования сообщения
     */
    function cancelEditMessage(messageId) {
        exitEditMode(messageId, false);
    }
    
    /**
     * Повторная отправка отредактированного сообщения пользователя
     */
    async function resendEditedMessage(messageId) {
        const message = chatState.messages.find(m => `msg_${m.id}` === messageId);
        if (!message || message.role !== 'user') return;
        
        const textarea = document.getElementById(messageId + '_editor');
        if (!textarea) return;
        
        // Сохраняем изменения
        message.content = textarea.value;
        
        // Выходим из режима редактирования
        exitEditMode(messageId, true);
        
        // Находим индекс текущего сообщения
        const messageIndex = chatState.messages.findIndex(m => m.id === message.id);
        if (messageIndex === -1) return;
        
        // Удаляем все сообщения после данного
        chatState.messages = chatState.messages.slice(0, messageIndex + 1);
        
        // Перерендериваем сообщения
        if (window.messageRenderer) {
            window.messageRenderer.render(chatState.messages);
        }
        
        // Отправляем в LLM
        await sendToLLM();
        
        // Обновляем сообщения в главном модуле
        if (window.mainPageModule && typeof window.mainPageModule.updateChatMessages === 'function') {
            window.mainPageModule.updateChatMessages(chatState.currentChatId, chatState.messages);
        } else {
            log('warn', 'mainPageModule not available for updating chat messages');
        }
        
        // Уведомление о повторной отправке
        window.eventBus.emit('user.action.messageResent', {
            chatId: chatState.currentChatId,
            messageId: messageId
        });
    }

    /**
     * Регенерация ответа ассистента
     */
    async function regenerateAssistantResponse(messageId) {
        const message = chatState.messages.find(m => `msg_${m.id}` === messageId);
        if (!message || message.role !== 'assistant') return;
        
        // Находим индекс текущего сообщения ассистента
        const messageIndex = chatState.messages.findIndex(m => m.id === message.id);
        if (messageIndex === -1) return;
        
        // Находим предыдущее сообщение пользователя
        let userMessageIndex = -1;
        for (let i = messageIndex - 1; i >= 0; i--) {
            if (chatState.messages[i].role === 'user') {
                userMessageIndex = i;
                break;
            }
        }
        
        if (userMessageIndex === -1) {
            addSystemMessage('Ошибка: не найдено предыдущее сообщение пользователя для регенерации');
            return;
        }
        
        // Удаляем текущий ответ ассистента и все последующие сообщения
        chatState.messages = chatState.messages.slice(0, messageIndex);
        
        // Перерендериваем сообщения
        if (window.messageRenderer) {
            window.messageRenderer.render(chatState.messages);
        }
        
        // Отправляем запрос в LLM для получения нового ответа
        await sendToLLM();
        
        // Обновляем сообщения в главном модуле
        if (window.mainPageModule && typeof window.mainPageModule.updateChatMessages === 'function') {
            window.mainPageModule.updateChatMessages(chatState.currentChatId, chatState.messages);
        } else {
            log('warn', 'mainPageModule not available for updating chat messages');
        }
        
        // Уведомление о регенерации ответа
        window.eventBus.emit('user.action.responseRegenerated', {
            chatId: chatState.currentChatId,
            messageId: messageId,
            userMessageIndex: userMessageIndex
        });
    }

    /**
     * Повторная отправка сообщения пользователя
     */
    async function resendUserMessage(messageId) {
        const message = chatState.messages.find(m => `msg_${m.id}` === messageId);
        if (!message || message.role !== 'user') return;
        
        // Находим индекс текущего сообщения пользователя
        const messageIndex = chatState.messages.findIndex(m => m.id === message.id);
        if (messageIndex === -1) return;
        
        // Удаляем все сообщения после данного сообщения пользователя
        chatState.messages = chatState.messages.slice(0, messageIndex + 1);
        
        // Перерендериваем сообщения
        if (window.messageRenderer) {
            window.messageRenderer.render(chatState.messages);
        }
        
        // Отправляем запрос в LLM для получения нового ответа
        await sendToLLM();
        
        // Обновляем сообщения в главном модуле
        if (window.mainPageModule && typeof window.mainPageModule.updateChatMessages === 'function') {
            window.mainPageModule.updateChatMessages(chatState.currentChatId, chatState.messages);
        } else {
            log('warn', 'mainPageModule not available for updating chat messages');
        }
        
        // Уведомление о повторной отправке сообщения пользователя
        window.eventBus.emit('user.action.userMessageResent', {
            chatId: chatState.currentChatId,
            messageId: messageId
        });
    }


    /**
     * Обновление стилей при изменении темы
     */
    function updateThemeStyles(theme) {
        // Обновляем highlight.js тему для подсветки кода
        const highlightTheme = document.querySelector('link[href*="highlight.js"]');
        if (highlightTheme) {
            const newThemeUrl = theme === 'dark'
                ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css'
                : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/default.min.css';
            highlightTheme.href = newThemeUrl;
        }
        
        // Перерендерим сообщения для применения новой темы
        if (chatState.messages.length > 0 && window.messageRenderer) {
            window.messageRenderer.render(chatState.messages);
        }
        
        log('debug', `Chat module theme updated to: ${theme}`);
    }

    // Делегирование событий для динамически создаваемых элементов
    document.addEventListener('click', function(e) {
        // Переключение режима просмотра сообщения
        if (e.target.closest('.view-mode-btn')) {
            const btn = e.target.closest('.view-mode-btn');
            const messageId = btn.dataset.messageId;
            const mode = btn.dataset.mode;
            const contentEl = document.getElementById(messageId + '_content');
            const message = chatState.messages.find(m => `msg_${m.id}` === messageId);
            const messageContainer = contentEl ? contentEl.closest('.mb-3') : null;
            
            if (message && contentEl && messageContainer) {
                // Обновляем атрибут data-mode
                messageContainer.setAttribute('data-mode', mode);
                
                if (mode === 'markdown') {
                    const escapedContent = window.messageRenderer ? window.messageRenderer.escapeHtml(message.content) : message.content;
                    contentEl.innerHTML = `<pre style="white-space: pre-wrap; word-wrap: break-word; overflow-wrap: break-word;"><code>${escapedContent}</code></pre>`;
                } else {
                    // Режим rendered - отображаем отрендеренный markdown
                    const md = window.messageRenderer ? window.messageRenderer.getMarkdownInstance() : null;
                    if (md) {
                        contentEl.innerHTML = md.render(message.content);
                        // Рендеринг плагинов после переключения режима
                        setTimeout(() => {
                            if (window.messageRenderer) {
                                window.messageRenderer.renderPlugins();
                            }
                        }, 100);
                    } else {
                        if (message.role === 'user') {
                            const escapedContent = window.messageRenderer ? window.messageRenderer.escapeHtml(message.content) : message.content;
                            contentEl.innerHTML = escapedContent.replace(/\n/g, '<br>');
                        } else {
                            contentEl.innerHTML = message.content;
                        }
                    }
                }
            }
        }
        
        // Копирование сообщения
        if (e.target.closest('.copy-btn')) {
            const btn = e.target.closest('.copy-btn');
            const content = btn.dataset.content;
            
            navigator.clipboard.writeText(content).then(() => {
                // Временное изменение иконки
                const icon = btn.querySelector('i');
                const originalClass = icon.className;
                icon.className = 'bi bi-check';
                setTimeout(() => {
                    icon.className = originalClass;
                }, 1000);
            });
        }
        
        // Скачивание сообщения в файл
        if (e.target.closest('.download-message-btn')) {
            const btn = e.target.closest('.download-message-btn');
            const messageId = btn.dataset.messageId;
            downloadMessageToFile(messageId);
        }
        
        // Редактирование сообщения
        if (e.target.closest('.edit-btn')) {
            const btn = e.target.closest('.edit-btn');
            const messageId = btn.dataset.messageId;
            toggleEditMode(messageId);
        }
        
        // Регенерация ответа ассистента
        if (e.target.closest('.regenerate-btn')) {
            const btn = e.target.closest('.regenerate-btn');
            const messageId = btn.dataset.messageId;
            regenerateAssistantResponse(messageId);
        }
        
        // Повторная отправка сообщения пользователя
        if (e.target.closest('.resend-user-btn')) {
            const btn = e.target.closest('.resend-user-btn');
            const messageId = btn.dataset.messageId;
            resendUserMessage(messageId);
        }
        
        // Открытие модального окна в режиме сплит
        if (e.target.closest('.split-mode-btn')) {
            const btn = e.target.closest('.split-mode-btn');
            const messageId = btn.dataset.messageId;
            openMessageModal(messageId, 'split');
        }
        
        // Открытие модального окна в полноэкранном режиме
        if (e.target.closest('.fullscreen-mode-btn')) {
            const btn = e.target.closest('.fullscreen-mode-btn');
            const messageId = btn.dataset.messageId;
            openMessageModal(messageId, 'rendered');
        }
        
        // Кнопки в модальном окне - переключение режима просмотра
        if (e.target.closest('.modal-view-btn')) {
            const btn = e.target.closest('.modal-view-btn');
            const mode = btn.dataset.mode;
            switchModalViewMode(mode);
        }
        
        // Кнопка сплит в модальном окне
        if (e.target.closest('.modal-split-btn')) {
            switchModalViewMode('split');
        }
        
        // Кнопка редактирования в модальном окне
        if (e.target.closest('.modal-edit-btn')) {
            toggleModalEditMode();
        }
        
        // Кнопка копирования в модальном окне
        if (e.target.closest('.modal-copy-btn')) {
            copyModalContent();
        }
        
        // Кнопка скачивания в модальном окне
        if (e.target.closest('.modal-download-btn')) {
            downloadModalContent();
        }
        
        // Кнопка сохранения в модальном окне
        if (e.target.closest('#modalSaveBtn')) {
            saveModalChanges();
        }
        
        // Выбор готовой фразы
        if (e.target.closest('.snippet-item')) {
            const snippetItem = e.target.closest('.snippet-item');
            const snippetIndex = parseInt(snippetItem.dataset.snippetIndex);
            
            // Получаем текст снипета по индексу из сохраненного массива
            if (window.chatSnippets && window.chatSnippets[snippetIndex]) {
                const snippetText = window.chatSnippets[snippetIndex].prompt;
                insertSnippet(snippetText);
            } else {
                log('error', 'Snippet not found at index:', snippetIndex);
            }
        }
    });

    // Закрытие выпадающего списка при клике вне его области
    document.addEventListener('click', function(e) {
        const dropdown = document.getElementById('snippetsDropdown');
        const snippetsBtn = document.getElementById('snippetsBtn');
        
        if (dropdown && !dropdown.classList.contains('d-none')) {
            if (!dropdown.contains(e.target) && !snippetsBtn.contains(e.target)) {
                dropdown.classList.add('d-none');
            }
        }
    });

    // Глобальные функции для использования в HTML
    window.removeFile = removeFile;
    window.removeAllFiles = removeAllFiles;
    window.toggleFilePreview = toggleFilePreview;
    window.saveEditedMessage = saveEditedMessage;
    window.cancelEditMessage = cancelEditMessage;
    window.resendEditedMessage = resendEditedMessage;
    window.regenerateAssistantResponse = regenerateAssistantResponse;
    window.resendUserMessage = resendUserMessage;


    // Добавление CSS стилей для индикатора печати и синхронной прокрутки
    function addStreamingStyles() {
        if (!document.getElementById('streaming-styles')) {
            const style = document.createElement('style');
            style.id = 'streaming-styles';
            style.textContent = `
                .streaming-indicator {
                    animation: pulse 1.5s ease-in-out infinite;
                }
                
                .listening-indicator {
                    animation: listening-pulse 2s ease-in-out infinite;
                    text-shadow: 0 0 8px rgba(40, 167, 69, 0.4);
                    font-weight: 700 !important;
                    color: #28a745 !important;
                }
                
                @keyframes pulse {
                    0% { opacity: 0.4; }
                    50% { opacity: 1; }
                    100% { opacity: 0.4; }
                }
                
                @keyframes listening-pulse {
                    0% {
                        opacity: 0.8;
                        transform: scale(1);
                        text-shadow: 0 0 6px rgba(40, 167, 69, 0.4);
                    }
                    50% {
                        opacity: 1;
                        transform: scale(1.02);
                        text-shadow: 0 0 10px rgba(40, 167, 69, 0.6);
                    }
                    100% {
                        opacity: 0.8;
                        transform: scale(1);
                        text-shadow: 0 0 6px rgba(40, 167, 69, 0.4);
                    }
                }
                
                /* Минимальные стили для синхронной прокрутки */
                .split-sync-scroll {
                    overflow-y: auto;
                }
                
                /* Стили для mindmap в модальном окне */
                #messageViewModal .mindmap-container {
                    height: calc(100vh - 200px);
                    min-height: 600px;
                    max-height: 80vh;
                }
                
                #messageViewModal .markmap-svg {
                    height: 100% !important;
                    min-height: 600px !important;
                }
                
                /* Стили для mindmap в обычном чате */
                .message-content .mindmap-container {
                    height: 400px;
                }
                
                .message-content .markmap-svg {
                    height: 400px !important;
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    // Добавляем стили при инициализации
    addStreamingStyles();

    /**
     * Автоматическое изменение размера textarea
     */
    function autoResizeTextarea() {
        const textarea = this;
        const chatContainer = document.getElementById('chatContainer');
        const inputContainer = textarea.closest('.input-container-wrapper');
        
        // Получаем высоту окна модуля чата
        const moduleHeight = chatContainer ? chatContainer.offsetHeight : window.innerHeight;
        const maxHeight = Math.floor(moduleHeight * 0.25); // 25% от высоты модуля
        const minHeight = 60; // Минимальная высота
        
        // Сбрасываем высоту для правильного расчета scrollHeight
        textarea.style.height = 'auto';
        
        // Вычисляем необходимую высоту
        let newHeight = textarea.scrollHeight;
        
        // Применяем ограничения
        if (newHeight < minHeight) {
            newHeight = minHeight;
        } else if (newHeight > maxHeight) {
            newHeight = maxHeight;
        }
        
        // Устанавливаем новую высоту
        textarea.style.height = newHeight + 'px';
        
        // Обновляем высоту контейнера для правильного позиционирования кнопок
        if (inputContainer) {
            inputContainer.style.minHeight = (newHeight + 16) + 'px'; // +16 для padding
        }
        
        // Если содержимое больше максимальной высоты, показываем скроллбар
        if (textarea.scrollHeight > maxHeight) {
            textarea.style.overflowY = 'auto';
        } else {
            textarea.style.overflowY = 'hidden';
        }
    }

    // Переменные для модального окна
    let currentModalMessageId = null;
    let currentModalMessage = null;
    let modalEditMode = false;
    let splitSyncScrolling = true;

    /**
     * Открытие модального окна для просмотра сообщения
     */
    function openMessageModal(messageId, mode = 'rendered') {
        const message = chatState.messages.find(m => `msg_${m.id}` === messageId);
        if (!message) return;

        currentModalMessageId = messageId;
        currentModalMessage = message;
        modalEditMode = false;

        const modal = new bootstrap.Modal(document.getElementById('messageViewModal'));
        
        // Обновляем заголовок
        const modalTitle = document.getElementById('messageViewModalLabel');
        modalTitle.innerHTML = `<i class="bi bi-eye me-2"></i>Просмотр сообщения ассистента`;

        // Переключаемся в нужный режим
        switchModalViewMode(mode);
        
        // Показываем модальное окно
        modal.show();
    }

    /**
     * Переключение режима просмотра в модальном окне
     */
    function switchModalViewMode(mode) {
        if (!currentModalMessage) return;

        const singleView = document.getElementById('modalSingleView');
        const splitView = document.getElementById('modalSplitView');
        const messageContent = document.getElementById('modalMessageContent');
        const saveBtn = document.getElementById('modalSaveBtn');

        // Обновляем активные кнопки
        document.querySelectorAll('.modal-view-btn, .modal-split-btn').forEach(btn => {
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-outline-primary');
        });

        if (mode === 'split') {
            // Показываем сплит-режим
            singleView.classList.add('d-none');
            splitView.classList.remove('d-none');
            
            const editor = document.getElementById('modalSplitEditor');
            const preview = document.getElementById('modalSplitPreview');
            
            editor.value = currentModalMessage.content;
            const md = window.messageRenderer ? window.messageRenderer.getMarkdownInstance() : null;
            if (md) {
                preview.innerHTML = md.render(currentModalMessage.content);
            } else {
                preview.innerHTML = currentModalMessage.content;
            }
            
            // Рендеринг плагинов в превью
            setTimeout(() => {
                if (window.messageRenderer) {
                    window.messageRenderer.renderPlugins();
                }
            }, 100);
            
            // Настройка синхронной прокрутки
            setupSplitSyncScrolling();
            
            // Активируем кнопку сплит
            document.querySelector('.modal-split-btn').classList.remove('btn-outline-primary');
            document.querySelector('.modal-split-btn').classList.add('btn-primary');
            
            // Показываем кнопку сохранения
            saveBtn.classList.remove('d-none');
            
        } else {
            // Показываем обычный режим
            singleView.classList.remove('d-none');
            splitView.classList.add('d-none');
            
            if (mode === 'markdown') {
                const escapedContent = window.messageRenderer ? window.messageRenderer.escapeHtml(currentModalMessage.content) : currentModalMessage.content;
                messageContent.innerHTML = `<pre><code>${escapedContent}</code></pre>`;
            } else {
                const md = window.messageRenderer ? window.messageRenderer.getMarkdownInstance() : null;
                if (md) {
                    messageContent.innerHTML = md.render(currentModalMessage.content);
                    // Рендеринг плагинов
                    setTimeout(() => {
                        if (window.messageRenderer) {
                            window.messageRenderer.renderPlugins();
                        }
                    }, 100);
                } else {
                    messageContent.innerHTML = currentModalMessage.content;
                }
            }
            
            // Активируем соответствующую кнопку
            const targetBtn = document.querySelector(`.modal-view-btn[data-mode="${mode}"]`);
            if (targetBtn) {
                targetBtn.classList.remove('btn-outline-primary');
                targetBtn.classList.add('btn-primary');
            }
            
            // Скрываем кнопку сохранения
            saveBtn.classList.add('d-none');
        }
    }

    /**
     * Настройка синхронной прокрутки для сплит-режима
     */
    function setupSplitSyncScrolling() {
        const editor = document.getElementById('modalSplitEditor');
        const preview = document.getElementById('modalSplitPreview');
        
        if (!editor || !preview) return;

        // Обработчик изменения содержимого редактора
        editor.addEventListener('input', function() {
            if (splitSyncScrolling) {
                const md = window.messageRenderer ? window.messageRenderer.getMarkdownInstance() : null;
                if (md) {
                    preview.innerHTML = md.render(editor.value);
                } else {
                    preview.innerHTML = editor.value;
                }
                // Рендеринг плагинов
                setTimeout(() => {
                    if (window.messageRenderer) {
                        window.messageRenderer.renderPlugins();
                    }
                }, 100);
            }
        });

        // Синхронизация прокрутки
        let isScrolling = false;
        
        editor.addEventListener('scroll', function() {
            if (isScrolling || !splitSyncScrolling) return;
            isScrolling = true;
            
            const scrollPercentage = editor.scrollTop / (editor.scrollHeight - editor.clientHeight);
            preview.scrollTop = scrollPercentage * (preview.scrollHeight - preview.clientHeight);
            
            setTimeout(() => { isScrolling = false; }, 10);
        });

        preview.addEventListener('scroll', function() {
            if (isScrolling || !splitSyncScrolling) return;
            isScrolling = true;
            
            const scrollPercentage = preview.scrollTop / (preview.scrollHeight - preview.clientHeight);
            editor.scrollTop = scrollPercentage * (editor.scrollHeight - editor.clientHeight);
            
            setTimeout(() => { isScrolling = false; }, 10);
        });
    }

    /**
     * Переключение режима редактирования в модальном окне
     */
    function toggleModalEditMode() {
        modalEditMode = !modalEditMode;
        const editBtn = document.querySelector('.modal-edit-btn');
        const saveBtn = document.getElementById('modalSaveBtn');
        
        if (modalEditMode) {
            editBtn.classList.remove('btn-outline-secondary');
            editBtn.classList.add('btn-secondary');
            saveBtn.classList.remove('d-none');
            
            // Переключаемся в сплит-режим для редактирования
            switchModalViewMode('split');
        } else {
            editBtn.classList.remove('btn-secondary');
            editBtn.classList.add('btn-outline-secondary');
            saveBtn.classList.add('d-none');
        }
    }

    /**
     * Копирование содержимого модального окна
     */
    function copyModalContent() {
        if (!currentModalMessage) return;
        
        navigator.clipboard.writeText(currentModalMessage.content).then(() => {
            // Временное изменение иконки
            const btn = document.querySelector('.modal-copy-btn');
            const icon = btn.querySelector('i');
            const originalClass = icon.className;
            icon.className = 'bi bi-check';
            setTimeout(() => {
                icon.className = originalClass;
            }, 1000);
        });
    }

    /**
     * Скачивание содержимого модального окна
     */
    function downloadModalContent() {
        if (!currentModalMessage) return;
        downloadMessageToFile(currentModalMessageId);
    }

    /**
     * Сохранение изменений в модальном окне
     */
    function saveModalChanges() {
        if (!currentModalMessage) return;
        
        const editor = document.getElementById('modalSplitEditor');
        if (editor) {
            // Обновляем содержимое сообщения
            currentModalMessage.content = editor.value;
            
            // Обновляем отображение в основном чате
            if (window.messageRenderer) {
                window.messageRenderer.render(chatState.messages);
            }
            
            // Обновляем сообщения в главном модуле
            if (window.mainPageModule && typeof window.mainPageModule.updateChatMessages === 'function') {
                window.mainPageModule.updateChatMessages(chatState.currentChatId, chatState.messages);
            }
            
            // Уведомление о изменении сообщения
            window.eventBus.emit('user.action.messageEdited', {
                chatId: chatState.currentChatId,
                messageId: currentModalMessageId
            });
            
            // Временное изменение иконки кнопки сохранения
            const saveBtn = document.getElementById('modalSaveBtn');
            const originalText = saveBtn.innerHTML;
            saveBtn.innerHTML = '<i class="bi bi-check"></i> Сохранено';
            setTimeout(() => {
                saveBtn.innerHTML = originalText;
            }, 2000);
        }
    }

    // Экспорт функций для использования в других модулей
    window.chatModule = {
        removeAttachedFile: removeAttachedFile,
        removeFile: removeFile,
        removeAllFiles: removeAllFiles,
        toggleFilePreview: toggleFilePreview,
        saveEditedMessage: saveEditedMessage,
        cancelEditMessage: cancelEditMessage,
        resendEditedMessage: resendEditedMessage,
        regenerateAssistantResponse: regenerateAssistantResponse,
        resendUserMessage: resendUserMessage,
        toggleEditMode: toggleEditMode,
        downloadMessageToFile: downloadMessageToFile,
        chatState: chatState,
        autoResizeTextarea: autoResizeTextarea,
        openMessageModal: openMessageModal,
        switchModalViewMode: switchModalViewMode,
        toggleModalEditMode: toggleModalEditMode,
        copyModalContent: copyModalContent,
        downloadModalContent: downloadModalContent,
        saveModalChanges: saveModalChanges,
        // Ссылка на модуль улучшения для обратной совместимости
        get enhancementModule() {
            return window.enhancementModule;
        }
    };

})();