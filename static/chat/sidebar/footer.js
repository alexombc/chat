/**
 * Модуль подвала сайдбара (IIFE) с настройками
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
    const footerState = {
        initialized: false,
        currentTheme: 'dark',
        themeScannerReady: false
    };

    // Инициализация при загрузке DOM
    document.addEventListener('DOMContentLoaded', function() {
        initializeFooter();
        setupEventBusListeners();
        
        // Уведомляем о готовности модуля
        window.eventBus.emit('module.sidebar-footer.ready', {
            timestamp: Date.now(),
            moduleId: 'sidebar-footer'
        });
    });

    /**
     * Инициализация модуля подвала
     */
    function initializeFooter() {
        const footerContainer = document.getElementById('sidebar-footer');
        if (!footerContainer) {
            log('error', 'Контейнер sidebar-footer не найден');
            return;
        }

        // Создаем HTML структуру подвала
        footerContainer.innerHTML = `
            <div class="p-3 border-top" style="padding-top: 36px !important;">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h6 class="mb-0">Настройки</h6>
                    <button type="button" class="btn btn-outline-secondary btn-sm" id="openSettingsBtn" title="Открыть настройки">
                        <i class="bi bi-gear"></i>
                    </button>
                </div>
                
                <!-- Селектор темы -->
                <div class="mb-3">
                    <div class="d-flex justify-content-between align-items-center">
                        <h6 class="mb-0 me-2">Тема:</h6>
                        <div class="d-flex align-items-center flex-grow-1">
                            <div class="dropdown flex-grow-1 me-2">
                                <button class="btn btn-outline-secondary btn-sm dropdown-toggle w-100 d-flex justify-content-between align-items-center"
                                        type="button" id="themeDropdown"
                                        data-bs-toggle="dropdown" aria-expanded="false">
                                    <span class="d-flex align-items-center">
                                        <i id="current-theme-icon" class="bi-palette me-2"></i>
                                        <span id="current-theme-name">Загрузка...</span>
                                    </span>
                                </button>
                                <ul class="dropdown-menu w-100" aria-labelledby="themeDropdown" id="themeDropdownMenu">
                                    <li><span class="dropdown-item-text">Загрузка тем...</span></li>
                                </ul>
                            </div>
                            <button type="button" class="btn btn-outline-secondary btn-sm" id="themeInfoBtn" title="Информация о теме">
                                <i class="bi bi-info-circle"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        setupEventListeners();
        loadThemeSettings();
        footerState.initialized = true;
        
        log('debug', 'Sidebar footer initialized');
    }

    /**
     * Настройка обработчиков событий DOM
     */
    function setupEventListeners() {
        // Кнопка открытия настроек
        document.getElementById('openSettingsBtn').addEventListener('click', openSettings);
        
        // Кнопка информации о теме
        document.getElementById('themeInfoBtn').addEventListener('click', showThemeInfo);
        
        // Инициализируем селектор тем
        initializeThemeSelector();
    }

    /**
     * Настройка слушателей EventBus
     */
    function setupEventBusListeners() {
        // Слушаем изменения темы от других модулей
        window.eventBus.on('globalVars.bootstrapTheme.changed', (theme) => {
            updateThemeSelector(theme);
        });
        
        // Слушаем готовность theme-scanner
        window.eventBus.on('module.theme-scanner.ready', () => {
            footerState.themeScannerReady = true;
            // Применяем тему только после готовности theme-scanner
            applyTheme();
        });
        
        // НЕ слушаем команды открытия настроек здесь, чтобы избежать рекурсии
        // Функция openSettings() сама отправляет событие user.action.openSettings
    }

    /**
     * Применение темы при инициализации
     */
    async function applyTheme() {
        const savedTheme = localStorage.getItem('chatApp_theme') || 'dark';
        
        // Если темы нет в localStorage, сохраняем темную по умолчанию
        if (!localStorage.getItem('chatApp_theme')) {
            localStorage.setItem('chatApp_theme', 'dark');
        }
        
        // Применяем тему через theme-scanner если доступен и готов
        if (window.themeScanner && footerState.themeScannerReady) {
            try {
                await window.themeScanner.applyTheme(savedTheme);
                log('debug', `Тема ${savedTheme} применена через theme-scanner`);
            } catch (error) {
                log('warn', 'Ошибка применения темы через theme-scanner:', error);
                // Fallback к стандартному методу только для встроенных тем
                if (savedTheme === 'light' || savedTheme === 'dark') {
                    document.documentElement.setAttribute('data-bs-theme', savedTheme);
                } else {
                    log('error', `Не удалось применить внешнюю тему ${savedTheme} без theme-scanner`);
                    // Возвращаемся к темной теме как fallback
                    document.documentElement.setAttribute('data-bs-theme', 'dark');
                    localStorage.setItem('chatApp_theme', 'dark');
                    footerState.currentTheme = 'dark';
                    return 'dark';
                }
            }
        } else if (!footerState.themeScannerReady) {
            // Если theme-scanner еще не готов, применяем только встроенные темы
            if (savedTheme === 'light' || savedTheme === 'dark') {
                document.documentElement.setAttribute('data-bs-theme', savedTheme);
                log('debug', `Временно применена встроенная тема ${savedTheme}, ожидаем theme-scanner`);
            } else {
                // Для внешних тем ждем готовности theme-scanner
                log('debug', `Ожидаем готовности theme-scanner для применения темы ${savedTheme}`);
                return savedTheme; // Возвращаем без применения
            }
        } else {
            // Fallback к стандартному методу только для встроенных тем
            if (savedTheme === 'light' || savedTheme === 'dark') {
                document.documentElement.setAttribute('data-bs-theme', savedTheme);
            }
        }
        
        footerState.currentTheme = savedTheme;
        
        // Уведомляем о текущей теме
        window.eventBus.emit('globalVars.bootstrapTheme.changed', savedTheme);
        
        return savedTheme;
    }

    /**
     * Инициализация селектора тем
     */
    async function initializeThemeSelector() {
        try {
            // Ждем готовности theme-scanner
            if (!window.themeScanner || !footerState.themeScannerReady) {
                setTimeout(initializeThemeSelector, 100);
                return;
            }

            await populateThemeDropdown();
            await loadThemeSettings();
        } catch (error) {
            console.error('Ошибка инициализации селектора тем:', error);
        }
    }

    /**
     * Заполнение выпадающего списка тем
     */
    async function populateThemeDropdown() {
        try {
            const themes = await window.themeScanner.getAvailableThemes();
            const dropdownMenu = document.getElementById('themeDropdownMenu');
            
            if (!dropdownMenu) {
                console.error('Dropdown menu не найден');
                return;
            }

            // Группируем темы по категориям
            const themeGroups = {
                builtin: themes.filter(theme => theme.category === 'builtin'),
                external: themes.filter(theme => theme.category !== 'builtin')
            };

            let menuHTML = '';

            // Встроенные темы
            if (themeGroups.builtin.length > 0) {
                menuHTML += '<li><h6 class="dropdown-header">Встроенные темы</h6></li>';
                for (const theme of themeGroups.builtin) {
                    const icon = await getThemeIcon(theme.id);
                    menuHTML += `
                        <li>
                            <a class="dropdown-item theme-option d-flex align-items-start"
                               href="#" data-theme="${theme.id}">
                                <i class="${icon} me-2 mt-1"></i>
                                <div class="flex-grow-1">
                                    <div class="fw-semibold">${theme.name}</div>
                                    <small class="text-muted d-block" style="white-space: normal; word-wrap: break-word;">${theme.description}</small>
                                </div>
                            </a>
                        </li>
                    `;
                }
            }

            // Внешние темы
            if (themeGroups.external.length > 0) {
                if (menuHTML) menuHTML += '<li><hr class="dropdown-divider"></li>';
                menuHTML += '<li><h6 class="dropdown-header">Дополнительные темы</h6></li>';
                for (const theme of themeGroups.external) {
                    const icon = await getThemeIcon(theme.id);
                    menuHTML += `
                        <li>
                            <a class="dropdown-item theme-option d-flex align-items-start"
                               href="#" data-theme="${theme.id}">
                                <i class="${icon} me-2 mt-1"></i>
                                <div class="flex-grow-1">
                                    <div class="fw-semibold">${theme.name}</div>
                                    <small class="text-muted d-block" style="white-space: normal; word-wrap: break-word;">${theme.description}</small>
                                </div>
                            </a>
                        </li>
                    `;
                }
            }

            dropdownMenu.innerHTML = menuHTML;

            // Добавляем обработчики событий для элементов темы
            dropdownMenu.querySelectorAll('.theme-option').forEach(item => {
                item.addEventListener('click', async (e) => {
                    e.preventDefault();
                    const themeId = e.currentTarget.getAttribute('data-theme');
                    await applySelectedTheme(themeId);
                });
            });

        } catch (error) {
            console.error('Ошибка заполнения dropdown тем:', error);
        }
    }

    /**
     * Получение иконки для темы из реестра тем
     */
    async function getThemeIcon(themeId) {
        try {
            // Пытаемся получить информацию о теме из themeScanner
            if (window.themeScanner) {
                const themeInfo = await window.themeScanner.getThemeInfo(themeId);
                if (themeInfo && themeInfo.icon) {
                    return themeInfo.icon;
                }
            }
            
            // Fallback к стандартной иконке
            return 'bi-palette';
        } catch (error) {
            console.warn(`Не удалось получить иконку для темы ${themeId}:`, error);
            return 'bi-palette';
        }
    }

    /**
     * Применение выбранной темы
     */
    async function applySelectedTheme(themeId) {
        try {
            if (window.themeScanner) {
                await window.themeScanner.applyTheme(themeId);
            } else {
                // Fallback
                document.documentElement.setAttribute('data-bs-theme', themeId);
                localStorage.setItem('chatApp_theme', themeId);
            }

            footerState.currentTheme = themeId;
            updateThemeSelector(themeId);

            log('debug', `Theme changed to: ${themeId}`);

        } catch (error) {
            console.error('Ошибка применения темы:', error);
            window.eventBus.emit('notification.show.error', {
                message: `Ошибка применения темы: ${error.message}`,
                duration: 5000,
                moduleId: 'sidebar-footer'
            });
        }
    }

    /**
     * Загрузка настроек темы
     */
    async function loadThemeSettings() {
        const savedTheme = localStorage.getItem('chatApp_theme') || 'dark';
        footerState.currentTheme = savedTheme;
        updateThemeSelector(savedTheme);
    }

    /**
     * Обновление селектора темы
     */
    async function updateThemeSelector(themeId) {
        try {
            const themeNameElement = document.getElementById('current-theme-name');
            const themeIconElement = document.getElementById('current-theme-icon');
            
            if (themeNameElement && themeIconElement) {
                if (window.themeScanner) {
                    const themeInfo = await window.themeScanner.getThemeInfo(themeId);
                    if (themeInfo) {
                        themeNameElement.textContent = themeInfo.name;
                        themeIconElement.className = await getThemeIcon(themeId);
                    } else {
                        themeNameElement.textContent = themeId;
                        themeIconElement.className = await getThemeIcon(themeId);
                    }
                } else {
                    themeNameElement.textContent = themeId;
                    themeIconElement.className = await getThemeIcon(themeId);
                }
            }
            
            footerState.currentTheme = themeId;
        } catch (error) {
            console.error('Ошибка обновления селектора темы:', error);
        }
    }


    /**
     * Показ информации о теме
     */
    async function showThemeInfo() {
        try {
            const currentTheme = footerState.currentTheme;
            if (!currentTheme) return;

            let themeInfo = null;
            if (window.themeScanner) {
                themeInfo = await window.themeScanner.getThemeInfo(currentTheme);
            }

            if (!themeInfo) {
                window.eventBus.emit('notification.show.warning', {
                    message: 'Информация о теме недоступна',
                    duration: 3000,
                    moduleId: 'sidebar-footer'
                });
                return;
            }

            // Создаем модальное окно с информацией о теме
            await createThemeInfoModal(themeInfo);

        } catch (error) {
            console.error('Ошибка показа информации о теме:', error);
        }
    }

    /**
     * Создание модального окна с информацией о теме
     */
    async function createThemeInfoModal(themeInfo) {
        // Удаляем существующее модальное окно если есть
        const existingModal = document.getElementById('themeInfoModal');
        if (existingModal) {
            existingModal.remove();
        }

        const themeIcon = await getThemeIcon(themeInfo.id);
        const modalHTML = `
            <div class="modal fade" id="themeInfoModal" tabindex="-1" aria-labelledby="themeInfoModalLabel" aria-hidden="true">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="themeInfoModalLabel">
                                <i class="${themeIcon} me-2"></i>
                                Информация о теме
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-md-8">
                                    <h6>${themeInfo.name}</h6>
                                    <p class="text-muted">${themeInfo.description}</p>
                                    
                                    <div class="mb-3">
                                        <strong>Автор:</strong> ${themeInfo.author || 'Неизвестен'}<br>
                                        <strong>Версия:</strong> ${themeInfo.version || 'Неизвестна'}<br>
                                        <strong>Лицензия:</strong> ${themeInfo.license || 'Неизвестна'}<br>
                                        <strong>Категория:</strong> ${themeInfo.category || 'Неизвестна'}
                                    </div>

                                    ${themeInfo.features && themeInfo.features.length > 0 ? `
                                        <div class="mb-3">
                                            <strong>Особенности:</strong>
                                            <ul class="mt-2">
                                                ${themeInfo.features.map(feature => `<li>${feature}</li>`).join('')}
                                            </ul>
                                        </div>
                                    ` : ''}

                                    ${themeInfo.tags && themeInfo.tags.length > 0 ? `
                                        <div class="mb-3">
                                            <strong>Теги:</strong><br>
                                            ${themeInfo.tags.map(tag => `<span class="badge bg-secondary me-1">${tag}</span>`).join('')}
                                        </div>
                                    ` : ''}
                                </div>
                                ${themeInfo.preview_image ? `
                                    <div class="col-md-4">
                                        <img src="${themeInfo.preview_image}" class="img-fluid rounded" alt="Превью темы">
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Закрыть</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Показываем модальное окно
        const modal = new bootstrap.Modal(document.getElementById('themeInfoModal'));
        modal.show();

        // Удаляем модальное окно после закрытия
        document.getElementById('themeInfoModal').addEventListener('hidden.bs.modal', function() {
            this.remove();
        });
    }

    /**
     * Открытие настроек
     */
    function openSettings() {
        // Отправляем событие для открытия настроек
        window.eventBus.emit('user.action.openSettings');
        
        log('debug', 'Settings open requested');
    }


    // Экспорт функций для использования в других модулях
    window.sidebarFooterModule = {
        getCurrentTheme: () => footerState.currentTheme,
        applySelectedTheme: applySelectedTheme,
        openSettings: openSettings,
        applyTheme: applyTheme,
        showThemeInfo: showThemeInfo,
        updateThemeSelector: updateThemeSelector,
        isInitialized: () => footerState.initialized
    };

})();