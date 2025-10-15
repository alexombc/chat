/**
 * Основной скрипт страницы для управления чатами и настройками
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

    // Состояние приложения (минимальное, основная логика перенесена в модули)
    const appState = {
        initialized: false
    };

    // Инициализация при загрузке DOM
    document.addEventListener('DOMContentLoaded', function() {
        initializeApp();
        setupEventBusListeners();
        
        // Уведомляем о готовности главной страницы
        window.eventBus.emit('module.main-page.ready', {
            timestamp: Date.now(),
            moduleId: 'main-page'
        });
    });

    /**
     * Инициализация приложения
     */
    function initializeApp() {
        appState.initialized = true;
        log('debug', 'Main page initialized');
    }

    /**
     * Настройка слушателей EventBus
     */
    function setupEventBusListeners() {
        // Запрос на открытие модального окна выбора модели теперь обрабатывается в llm_selector.js
        
        // Слушаем события от модулей сайдбара
        window.eventBus.on('module.sidebar-header.ready', () => {
            log('debug', 'Sidebar header ready');
        });
        
        window.eventBus.on('module.sidebar-footer.ready', () => {
            log('debug', 'Sidebar footer ready');
        });
        
        window.eventBus.on('module.sidebar-chats.ready', () => {
            log('debug', 'Sidebar chats ready');
        });
        
        // Настройка обработчика для кнопки применения модели теперь в llm_selector.js
    }


    // Функционал выбора модели LLM перенесен в модуль llm_selector.js
    // Функционал изменения темы перенесен в модуль sidebar/footer.js

    // Экспорт функций для использования в других модулях
    window.mainPageModule = {
        isInitialized: () => appState.initialized,
        // Заглушки для совместимости с chat-module
        getCurrentChat: () => {
            // Делегируем к модулю чатов, если он доступен
            if (window.sidebarChatsModule) {
                return window.sidebarChatsModule.getCurrentChat();
            }
            return null;
        },
        updateChatMessages: (chatId, messages) => {
            // Делегируем к модулю чатов, если он доступен
            if (window.sidebarChatsModule && window.sidebarChatsModule.updateChatMessages) {
                window.sidebarChatsModule.updateChatMessages(chatId, messages);
            } else {
                log('debug', 'updateChatMessages called, but sidebar chats module not available');
            }
        }
    };

})();