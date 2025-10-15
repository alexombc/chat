/**
 * Модуль заголовка сайдбара (IIFE) с закладками и кнопкой помощи
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
    const headerState = {
        activeTab: 'chats',
        initialized: false
    };

    // Инициализация при загрузке DOM
    document.addEventListener('DOMContentLoaded', function() {
        initializeHeader();
        setupEventBusListeners();
        
        // Уведомляем о готовности модуля
        window.eventBus.emit('module.sidebar-header.ready', {
            timestamp: Date.now(),
            moduleId: 'sidebar-header'
        });
    });

    /**
     * Инициализация модуля заголовка
     */
    function initializeHeader() {
        const headerContainer = document.getElementById('sidebar-header');
        if (!headerContainer) {
            log('error', 'Контейнер sidebar-header не найден');
            return;
        }

        // Создаем HTML структуру заголовка (совпадает по стилю с заголовком чата)
        headerContainer.innerHTML = `
            <div class="border-bottom bg-body-secondary d-flex justify-content-between align-items-start" style="padding: 16px 8px 2px 8px;">
                <!-- Закладки слева -->
                <ul class="nav nav-tabs border-0 flex-grow-1" id="sidebarTabs" role="tablist">
                    <li class="nav-item" role="presentation">
                        <button class="nav-link active" id="chats-tab" data-tab="chats" type="button" role="tab">
                            <i class="bi bi-chat-dots me-1"></i>Чаты
                        </button>
                    </li>
                    <li class="nav-item" role="presentation">
                        <button class="nav-link" id="context-tab" data-tab="context" type="button" role="tab">
                            <i class="bi bi-menu-up me-1"></i>Контекст
                        </button>
                    </li>
                </ul>
                
                <!-- Кнопка помощи справа -->
                <button type="button" class="btn btn-sm ms-2 align-self-start" id="helpBtn" title="Помощь" style="padding-top: 2;">
                    <i class="bi bi-question-circle"></i>
                </button>
            </div>
        `;

        setupEventListeners();
        headerState.initialized = true;
        
        log('debug', 'Sidebar header initialized');
    }

    /**
     * Настройка обработчиков событий DOM
     */
    function setupEventListeners() {
        // Обработчики закладок
        document.getElementById('chats-tab').addEventListener('click', () => activateTab('chats'));
        document.getElementById('context-tab').addEventListener('click', () => activateTab('context'));
        
        // Обработчик кнопки помощи
        document.getElementById('helpBtn').addEventListener('click', showHelpModal);
    }

    /**
     * Настройка слушателей EventBus
     */
    function setupEventBusListeners() {
        // Слушаем команды активации закладок
        window.eventBus.on('sidebar.tab.chats.activate', () => activateTab('chats'));
        window.eventBus.on('sidebar.tab.context.activate', () => activateTab('context'));
        
        // Слушаем команды обновления активной закладки
        window.eventBus.on('sidebar.tab.update', (data) => {
            if (data.tab) {
                activateTab(data.tab);
            }
        });
    }

    /**
     * Активация закладки
     */
    function activateTab(tabName) {
        if (!headerState.initialized) {
            log('warn', 'Header not initialized yet');
            return;
        }

        // Обновляем визуальное состояние закладок
        document.querySelectorAll('#sidebarTabs .nav-link').forEach(tab => {
            tab.classList.remove('active');
        });
        
        const activeTab = document.getElementById(`${tabName}-tab`);
        if (activeTab) {
            activeTab.classList.add('active');
        }

        headerState.activeTab = tabName;

        // Отправляем событие для загрузки соответствующего модуля в sidebar-body
        window.eventBus.emit('sidebar.module.load', {
            module: tabName,
            timestamp: Date.now()
        });

        log('debug', `Tab activated: ${tabName}`);
    }

    /**
     * Показ модального окна помощи
     */
    function showHelpModal() {
        // Создаем модальное окно помощи, если его еще нет
        let helpModal = document.getElementById('helpModal');
        if (!helpModal) {
            helpModal = createHelpModal();
            document.body.appendChild(helpModal);
        }

        // Показываем модальное окно
        const modal = new bootstrap.Modal(helpModal);
        modal.show();

        log('debug', 'Help modal shown');
    }

    /**
     * Создание модального окна помощи
     */
    function createHelpModal() {
        const modalElement = document.createElement('div');
        modalElement.className = 'modal fade';
        modalElement.id = 'helpModal';
        modalElement.setAttribute('tabindex', '-1');
        modalElement.setAttribute('aria-labelledby', 'helpModalLabel');
        modalElement.setAttribute('aria-hidden', 'true');

        modalElement.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="helpModalLabel">
                            <i class="bi bi-question-circle me-2"></i>
                            Помощь
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть"></button>
                    </div>
                    <div class="modal-body">
                        <p>Тут будет описание</p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Закрыть</button>
                    </div>
                </div>
            </div>
        `;

        return modalElement;
    }

    // Экспорт функций для использования в других модулях
    window.sidebarHeaderModule = {
        getActiveTab: () => headerState.activeTab,
        activateTab: activateTab,
        isInitialized: () => headerState.initialized
    };

})();