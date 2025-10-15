/**
 * Модуль настроек чата (IIFE) с поддержкой FormIO и интеграцией с EventBus
 */
(function() {
    'use strict';

    // Уровень логирования модуля
    const LOG_LEVEL = 'warn';

    // Функция логирования с проверкой уровня
    function log(level, message, ...args) {
        const levels = { debug: 0, warn: 1, error: 2 };
        if (levels[level] >= levels[LOG_LEVEL]) {
            console[level](message, ...args);
        }
    }

    // Состояние модуля настроек
    const settingsState = {
        settings: {
            llm_api_url: "https://openrouter.ai/api/v1/chat/completions",
            llm_api_key: "",
            llm_model: "openai/gpt-4.1",
            enable_llm_stream: true,
            enhance: "Сгенерируй улучшенную версию этого промта (в ответе пришли только улучшенный промт — без пояснений, вводных фраз, маркеров списка, заполнителей или обрамляющих кавычек):\n${messageInput}"
        },
        formSchema: null,
        defaultSettings: null,
        formInstance: null,
        isLoading: false,
        modal: null
    };

    // Константы
    const STORAGE_KEY = 'chatApp_settings';
    const SCHEMA_URL = './settings/chat-settings-scheme.json';
    const DEFAULT_SETTINGS_URL = './settings/chat-settings-data-default.json';

    // Инициализация при загрузке DOM
    document.addEventListener('DOMContentLoaded', function() {
        initializeSettingsModule();
        setupEventBusListeners();
        loadSettings();
        
        // Уведомляем о готовности модуля настроек
        window.eventBus.emit('module.chat-settings.ready', {
            timestamp: Date.now(),
            moduleId: 'chat-settings'
        });
    });

    /**
     * Инициализация модуля настроек
     */
    function initializeSettingsModule() {
        log('debug', 'Chat settings module initialized');
    }

    /**
     * Настройка слушателей EventBus
     */
    function setupEventBusListeners() {
        // Запросы всех настроек
        window.eventBus.on('globalVars.chat-settings.get', () => {
            window.eventBus.emit('globalVars.chat-settings.value', settingsState.settings);
        });

        // Обновление настроек
        window.eventBus.on('globalVars.chat-settings.update', (newSettings) => {
            updateSettings(newSettings);
        });

        // Запросы конкретных настроек
        window.eventBus.on('globalVars.llm_api_url.get', () => {
            window.eventBus.emit('globalVars.llm_api_url.value', settingsState.settings.llm_api_url);
        });

        window.eventBus.on('globalVars.llm_api_key.get', () => {
            window.eventBus.emit('globalVars.llm_api_key.value', settingsState.settings.llm_api_key);
        });

        window.eventBus.on('globalVars.llm_model.get', () => {
            window.eventBus.emit('globalVars.llm_model.value', settingsState.settings.llm_model);
        });

        window.eventBus.on('globalVars.enhance.get', () => {
            window.eventBus.emit('globalVars.enhance.value', settingsState.settings.enhance);
        });

        window.eventBus.on('globalVars.enable_llm_stream.get', () => {
            window.eventBus.emit('globalVars.enable_llm_stream.value', settingsState.settings.enable_llm_stream);
        });

        // Обновление конкретных настроек
        window.eventBus.on('globalVars.llm_api_url.update', (value) => {
            settingsState.settings.llm_api_url = value;
            saveSettings();
            window.eventBus.emit('globalVars.llm_api_url.value', value);
        });

        window.eventBus.on('globalVars.llm_api_key.update', (value) => {
            settingsState.settings.llm_api_key = value;
            saveSettings();
            window.eventBus.emit('globalVars.llm_api_key.value', value);
        });

        window.eventBus.on('globalVars.llm_model.update', (value) => {
            settingsState.settings.llm_model = value;
            saveSettings();
            window.eventBus.emit('globalVars.llm_model.value', value);
        });

        window.eventBus.on('globalVars.enhance.update', (value) => {
            settingsState.settings.enhance = value;
            saveSettings();
            window.eventBus.emit('globalVars.enhance.value', value);
        });

        window.eventBus.on('globalVars.enable_llm_stream.update', (value) => {
            settingsState.settings.enable_llm_stream = value;
            saveSettings();
            window.eventBus.emit('globalVars.enable_llm_stream.value', value);
        });

        // Запрос на открытие настроек
        window.eventBus.on('user.action.openSettings', () => {
            openSettingsModal();
        });
    }

    /**
     * Загрузка настроек из localStorage или дефолтных значений
     */
    async function loadSettings() {
        try {
            // Сначала пытаемся загрузить из localStorage
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsedSettings = JSON.parse(saved);
                settingsState.settings = { ...settingsState.settings, ...parsedSettings };
                log('debug', 'Settings loaded from localStorage:', settingsState.settings);
                
                // Уведомляем об изменении настроек
                notifySettingsChanged();
                return;
            }

            // Если в localStorage нет настроек, загружаем дефолтные
            await loadDefaultSettings();
            
        } catch (error) {
            log('error', 'Error loading settings:', error);
            window.eventBus.emit('notification.show.error', {
                message: `Ошибка загрузки настроек: ${error.message}`,
                duration: 5000,
                moduleId: 'chat-settings'
            });
            
            // В случае ошибки используем встроенные дефолтные значения
            await loadDefaultSettings();
        }
    }

    /**
     * Загрузка дефолтных настроек из файла
     */
    async function loadDefaultSettings() {
        try {
            const response = await fetch(DEFAULT_SETTINGS_URL);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const defaultSettings = await response.json();
            settingsState.defaultSettings = defaultSettings;
            settingsState.settings = { ...settingsState.settings, ...defaultSettings };
            
            log('debug', 'Default settings loaded:', defaultSettings);
            
            // Сохраняем дефолтные настройки в localStorage
            saveSettings();
            
        } catch (error) {
            log('warn', 'Could not load default settings file, using built-in defaults:', error);
            window.eventBus.emit('notification.show.warning', {
                message: 'Файл дефолтных настроек не найден, используются встроенные значения',
                duration: 4000,
                moduleId: 'chat-settings'
            });
            
            // Используем встроенные дефолтные значения
            settingsState.defaultSettings = {
                llm_api_url: "https://openrouter.ai/api/v1/chat/completions",
                llm_api_key: "",
                llm_model: "openai/gpt-4.1",
                enable_llm_stream: true,
                enhance: "Сгенерируй улучшенную версию этого промта (в ответе пришли только улучшенный промт — без пояснений, вводных фраз, маркеров списка, заполнителей или обрамляющих кавычек):\n${messageInput}"
            };
            
            saveSettings();
        }
        
        // Уведомляем об изменении настроек
        notifySettingsChanged();
    }

    /**
     * Сохранение настроек в localStorage
     */
    function saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settingsState.settings));
            log('debug', 'Settings saved to localStorage:', settingsState.settings);
        } catch (error) {
            log('error', 'Error saving settings to localStorage:', error);
            window.eventBus.emit('notification.show.error', {
                message: `Ошибка сохранения настроек: ${error.message}`,
                duration: 5000,
                moduleId: 'chat-settings'
            });
        }
    }

    /**
     * Обновление настроек
     */
    function updateSettings(newSettings) {
        settingsState.settings = { ...settingsState.settings, ...newSettings };
        saveSettings();
        notifySettingsChanged();
    }

    /**
     * Уведомление об изменении настроек
     */
    function notifySettingsChanged() {
        // Уведомляем о изменении всех настроек
        window.eventBus.emit('globalVars.chat-settings.changed', settingsState.settings);
        
        // Уведомляем о изменении конкретных настроек
        window.eventBus.emit('globalVars.llm_api_url.changed', settingsState.settings.llm_api_url);
        window.eventBus.emit('globalVars.llm_api_key.changed', settingsState.settings.llm_api_key);
        window.eventBus.emit('globalVars.llm_model.changed', settingsState.settings.llm_model);
        window.eventBus.emit('globalVars.enable_llm_stream.changed', settingsState.settings.enable_llm_stream);
        window.eventBus.emit('globalVars.enhance.changed', settingsState.settings.enhance);
    }

    /**
     * Загрузка схемы формы FormIO
     */
    async function loadFormSchema() {
        try {
            const response = await fetch(SCHEMA_URL);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            settingsState.formSchema = await response.json();
            log('debug', 'Form schema loaded:', settingsState.formSchema);
            
        } catch (error) {
            log('error', 'Error loading form schema:', error);
            window.eventBus.emit('notification.show.error', {
                message: `Ошибка загрузки схемы формы: ${error.message}`,
                duration: 5000,
                moduleId: 'chat-settings'
            });
            throw error;
        }
    }

    /**
     * Открытие модального окна настроек
     */
    async function openSettingsModal() {
        try {
            // Проверяем наличие FormIO
            if (typeof Formio === 'undefined') {
                throw new Error('FormIO не загружен. Убедитесь, что библиотека подключена.');
            }

            // Загружаем схему формы если еще не загружена
            if (!settingsState.formSchema) {
                await loadFormSchema();
            }

            // Создаем модальное окно если еще не создано
            if (!settingsState.modal) {
                createSettingsModal();
            }

            // Создаем форму FormIO
            await createFormIOInstance();

            // Показываем модальное окно
            settingsState.modal.show();

        } catch (error) {
            log('error', 'Error opening settings modal:', error);
            window.eventBus.emit('notification.show.error', {
                message: `Ошибка открытия настроек: ${error.message}`,
                duration: 5000,
                moduleId: 'chat-settings'
            });
        }
    }

    /**
     * Создание модального окна настроек
     */
    function createSettingsModal() {
        // Создаем HTML модального окна
        const modalHTML = `
            <div class="modal fade" id="chatSettingsModal" tabindex="-1" aria-labelledby="chatSettingsModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="chatSettingsModalLabel">
                                <i class="bi bi-gear me-2"></i>
                                Настройки чата
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть"></button>
                        </div>
                        <div class="modal-body">
                            <!-- Кнопки управления -->
                            <div class="d-flex justify-content-between mb-3">
                                <!-- Кнопка сброса по левому краю -->
                                <button type="button" class="btn btn-outline-warning" id="resetToDefaultBtn">
                                    <i class="bi bi-arrow-clockwise me-1"></i>
                                    Сбросить к умолчанию
                                </button>
                                
                                <!-- Кнопки отмены и сохранения по правому краю -->
                                <div class="d-flex gap-2">
                                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                        <i class="bi bi-x-lg me-1"></i>
                                        Отмена
                                    </button>
                                    <button type="button" class="btn btn-success" id="saveSettingsBtn">
                                        <i class="bi bi-check-lg me-1"></i>
                                        Сохранить
                                    </button>
                                </div>
                            </div>
                            
                            <!-- Индикатор загрузки -->
                            <div id="settingsLoadingIndicator" class="text-center d-none">
                                <div class="spinner-border text-primary" role="status">
                                    <span class="visually-hidden">Сохранение...</span>
                                </div>
                                <p class="mt-2 text-muted">Сохранение настроек...</p>
                            </div>
                            
                            <!-- Контейнер для формы FormIO -->
                            <div id="settingsFormContainer">
                                <!-- Форма будет создана здесь -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Добавляем модальное окно в DOM
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Инициализируем Bootstrap модальное окно
        const modalElement = document.getElementById('chatSettingsModal');
        settingsState.modal = new bootstrap.Modal(modalElement);

        // Настраиваем обработчики событий
        setupModalEventListeners();
    }

    /**
     * Настройка обработчиков событий модального окна
     */
    function setupModalEventListeners() {
        // Кнопка сохранения
        document.getElementById('saveSettingsBtn').addEventListener('click', saveSettingsFromForm);

        // Кнопка сброса к умолчанию
        document.getElementById('resetToDefaultBtn').addEventListener('click', resetToDefault);

        // Обработчик закрытия модального окна
        document.getElementById('chatSettingsModal').addEventListener('hidden.bs.modal', () => {
            // Очищаем форму при закрытии
            if (settingsState.formInstance) {
                settingsState.formInstance.destroy();
                settingsState.formInstance = null;
            }
        });
    }

    /**
     * Создание экземпляра формы FormIO
     */
    async function createFormIOInstance() {
        try {
            const formContainer = document.getElementById('settingsFormContainer');
            
            // Очищаем контейнер
            formContainer.innerHTML = '';

            // Создаем форму FormIO
            settingsState.formInstance = await Formio.createForm(formContainer, settingsState.formSchema, {
                readOnly: false,
                noAlerts: true,
                buttonSettings: {
                    show: false // Скрываем стандартную кнопку отправки
                }
            });

            // Заполняем форму текущими настройками
            settingsState.formInstance.submission = {
                data: { ...settingsState.settings }
            };

            log('debug', 'FormIO instance created and populated with settings');

        } catch (error) {
            log('error', 'Error creating FormIO instance:', error);
            window.eventBus.emit('notification.show.error', {
                message: `Ошибка создания формы: ${error.message}`,
                duration: 5000,
                moduleId: 'chat-settings'
            });
            throw error;
        }
    }

    /**
     * Сохранение настроек из формы
     */
    async function saveSettingsFromForm() {
        try {
            if (!settingsState.formInstance) {
                throw new Error('Форма не инициализирована');
            }

            // Показываем индикатор загрузки
            showLoadingIndicator(true);

            // Проверяем валидность формы
            const isValid = await settingsState.formInstance.checkValidity();
            if (!isValid) {
                throw new Error('Форма содержит ошибки валидации');
            }

            // Получаем данные из формы
            const formData = settingsState.formInstance.submission.data;
            
            // Обновляем настройки
            updateSettings(formData);

            // Показываем уведомление об успешном сохранении
            window.eventBus.emit('notification.show.success', {
                message: 'Настройки успешно сохранены',
                duration: 3000,
                moduleId: 'chat-settings'
            });

            // Закрываем модальное окно
            settingsState.modal.hide();

        } catch (error) {
            log('error', 'Error saving settings from form:', error);
            window.eventBus.emit('notification.show.error', {
                message: `Ошибка сохранения настроек: ${error.message}`,
                duration: 5000,
                moduleId: 'chat-settings'
            });
        } finally {
            // Скрываем индикатор загрузки
            showLoadingIndicator(false);
        }
    }

    /**
     * Сброс настроек к умолчанию
     */
    async function resetToDefault() {
        try {
            if (!settingsState.defaultSettings) {
                await loadDefaultSettings();
            }

            // Обновляем настройки дефолтными значениями
            updateSettings(settingsState.defaultSettings);

            // Обновляем форму
            if (settingsState.formInstance) {
                settingsState.formInstance.submission = {
                    data: { ...settingsState.settings }
                };
            }

            // Показываем уведомление
            window.eventBus.emit('notification.show.info', {
                message: 'Настройки сброшены к значениям по умолчанию',
                duration: 3000,
                moduleId: 'chat-settings'
            });

        } catch (error) {
            log('error', 'Error resetting to default settings:', error);
            window.eventBus.emit('notification.show.error', {
                message: `Ошибка сброса настроек: ${error.message}`,
                duration: 5000,
                moduleId: 'chat-settings'
            });
        }
    }

    /**
     * Показ/скрытие индикатора загрузки
     */
    function showLoadingIndicator(show) {
        const indicator = document.getElementById('settingsLoadingIndicator');
        const formContainer = document.getElementById('settingsFormContainer');
        const saveBtn = document.getElementById('saveSettingsBtn');

        if (show) {
            indicator.classList.remove('d-none');
            formContainer.style.opacity = '0.5';
            saveBtn.disabled = true;
            settingsState.isLoading = true;
        } else {
            indicator.classList.add('d-none');
            formContainer.style.opacity = '1';
            saveBtn.disabled = false;
            settingsState.isLoading = false;
        }
    }

    // Экспорт функций для использования в других модулях
    window.chatSettingsModule = {
        openSettingsModal: openSettingsModal,
        getSettings: () => ({ ...settingsState.settings }),
        updateSettings: updateSettings,
        resetToDefault: resetToDefault,
        saveSettings: saveSettings,
        loadSettings: loadSettings
    };

})();