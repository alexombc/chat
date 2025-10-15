/**
 * Модуль хлебных крошек сайдбара (IIFE) для навигации
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
    const breadcrumbsState = {
        initialized: false,
        breadcrumbs: [],
        isVisible: false
    };

    // Инициализация при загрузке DOM
    document.addEventListener('DOMContentLoaded', function() {
        initializeBreadcrumbs();
        setupEventBusListeners();
        
        // Уведомляем о готовности модуля
        window.eventBus.emit('module.sidebar-breadcrumbs.ready', {
            timestamp: Date.now(),
            moduleId: 'sidebar-breadcrumbs'
        });
    });

    /**
     * Инициализация модуля хлебных крошек
     */
    function initializeBreadcrumbs() {
        const breadcrumbsContainer = document.getElementById('sidebar-breadcrumbs');
        if (!breadcrumbsContainer) {
            log('error', 'Контейнер sidebar-breadcrumbs не найден');
            return;
        }

        // Создаем HTML структуру хлебных крошек
        breadcrumbsContainer.innerHTML = `
            <div class="px-3 py-2 border-bottom bg-body-tertiary">
                <nav aria-label="breadcrumb">
                    <ol class="breadcrumb mb-0" id="breadcrumbsList">
                        <!-- Хлебные крошки будут добавляться динамически -->
                    </ol>
                </nav>
            </div>
        `;

        breadcrumbsState.initialized = true;
        
        log('debug', 'Sidebar breadcrumbs initialized');
    }

    /**
     * Настройка слушателей EventBus
     */
    function setupEventBusListeners() {
        // Слушаем команды обновления хлебных крошек
        window.eventBus.on('sidebar.breadcrumbs.update', (data) => {
            updateBreadcrumbs(data.breadcrumbs || []);
        });
        
        // Слушаем команды показа хлебных крошек
        window.eventBus.on('sidebar.breadcrumbs.show', (data) => {
            if (data && data.breadcrumbs) {
                updateBreadcrumbs(data.breadcrumbs);
            }
            showBreadcrumbs();
        });
        
        // Слушаем команды скрытия хлебных крошек
        window.eventBus.on('sidebar.breadcrumbs.hide', () => {
            hideBreadcrumbs();
        });
        
        // Слушаем команды очистки хлебных крошек
        window.eventBus.on('sidebar.breadcrumbs.clear', () => {
            clearBreadcrumbs();
        });
    }

    /**
     * Обновление хлебных крошек
     */
    function updateBreadcrumbs(breadcrumbs) {
        if (!breadcrumbsState.initialized) {
            log('warn', 'Breadcrumbs not initialized yet');
            return;
        }

        breadcrumbsState.breadcrumbs = breadcrumbs || [];
        renderBreadcrumbs();
        
        // Показываем хлебные крошки, если есть данные
        if (breadcrumbsState.breadcrumbs.length > 0) {
            showBreadcrumbs();
        } else {
            hideBreadcrumbs();
        }
        
        log('debug', 'Breadcrumbs updated:', breadcrumbsState.breadcrumbs);
    }

    /**
     * Отрисовка хлебных крошек
     */
    function renderBreadcrumbs() {
        const breadcrumbsList = document.getElementById('breadcrumbsList');
        if (!breadcrumbsList) return;

        if (breadcrumbsState.breadcrumbs.length === 0) {
            breadcrumbsList.innerHTML = '';
            return;
        }

        const breadcrumbsHtml = breadcrumbsState.breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbsState.breadcrumbs.length - 1;
            
            if (isLast) {
                // Последний элемент - активный, без ссылки
                return `
                    <li class="breadcrumb-item active" aria-current="page">
                        ${crumb.icon ? `<i class="${crumb.icon} me-1"></i>` : ''}
                        ${crumb.text}
                    </li>
                `;
            } else {
                // Промежуточные элементы - с возможностью клика
                return `
                    <li class="breadcrumb-item">
                        <a href="#" class="text-decoration-none breadcrumb-link" data-index="${index}">
                            ${crumb.icon ? `<i class="${crumb.icon} me-1"></i>` : ''}
                            ${crumb.text}
                        </a>
                    </li>
                `;
            }
        }).join('');

        breadcrumbsList.innerHTML = breadcrumbsHtml;
        
        // Добавляем обработчики кликов для ссылок
        breadcrumbsList.querySelectorAll('.breadcrumb-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const index = parseInt(e.currentTarget.dataset.index);
                handleBreadcrumbClick(index);
            });
        });
    }

    /**
     * Обработка клика по хлебной крошке
     */
    function handleBreadcrumbClick(index) {
        const crumb = breadcrumbsState.breadcrumbs[index];
        if (!crumb) return;

        // Отправляем событие о клике по хлебной крошке
        window.eventBus.emit('sidebar.breadcrumbs.click', {
            index: index,
            crumb: crumb,
            timestamp: Date.now()
        });

        // Если у крошки есть действие, выполняем его
        if (crumb.action) {
            window.eventBus.emit(crumb.action, crumb.data || {});
        }

        log('debug', `Breadcrumb clicked: ${crumb.text}`, crumb);
    }

    /**
     * Показ хлебных крошек
     */
    function showBreadcrumbs() {
        const breadcrumbsContainer = document.getElementById('sidebar-breadcrumbs');
        if (breadcrumbsContainer) {
            breadcrumbsContainer.classList.add('show');
            breadcrumbsState.isVisible = true;
            log('debug', 'Breadcrumbs shown');
        }
    }

    /**
     * Скрытие хлебных крошек
     */
    function hideBreadcrumbs() {
        const breadcrumbsContainer = document.getElementById('sidebar-breadcrumbs');
        if (breadcrumbsContainer) {
            breadcrumbsContainer.classList.remove('show');
            breadcrumbsState.isVisible = false;
            log('debug', 'Breadcrumbs hidden');
        }
    }

    /**
     * Очистка хлебных крошек
     */
    function clearBreadcrumbs() {
        breadcrumbsState.breadcrumbs = [];
        renderBreadcrumbs();
        hideBreadcrumbs();
        log('debug', 'Breadcrumbs cleared');
    }

    /**
     * Добавление хлебной крошки
     */
    function addBreadcrumb(crumb) {
        breadcrumbsState.breadcrumbs.push(crumb);
        renderBreadcrumbs();
        showBreadcrumbs();
        log('debug', 'Breadcrumb added:', crumb);
    }

    /**
     * Удаление хлебных крошек до указанного индекса
     */
    function trimBreadcrumbs(index) {
        breadcrumbsState.breadcrumbs = breadcrumbsState.breadcrumbs.slice(0, index + 1);
        renderBreadcrumbs();
        log('debug', `Breadcrumbs trimmed to index: ${index}`);
    }

    // Экспорт функций для использования в других модулях
    window.sidebarBreadcrumbsModule = {
        updateBreadcrumbs: updateBreadcrumbs,
        showBreadcrumbs: showBreadcrumbs,
        hideBreadcrumbs: hideBreadcrumbs,
        clearBreadcrumbs: clearBreadcrumbs,
        addBreadcrumb: addBreadcrumb,
        trimBreadcrumbs: trimBreadcrumbs,
        getBreadcrumbs: () => [...breadcrumbsState.breadcrumbs],
        isVisible: () => breadcrumbsState.isVisible,
        isInitialized: () => breadcrumbsState.initialized
    };

})();