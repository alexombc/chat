/**
 * Главный координатор сайдбара (IIFE) - управляет взаимодействием всех модулей сайдбара
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

    // Состояние координатора
    const coordinatorState = {
        initialized: false,
        readyModules: new Set(),
        currentModule: null,
        moduleLoadQueue: []
    };

    // Список ожидаемых модулей
    const EXPECTED_MODULES = [
        'sidebar-header',
        'sidebar-footer',
        'sidebar-breadcrumbs',
        'sidebar-chats',
        'sidebar-context',
        'sidebar-resize',
        'sidebar-coordinator'
    ];

    // Инициализация при загрузке DOM
    document.addEventListener('DOMContentLoaded', function() {
        initializeCoordinator();
        setupEventBusListeners();
        
        // Уведомляем о готовности координатора
        window.eventBus.emit('module.sidebar-coordinator.ready', {
            timestamp: Date.now(),
            moduleId: 'sidebar-coordinator'
        });
        
        // Проверяем готовность через небольшую задержку, чтобы дать время другим модулям
        setTimeout(() => {
            checkModulesReady();
        }, 200);
    });

    /**
     * Инициализация координатора
     */
    function initializeCoordinator() {
        coordinatorState.initialized = true;
        
        // Ждем готовности всех модулей
        checkModulesReady();
        
        log('debug', 'Sidebar coordinator initialized');
    }

    /**
     * Настройка слушателей EventBus
     */
    function setupEventBusListeners() {
        // Слушаем готовность модулей
        EXPECTED_MODULES.forEach(moduleId => {
            window.eventBus.on(`module.${moduleId}.ready`, (data) => {
                log('debug', `Received ready event for module: ${moduleId}`, data);
                handleModuleReady(moduleId);
            });
        });

        // Слушаем команды загрузки модулей в sidebar-body
        window.eventBus.on('sidebar.module.load', (data) => {
            loadModuleInSidebarBody(data.module);
        });

        // Слушаем события активации закладок
        window.eventBus.on('sidebar.tab.chats.activate', () => {
            loadModuleInSidebarBody('chats');
        });

        window.eventBus.on('sidebar.tab.context.activate', () => {
            loadModuleInSidebarBody('context');
        });

        // Слушаем события изменения размера
        window.eventBus.on('sidebar.resize.update', (data) => {
            handleSidebarResize(data);
        });

        // Слушаем события хлебных крошек
        window.eventBus.on('sidebar.breadcrumbs.click', (data) => {
            handleBreadcrumbClick(data);
        });
    }

    /**
     * Обработка готовности модуля
     */
    function handleModuleReady(moduleId) {
        coordinatorState.readyModules.add(moduleId);
        log('debug', `Module ready: ${moduleId}`);
        
        // Проверяем, готовы ли все модули
        checkModulesReady();
    }

    /**
     * Проверка готовности всех модулей
     */
    function checkModulesReady() {
        // Проверяем как события готовности, так и наличие глобальных объектов модулей
        const moduleChecks = {
            'sidebar-header': () => coordinatorState.readyModules.has('sidebar-header') || window.sidebarHeaderModule,
            'sidebar-footer': () => coordinatorState.readyModules.has('sidebar-footer') || window.sidebarFooterModule,
            'sidebar-breadcrumbs': () => coordinatorState.readyModules.has('sidebar-breadcrumbs') || window.sidebarBreadcrumbsModule,
            'sidebar-chats': () => coordinatorState.readyModules.has('sidebar-chats') || window.sidebarChatsModule,
            'sidebar-context': () => coordinatorState.readyModules.has('sidebar-context') || window.sidebarContextModule,
            'sidebar-resize': () => coordinatorState.readyModules.has('sidebar-resize') || window.sidebarResizeModule,
            'sidebar-coordinator': () => coordinatorState.readyModules.has('sidebar-coordinator')
        };

        const readyModules = [];
        const notReadyModules = [];
        
        EXPECTED_MODULES.forEach(moduleId => {
            if (moduleChecks[moduleId] && moduleChecks[moduleId]()) {
                readyModules.push(moduleId);
                // Добавляем в набор готовых модулей, если еще не добавлен
                coordinatorState.readyModules.add(moduleId);
            } else {
                notReadyModules.push(moduleId);
            }
        });

        const allReady = notReadyModules.length === 0;

        log('debug', `Modules ready check: ${readyModules.length}/${EXPECTED_MODULES.length}`,
            { ready: readyModules, notReady: notReadyModules });

        if (allReady && coordinatorState.initialized) {
            initializeSidebar();
        }
    }

    /**
     * Инициализация сайдбара после готовности всех модулей
     */
    function initializeSidebar() {
        log('debug', 'All sidebar modules ready, initializing sidebar');
        
        // Активируем закладку "Чаты" по умолчанию
        window.eventBus.emit('sidebar.tab.chats.activate');
        
        // Отправляем событие о готовности всего сайдбара
        window.eventBus.emit('sidebar.ready', {
            timestamp: Date.now(),
            readyModules: Array.from(coordinatorState.readyModules)
        });
    }

    /**
     * Загрузка модуля в sidebar-body
     */
    function loadModuleInSidebarBody(moduleName) {
        if (coordinatorState.currentModule === moduleName) {
            log('debug', `Module ${moduleName} already loaded`);
            return;
        }

        // Проверяем, готов ли модуль (проверяем и по событиям, и по наличию глобального объекта)
        const moduleId = `sidebar-${moduleName}`;
        const isModuleReady = coordinatorState.readyModules.has(moduleId) ||
                             (moduleName === 'chats' && window.sidebarChatsModule) ||
                             (moduleName === 'context' && window.sidebarContextModule);

        if (!isModuleReady) {
            log('warn', `Module ${moduleId} not ready yet, queuing load request`);
            coordinatorState.moduleLoadQueue.push(moduleName);
            
            // Попробуем загрузить через небольшую задержку
            setTimeout(() => {
                if (coordinatorState.moduleLoadQueue.includes(moduleName)) {
                    coordinatorState.moduleLoadQueue = coordinatorState.moduleLoadQueue.filter(m => m !== moduleName);
                    loadModuleInSidebarBody(moduleName);
                }
            }, 100);
            return;
        }

        coordinatorState.currentModule = moduleName;
        
        // Отправляем событие загрузки модуля
        window.eventBus.emit('sidebar.module.load', {
            module: moduleName,
            timestamp: Date.now()
        });

        // Обновляем хлебные крошки в зависимости от модуля
        updateBreadcrumbsForModule(moduleName);

        log('debug', `Module loaded in sidebar-body: ${moduleName}`);
    }

    /**
     * Обновление хлебных крошек для модуля
     */
    function updateBreadcrumbsForModule(moduleName) {
        const breadcrumbsMap = {
            'chats': [
                { text: '', icon: 'bi-house', action: 'sidebar.tab.chats.activate' },
                { text: 'Чаты', icon: 'bi-chat-dots' }
            ],
            'context': [
                { text: '', icon: 'bi-house', action: 'sidebar.tab.chats.activate' },
                { text: 'Контекст', icon: 'bi-menu-up' }
            ]
        };

        const breadcrumbs = breadcrumbsMap[moduleName];
        if (breadcrumbs) {
            window.eventBus.emit('sidebar.breadcrumbs.show', {
                breadcrumbs: breadcrumbs
            });
        } else {
            window.eventBus.emit('sidebar.breadcrumbs.hide');
        }
    }

    /**
     * Обработка изменения размера сайдбара
     */
    function handleSidebarResize(data) {
        // Уведомляем все модули об изменении размера
        window.eventBus.emit('sidebar.resize.notify', {
            width: data.width,
            widthPercent: data.widthPercent,
            timestamp: data.timestamp
        });

        log('debug', `Sidebar resized to: ${data.widthPercent}%`);
    }

    /**
     * Обработка клика по хлебной крошке
     */
    function handleBreadcrumbClick(data) {
        log('debug', 'Breadcrumb clicked:', data.crumb);
        
        // Если у крошки есть действие, выполняем его
        if (data.crumb.action) {
            window.eventBus.emit(data.crumb.action, {
                source: 'breadcrumb',
                crumb: data.crumb
            });
        }
    }

    /**
     * Получение информации о текущем состоянии
     */
    function getStatus() {
        return {
            initialized: coordinatorState.initialized,
            readyModules: Array.from(coordinatorState.readyModules),
            currentModule: coordinatorState.currentModule,
            allModulesReady: EXPECTED_MODULES.every(moduleId => 
                coordinatorState.readyModules.has(moduleId)
            )
        };
    }

    /**
     * Принудительная загрузка модуля
     */
    function forceLoadModule(moduleName) {
        coordinatorState.currentModule = null;
        loadModuleInSidebarBody(moduleName);
    }

    /**
     * Сброс состояния координатора
     */
    function reset() {
        coordinatorState.currentModule = null;
        coordinatorState.moduleLoadQueue = [];
        
        // Скрываем хлебные крошки
        window.eventBus.emit('sidebar.breadcrumbs.hide');
        
        log('debug', 'Sidebar coordinator reset');
    }

    // Экспорт функций для использования в других модулях
    window.sidebarCoordinatorModule = {
        getStatus: getStatus,
        loadModule: forceLoadModule,
        reset: reset,
        getCurrentModule: () => coordinatorState.currentModule,
        isInitialized: () => coordinatorState.initialized,
        getReadyModules: () => Array.from(coordinatorState.readyModules)
    };

})();