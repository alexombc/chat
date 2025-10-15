/**
 * Модуль изменения размера сайдбара (IIFE) с сохранением в localStorage
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

    // Состояние модуля
    const resizeState = {
        initialized: false,
        isResizing: false,
        startX: 0,
        startWidth: 0,
        minWidth: 200,
        maxWidth: 600,
        defaultWidth: 25 // в процентах
    };

    // Ключ для localStorage
    const STORAGE_KEY = 'chatApp_uiSettings';

    // Инициализация при загрузке DOM
    document.addEventListener('DOMContentLoaded', function() {
        initializeResize();
        loadUISettings();
        setupEventBusListeners();
        
        // Уведомляем о готовности модуля
        window.eventBus.emit('module.sidebar-resize.ready', {
            timestamp: Date.now(),
            moduleId: 'sidebar-resize'
        });
    });

    /**
     * Инициализация модуля изменения размера
     */
    function initializeResize() {
        const resizer = document.querySelector('.sidebar-resizer');
        if (!resizer) {
            log('error', 'Сепаратор .sidebar-resizer не найден');
            return;
        }

        setupEventListeners();
        resizeState.initialized = true;
        
        log('debug', 'Sidebar resize initialized');
    }

    /**
     * Настройка обработчиков событий DOM
     */
    function setupEventListeners() {
        const resizer = document.querySelector('.sidebar-resizer');
        if (!resizer) return;

        // Обработчики мыши
        resizer.addEventListener('mousedown', startResize);
        document.addEventListener('mousemove', doResize);
        document.addEventListener('mouseup', stopResize);

        // Обработчики касаний для мобильных устройств
        resizer.addEventListener('touchstart', startResizeTouch, { passive: false });
        document.addEventListener('touchmove', doResizeTouch, { passive: false });
        document.addEventListener('touchend', stopResize);
    }

    /**
     * Настройка слушателей EventBus
     */
    function setupEventBusListeners() {
        // Слушаем команды изменения размера
        window.eventBus.on('sidebar.resize.set', (data) => {
            if (data.width) {
                setSidebarWidth(data.width);
            }
        });

        // Слушаем команды сброса размера
        window.eventBus.on('sidebar.resize.reset', () => {
            resetSidebarWidth();
        });
    }

    /**
     * Начало изменения размера (мышь)
     */
    function startResize(e) {
        e.preventDefault();
        resizeState.isResizing = true;
        resizeState.startX = e.clientX;
        resizeState.startWidth = document.querySelector('.sidebar').offsetWidth;
        
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        
        // Отправляем событие начала изменения размера
        window.eventBus.emit('sidebar.resize.start', {
            startWidth: resizeState.startWidth,
            timestamp: Date.now()
        });
        
        log('debug', 'Resize started');
    }

    /**
     * Начало изменения размера (касание)
     */
    function startResizeTouch(e) {
        e.preventDefault();
        const touch = e.touches[0];
        resizeState.isResizing = true;
        resizeState.startX = touch.clientX;
        resizeState.startWidth = document.querySelector('.sidebar').offsetWidth;
        
        // Отправляем событие начала изменения размера
        window.eventBus.emit('sidebar.resize.start', {
            startWidth: resizeState.startWidth,
            timestamp: Date.now()
        });
        
        log('debug', 'Touch resize started');
    }

    /**
     * Процесс изменения размера (мышь)
     */
    function doResize(e) {
        if (!resizeState.isResizing) return;
        
        e.preventDefault();
        const deltaX = e.clientX - resizeState.startX;
        updateSidebarWidth(deltaX);
    }

    /**
     * Процесс изменения размера (касание)
     */
    function doResizeTouch(e) {
        if (!resizeState.isResizing) return;
        
        e.preventDefault();
        const touch = e.touches[0];
        const deltaX = touch.clientX - resizeState.startX;
        updateSidebarWidth(deltaX);
    }

    /**
     * Обновление ширины сайдбара
     */
    function updateSidebarWidth(deltaX) {
        const newWidth = resizeState.startWidth + deltaX;
        const clampedWidth = Math.max(resizeState.minWidth, Math.min(resizeState.maxWidth, newWidth));
        
        const sidebar = document.querySelector('.sidebar');
        const mainContent = document.querySelector('.main-content');
        
        if (sidebar && mainContent) {
            const widthPercent = (clampedWidth / window.innerWidth) * 100;
            
            sidebar.style.width = `${clampedWidth}px`;
            mainContent.style.marginLeft = `${clampedWidth}px`;
            
            // Отправляем событие обновления размера
            window.eventBus.emit('sidebar.resize.update', {
                width: clampedWidth,
                widthPercent: widthPercent,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Завершение изменения размера
     */
    function stopResize() {
        if (!resizeState.isResizing) return;
        
        resizeState.isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        
        // Сохраняем новую ширину в настройки
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            const currentWidth = sidebar.offsetWidth;
            const widthPercent = (currentWidth / window.innerWidth) * 100;
            saveUISettings({ sidebarWidth: widthPercent });
            
            // Отправляем событие завершения изменения размера
            window.eventBus.emit('sidebar.resize.end', {
                finalWidth: currentWidth,
                finalWidthPercent: widthPercent,
                timestamp: Date.now()
            });
        }
        
        log('debug', 'Resize ended');
    }

    /**
     * Установка ширины сайдбара
     */
    function setSidebarWidth(widthPercent) {
        const sidebar = document.querySelector('.sidebar');
        const mainContent = document.querySelector('.main-content');
        
        if (sidebar && mainContent) {
            const clampedPercent = Math.max(15, Math.min(50, widthPercent));
            
            sidebar.style.width = `${clampedPercent}%`;
            mainContent.style.marginLeft = `${clampedPercent}%`;
            
            saveUISettings({ sidebarWidth: clampedPercent });
            
            log('debug', `Sidebar width set to: ${clampedPercent}%`);
        }
    }

    /**
     * Сброс ширины сайдбара к значению по умолчанию
     */
    function resetSidebarWidth() {
        setSidebarWidth(resizeState.defaultWidth);
        
        window.eventBus.emit('notification.show.info', {
            message: 'Ширина сайдбара сброшена к значению по умолчанию',
            duration: 3000,
            moduleId: 'sidebar-resize'
        });
        
        log('debug', 'Sidebar width reset to default');
    }

    /**
     * Загрузка настроек UI из localStorage
     */
    function loadUISettings() {
        try {
            const savedSettings = localStorage.getItem(STORAGE_KEY);
            if (savedSettings) {
                const settings = JSON.parse(savedSettings);
                if (settings.sidebarWidth) {
                    setSidebarWidth(settings.sidebarWidth);
                }
            }
        } catch (error) {
            log('error', 'Error loading UI settings:', error);
        }
    }

    /**
     * Сохранение настроек UI в localStorage
     */
    function saveUISettings(newSettings) {
        try {
            let settings = {};
            const savedSettings = localStorage.getItem(STORAGE_KEY);
            if (savedSettings) {
                settings = JSON.parse(savedSettings);
            }
            
            // Объединяем существующие настройки с новыми
            Object.assign(settings, newSettings);
            
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
            
            // Отправляем событие обновления настроек UI
            window.eventBus.emit('ui.settings.update', {
                settings: settings,
                timestamp: Date.now()
            });
            
        } catch (error) {
            log('error', 'Error saving UI settings:', error);
        }
    }

    /**
     * Получение текущих настроек UI
     */
    function getUISettings() {
        try {
            const savedSettings = localStorage.getItem(STORAGE_KEY);
            return savedSettings ? JSON.parse(savedSettings) : {};
        } catch (error) {
            log('error', 'Error getting UI settings:', error);
            return {};
        }
    }

    // Экспорт функций для использования в других модулях
    window.sidebarResizeModule = {
        setSidebarWidth: setSidebarWidth,
        resetSidebarWidth: resetSidebarWidth,
        getUISettings: getUISettings,
        saveUISettings: saveUISettings,
        isInitialized: () => resizeState.initialized,
        isResizing: () => resizeState.isResizing
    };

})();