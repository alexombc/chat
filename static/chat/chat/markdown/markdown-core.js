/**
 * Ядро системы markdown-it с поддержкой плагинов
 * Обеспечивает централизованное управление markdown-it и плагинами
 */
(function() {
    'use strict';

    // Уровень логирования модуля
    const LOG_LEVEL = 'warn';

    // Функция логирования с проверкой уровня
    function log(level, message, ...args) {
        const levels = { debug: 0, warn: 1, error: 2 };
        if (levels[level] >= levels[LOG_LEVEL]) {
            console[level](`[markdown-core] ${message}`, ...args);
        }
    }

    // Состояние ядра
    const coreState = {
        markdownInstance: null,
        plugins: new Map(),
        initialized: false,
        baseConfig: {
            html: true,
            linkify: true,
            typographer: true,
            highlight: function (str, lang) {
                if (lang && window.hljs && window.hljs.getLanguage(lang)) {
                    try {
                        return window.hljs.highlight(str, { language: lang }).value;
                    } catch (__) {}
                }
                return '';
            }
        }
    };

    /**
     * Проверка доступности зависимостей
     */
    function checkDependencies() {
        if (!window.markdownit) {
            log('error', 'markdown-it library is required');
            return false;
        }
        
        if (!window.eventBus) {
            log('error', 'EventBus is required for markdown-core');
            return false;
        }
        
        if (!window.hljs) {
            log('warn', 'highlight.js not available - code highlighting will be disabled');
        }
        
        return true;
    }

    /**
     * Инициализация ядра markdown-it
     */
    function initialize() {
        if (!checkDependencies()) {
            return false;
        }

        try {
            // Создаем экземпляр markdown-it с базовой конфигурацией
            coreState.markdownInstance = window.markdownit(coreState.baseConfig);
            
            // Применяем все зарегистрированные плагины
            applyRegisteredPlugins();
            
            coreState.initialized = true;
            
            log('debug', 'Markdown core initialized successfully');
            
            // Уведомляем о готовности ядра
            window.eventBus.emit('module.markdown-core.ready', {
                timestamp: Date.now(),
                moduleId: 'markdown-core',
                pluginsCount: coreState.plugins.size
            });
            
            return true;
        } catch (error) {
            log('error', 'Failed to initialize markdown core:', error);
            return false;
        }
    }

    /**
     * Регистрация плагина
     */
    function registerPlugin(name, plugin, config = {}) {
        if (!name || typeof name !== 'string') {
            log('error', 'Plugin name must be a non-empty string');
            return false;
        }

        if (!plugin || typeof plugin !== 'function') {
            log('error', 'Plugin must be a function');
            return false;
        }

        // Сохраняем плагин в реестре
        coreState.plugins.set(name, {
            plugin: plugin,
            config: config,
            registered: Date.now()
        });

        log('debug', `Plugin "${name}" registered successfully`);

        // Если ядро уже инициализировано, переинициализируем с новым плагином
        if (coreState.initialized) {
            reinitialize();
        }

        // Уведомляем о регистрации плагина
        window.eventBus.emit('module.markdown-core.plugin-registered', {
            timestamp: Date.now(),
            moduleId: 'markdown-core',
            pluginName: name,
            config: config
        });

        return true;
    }

    /**
     * Применение всех зарегистрированных плагинов
     */
    function applyRegisteredPlugins() {
        if (!coreState.markdownInstance) {
            log('error', 'Markdown instance not available');
            return;
        }

        for (const [name, pluginData] of coreState.plugins) {
            try {
                log('debug', `Applying plugin: ${name}`);
                coreState.markdownInstance.use(pluginData.plugin, pluginData.config);
            } catch (error) {
                log('error', `Failed to apply plugin "${name}":`, error);
            }
        }

        log('debug', `Applied ${coreState.plugins.size} plugins`);
    }

    /**
     * Переинициализация ядра с применением всех плагинов
     */
    function reinitialize() {
        log('debug', 'Reinitializing markdown core');
        
        try {
            // Создаем новый экземпляр markdown-it
            coreState.markdownInstance = window.markdownit(coreState.baseConfig);
            
            // Применяем все плагины
            applyRegisteredPlugins();
            
            log('debug', 'Markdown core reinitialized successfully');
            
            // Уведомляем о переинициализации
            window.eventBus.emit('module.markdown-core.reinitialized', {
                timestamp: Date.now(),
                moduleId: 'markdown-core',
                pluginsCount: coreState.plugins.size
            });
            
            return true;
        } catch (error) {
            log('error', 'Failed to reinitialize markdown core:', error);
            return false;
        }
    }

    /**
     * Получение экземпляра markdown-it
     */
    function getInstance() {
        if (!coreState.initialized) {
            log('warn', 'Markdown core not initialized, attempting to initialize');
            if (!initialize()) {
                return null;
            }
        }
        return coreState.markdownInstance;
    }

    /**
     * Рендеринг markdown с передачей environment для плагинов
     */
    function render(content, env = {}) {
        const instance = getInstance();
        if (!instance) {
            log('error', 'Cannot render: markdown instance not available');
            return content;
        }

        // Логируем информацию о стриминге для отладки
        if (env.isStreaming !== undefined) {
            log('debug', `Rendering content (streaming: ${env.isStreaming}), length: ${content.length}`);
        }

        return instance.render(content, env);
    }

    /**
     * Получение списка зарегистрированных плагинов
     */
    function getPlugins() {
        const plugins = {};
        for (const [name, pluginData] of coreState.plugins) {
            plugins[name] = {
                config: pluginData.config,
                registered: pluginData.registered
            };
        }
        return plugins;
    }

    /**
     * Удаление плагина
     */
    function unregisterPlugin(name) {
        if (!coreState.plugins.has(name)) {
            log('warn', `Plugin "${name}" not found`);
            return false;
        }

        coreState.plugins.delete(name);
        log('debug', `Plugin "${name}" unregistered`);

        // Переинициализируем без удаленного плагина
        if (coreState.initialized) {
            reinitialize();
        }

        return true;
    }

    /**
     * Получение информации о состоянии ядра
     */
    function getStatus() {
        return {
            initialized: coreState.initialized,
            pluginsCount: coreState.plugins.size,
            plugins: Array.from(coreState.plugins.keys()),
            hasMarkdownIt: !!window.markdownit,
            hasHighlightJs: !!window.hljs,
            hasEventBus: !!window.eventBus
        };
    }

    // Инициализация при загрузке DOM
    document.addEventListener('DOMContentLoaded', function() {
        log('debug', 'DOM loaded, initializing markdown core');
        initialize();
    });

    // Публичный API
    window.markdownCore = {
        // Основные функции
        initialize: initialize,
        reinitialize: reinitialize,
        getInstance: getInstance,
        render: render,
        
        // Управление плагинами
        registerPlugin: registerPlugin,
        unregisterPlugin: unregisterPlugin,
        getPlugins: getPlugins,
        
        // Информация о состоянии
        getStatus: getStatus,
        
        // Проверка готовности
        get isReady() {
            return coreState.initialized;
        },
        
        // Доступ к базовой конфигурации (только для чтения)
        get baseConfig() {
            return { ...coreState.baseConfig };
        }
    };

    log('debug', 'Markdown core module loaded');

})();