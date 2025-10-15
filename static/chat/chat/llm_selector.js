/**
 * Модуль выбора модели LLM (IIFE) с интеграцией с EventBus
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
    const selectorState = {
        initialized: false,
        isLoading: false,
        allModels: [], // Все загруженные модели
        filteredModels: [] // Отфильтрованные модели
    };

    // Инициализация при загрузке DOM
    document.addEventListener('DOMContentLoaded', function() {
        initializeLLMSelector();
        setupEventBusListeners();
        
        // Уведомляем о готовности модуля
        window.eventBus.emit('module.llm-selector.ready', {
            timestamp: Date.now(),
            moduleId: 'llm-selector'
        });
    });

    /**
     * Инициализация модуля выбора модели LLM
     */
    function initializeLLMSelector() {
        createModalHTML();
        setupDOMEventListeners();
        selectorState.initialized = true;
        log('debug', 'LLM Selector module initialized');
    }

    /**
     * Создание HTML модального окна
     */
    function createModalHTML() {
        // Проверяем, не существует ли уже модальное окно
        if (document.getElementById('modelSelectionModal')) {
            return;
        }

        const modalHTML = `
            <!-- Модальное окно выбора модели -->
            <div class="modal fade" id="modelSelectionModal" tabindex="-1">
                <div class="modal-dialog" style="width: 50%; min-width: 400px; max-width: 100%;">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Выбор модели</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <!-- Поле поиска -->
                            <div id="modelSearchContainer" class="mb-3 d-none">
                                <div class="input-group">
                                    <span class="input-group-text">
                                        <i class="bi bi-search"></i>
                                    </span>
                                    <input type="text" class="form-control" id="modelSearchInput"
                                           placeholder="Поиск по названию модели...">
                                    <button class="btn btn-outline-secondary" type="button" id="clearSearchBtn">
                                        <i class="bi bi-x"></i>
                                    </button>
                                </div>
                            </div>
                            
                            <div id="modelLoadingSpinner" class="text-center">
                                <div class="spinner-border" role="status">
                                    <span class="visually-hidden">Загрузка...</span>
                                </div>
                                <p class="mt-2">Загрузка доступных моделей...</p>
                            </div>
                            <div id="modelsList" class="d-none">
                                <!-- Список моделей будет загружен динамически -->
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
                            <button type="button" class="btn btn-primary" id="applyModelBtn" disabled>Применить</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Добавляем модальное окно в конец body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        log('debug', 'Modal HTML created and added to DOM');
    }

    /**
     * Настройка слушателей EventBus
     */
    function setupEventBusListeners() {
        // Запрос на открытие модального окна выбора модели
        window.eventBus.on('user.action.openModelSelection', () => {
            openModelSelectionModal();
        });

        // Слушаем события от кнопки выбора модели в chat-module
        window.eventBus.on('module.chat-module.modelSelectBtn.clicked', () => {
            openModelSelectionModal();
        });
    }

    /**
     * Настройка обработчиков DOM событий
     */
    function setupDOMEventListeners() {
        // Настройка обработчиков после создания модального окна
        setTimeout(() => {
            setupModalEventHandlers();
        }, 100);
    }

    /**
     * Настройка обработчиков событий модального окна
     */
    function setupModalEventHandlers() {
        log('debug', 'Setting up modal event handlers');
        
        const applyModelBtn = document.getElementById('applyModelBtn');
        const searchInput = document.getElementById('modelSearchInput');
        const clearSearchBtn = document.getElementById('clearSearchBtn');
        
        log('debug', 'Elements found:', {
            applyModelBtn: !!applyModelBtn,
            searchInput: !!searchInput,
            clearSearchBtn: !!clearSearchBtn
        });
        
        if (applyModelBtn) {
            applyModelBtn.addEventListener('click', applySelectedModel);
            log('debug', 'Apply button handler attached');
        }
        
        if (searchInput) {
            // Используем input для мгновенного отклика при вводе
            searchInput.addEventListener('input', handleSearch);
            // Дополнительно обрабатываем keyup для полной совместимости
            searchInput.addEventListener('keyup', handleSearch);
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    clearSearch();
                }
            });
            log('debug', 'Search input handlers attached');
        }
        
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', clearSearch);
            log('debug', 'Clear search button handler attached');
        }
    }

    /**
     * Открытие модального окна выбора модели
     */
    function openModelSelectionModal() {
        const modal = new bootstrap.Modal(document.getElementById('modelSelectionModal'));
        modal.show();
        
        // Загрузка списка моделей
        loadAvailableModels();
        
        // Уведомляем о открытии модального окна
        window.eventBus.emit('module.llm-selector.modal.opened', {
            timestamp: Date.now(),
            moduleId: 'llm-selector'
        });
    }

    /**
     * Загрузка доступных моделей от LLM
     */
    async function loadAvailableModels() {
        const loadingSpinner = document.getElementById('modelLoadingSpinner');
        const modelsList = document.getElementById('modelsList');
        const applyBtn = document.getElementById('applyModelBtn');
        
        if (!loadingSpinner || !modelsList || !applyBtn) {
            log('error', 'Required DOM elements not found for model selection');
            return;
        }

        selectorState.isLoading = true;
        loadingSpinner.classList.remove('d-none');
        modelsList.classList.add('d-none');
        applyBtn.disabled = true;
        
        try {
            // Получаем настройки из модуля настроек
            let settings = null;
            window.eventBus.on('globalVars.chat-settings.value', (data) => {
                settings = data;
            });
            window.eventBus.emit('globalVars.chat-settings.get');
            
            // Ждем получения настроек
            await new Promise(resolve => setTimeout(resolve, 100));
            
            if (!settings || !settings.llm_api_url || !settings.llm_api_key) {
                throw new Error('Настройки API не найдены. Настройте подключение в настройках.');
            }
            
            const response = await fetch(settings.llm_api_url.replace('/chat/completions', '/models'), {
                headers: {
                    'Authorization': `Bearer ${settings.llm_api_key}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            selectorState.allModels = data.data || [];
            selectorState.filteredModels = [...selectorState.allModels];
            renderModelsList(selectorState.filteredModels);
            
            // Показываем поле поиска после загрузки моделей
            const searchContainer = document.getElementById('modelSearchContainer');
            if (searchContainer && selectorState.allModels.length > 0) {
                searchContainer.classList.remove('d-none');
            }
            
            // Уведомляем об успешной загрузке моделей
            window.eventBus.emit('module.llm-selector.models.loaded', {
                timestamp: Date.now(),
                moduleId: 'llm-selector',
                modelsCount: data.data ? data.data.length : 0
            });
            
        } catch (error) {
            log('error', 'Error loading models:', error);
            // Отправляем нотификацию об ошибке
            window.eventBus.emit('notification.show.error', {
                message: `Ошибка загрузки моделей: ${error.message}`,
                duration: 5000,
                moduleId: 'llm-selector'
            });
            
            // Уведомляем об ошибке загрузки моделей
            window.eventBus.emit('module.llm-selector.models.error', {
                timestamp: Date.now(),
                moduleId: 'llm-selector',
                error: error.message
            });
            
            modelsList.innerHTML = `
                <div class="alert alert-danger">
                    <i class="bi bi-exclamation-triangle"></i>
                    Ошибка загрузки моделей: ${error.message}
                </div>
            `;
        } finally {
            selectorState.isLoading = false;
            loadingSpinner.classList.add('d-none');
            modelsList.classList.remove('d-none');
        }
    }

    /**
     * Отрисовка списка моделей
     */
    function renderModelsList(models) {
        const modelsList = document.getElementById('modelsList');
        const applyBtn = document.getElementById('applyModelBtn');
        
        if (!modelsList || !applyBtn) {
            log('error', 'Required DOM elements not found for rendering models list');
            return;
        }
        
        if (models.length === 0) {
            modelsList.innerHTML = '<div class="alert alert-info">Модели не найдены</div>';
            return;
        }
        
        modelsList.innerHTML = models.map((model, index) => {
            const modelId = model.id.replace(/[^a-zA-Z0-9]/g, '_');
            const shortDescription = model.description ?
                (model.description.length > 200 ? model.description.substring(0, 200) + '...' : model.description) : '';
            const hasDescription = model.description && model.description.trim();
            
            return `
                <div class="model-item border-bottom px-3 py-2" style="cursor: pointer;">
                    <div class="d-flex align-items-center justify-content-between">
                        <div class="d-flex align-items-center flex-grow-1">
                            <input class="form-check-input model-radio me-3" type="radio" name="selectedModel"
                                   value="${model.id}" id="model_${modelId}">
                            <label class="form-check-label flex-grow-1" for="model_${modelId}"
                                   style="cursor: pointer;"
                                   ${hasDescription ? `title="${shortDescription}"` : ''}>
                                <strong>${model.id}</strong>
                            </label>
                        </div>
                        ${hasDescription ? `
                            <button type="button" class="btn btn-sm btn-link p-0 expand-btn"
                                    data-model-index="${index}"
                                    title="Показать/скрыть описание">
                                <i class="bi bi-chevron-down"></i>
                            </button>
                        ` : ''}
                    </div>
                    ${hasDescription ? `
                        <div class="model-description mt-2 d-none" id="description_${index}">
                            <small class="text-muted">${model.description}</small>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
        
        // Получаем текущую модель из настроек
        let currentModel = null;
        window.eventBus.on('globalVars.llm_model.value', (model) => {
            currentModel = model;
        });
        window.eventBus.emit('globalVars.llm_model.get');
        
        // Обработчики для радиокнопок
        document.querySelectorAll('.model-radio').forEach(radio => {
            radio.addEventListener('change', () => {
                applyBtn.disabled = false;
                
                // Уведомляем о выборе модели
                window.eventBus.emit('module.llm-selector.model.selected', {
                    timestamp: Date.now(),
                    moduleId: 'llm-selector',
                    selectedModel: radio.value
                });
            });
        });
        
        // Обработчики для кнопок разворачивания описания
        document.querySelectorAll('.expand-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const modelIndex = btn.dataset.modelIndex;
                const description = document.getElementById(`description_${modelIndex}`);
                const icon = btn.querySelector('i');
                
                if (description.classList.contains('d-none')) {
                    description.classList.remove('d-none');
                    icon.className = 'bi bi-chevron-up';
                } else {
                    description.classList.add('d-none');
                    icon.className = 'bi bi-chevron-down';
                }
            });
        });
        
        // Обработчики клика по элементу модели для выбора
        document.querySelectorAll('.model-item').forEach(item => {
            item.addEventListener('click', (e) => {
                // Игнорируем клики по кнопке разворачивания
                if (e.target.closest('.expand-btn')) return;
                
                const radio = item.querySelector('.model-radio');
                if (radio) {
                    radio.checked = true;
                    radio.dispatchEvent(new Event('change'));
                }
            });
        });
        
        // Отмечаем текущую модель, если она есть в списке
        if (currentModel && models.some(m => m.id === currentModel)) {
            const currentRadio = document.querySelector(`input[value="${currentModel}"]`);
            if (currentRadio) {
                currentRadio.checked = true;
                applyBtn.disabled = false;
            }
        }
        
        // Уведомляем об отрисовке списка моделей
        window.eventBus.emit('module.llm-selector.models.rendered', {
            timestamp: Date.now(),
            moduleId: 'llm-selector',
            modelsCount: models.length,
            currentModel: currentModel
        });
    }

    /**
     * Применение выбранной модели
     */
    function applySelectedModel() {
        const selectedModel = document.querySelector('input[name="selectedModel"]:checked');
        if (selectedModel) {
            const newModel = selectedModel.value;
            
            // Обновляем глобальную переменную модели
            window.eventBus.emit('globalVars.llm_model.update', newModel);
            
            // Уведомляем о применении модели
            window.eventBus.emit('module.llm-selector.model.applied', {
                timestamp: Date.now(),
                moduleId: 'llm-selector',
                appliedModel: newModel
            });
            
            // Закрытие модального окна
            const modal = bootstrap.Modal.getInstance(document.getElementById('modelSelectionModal'));
            if (modal) {
                modal.hide();
                
                // Уведомляем о закрытии модального окна
                window.eventBus.emit('module.llm-selector.modal.closed', {
                    timestamp: Date.now(),
                    moduleId: 'llm-selector',
                    appliedModel: newModel
                });
            }
            
            log('debug', `Model applied: ${newModel}`);
        } else {
            log('warn', 'No model selected for application');
            
            // Отправляем нотификацию о предупреждении
            window.eventBus.emit('notification.show.warning', {
                message: 'Выберите модель для применения',
                duration: 3000,
                moduleId: 'llm-selector'
            });
        }
    }

    /**
     * Обработка поиска моделей
     */
    function handleSearch() {
        log('debug', 'handleSearch called');
        
        const searchInput = document.getElementById('modelSearchInput');
        if (!searchInput) {
            log('error', 'Search input not found');
            return;
        }
        
        const searchTerm = searchInput.value.toLowerCase().trim();
        log('debug', 'Search term:', searchTerm);
        log('debug', 'All models count:', selectorState.allModels.length);
        
        if (searchTerm === '') {
            selectorState.filteredModels = [...selectorState.allModels];
        } else {
            selectorState.filteredModels = selectorState.allModels.filter(model => {
                // Поиск только по названию модели
                const matches = model.id.toLowerCase().includes(searchTerm);
                if (matches) {
                    log('debug', 'Model matches:', model.id);
                }
                return matches;
            });
        }
        
        log('debug', 'Filtered models count:', selectorState.filteredModels.length);
        renderModelsList(selectorState.filteredModels);
        
        // Обновляем состояние кнопки очистки
        const clearBtn = document.getElementById('clearSearchBtn');
        if (clearBtn) {
            clearBtn.style.display = searchTerm ? 'block' : 'none';
        }
    }
    
    /**
     * Очистка поиска
     */
    function clearSearch() {
        const searchInput = document.getElementById('modelSearchInput');
        const clearBtn = document.getElementById('clearSearchBtn');
        
        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
        }
        
        if (clearBtn) {
            clearBtn.style.display = 'none';
        }
        
        selectorState.filteredModels = [...selectorState.allModels];
        renderModelsList(selectorState.filteredModels);
    }

    // Экспорт функций для использования в других модулях
    window.llmSelectorModule = {
        isInitialized: () => selectorState.initialized,
        isLoading: () => selectorState.isLoading,
        openModelSelectionModal: openModelSelectionModal,
        loadAvailableModels: loadAvailableModels,
        applySelectedModel: applySelectedModel,
        handleSearch: handleSearch,
        clearSearch: clearSearch
    };

})();