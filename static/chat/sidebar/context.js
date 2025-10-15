/**
 * Модуль контекста сайдбара (IIFE) - управление настройками дерева контекста
 */
(function() {
    'use strict';

    // Уровень логирования модуля
    // Доступные уровни: 'debug', 'warn', 'error'
    // debug - все сообщения, warn - предупреждения и ошибки, error - только ошибки
    const LOG_LEVEL = 'debug';

    // Функция логирования с проверкой уровня
    function log(level, message, ...args) {
        const levels = { debug: 0, warn: 1, error: 2 };
        if (levels[level] >= levels[LOG_LEVEL]) {
            console[level](message, ...args);
        }
    }

    // Константы для работы с LocalStorage
    const STORAGE_KEY = 'chatApp_contextSettings';
    const DEFAULT_SETTINGS_PATH = '/static/chat/sidebar/settings/context-settings-default.json';
    
    // Ограничения для дерева
    const MAX_TREE_ELEMENTS = 1000;
    const MAX_TREE_DEPTH = 4;

    // Состояние модуля
    const contextState = {
        initialized: false,
        isActive: false,
        currentData: null,
        listenersAttached: false
    };

    // Инициализация при загрузке DOM
    document.addEventListener('DOMContentLoaded', function() {
        setupEventBusListeners();
        
        // Уведомляем о готовности модуля
        window.eventBus.emit('module.sidebar-context.ready', {
            timestamp: Date.now(),
            moduleId: 'sidebar-context'
        });
    });

    /**
     * Инициализация модуля контекста
     */
    function initializeContext() {
        // Проверяем, не инициализирован ли уже модуль
        if (contextState.initialized) {
            log('debug', 'Context module already initialized, skipping');
            return;
        }

        const sidebarBody = document.getElementById('sidebar-body');
        if (!sidebarBody) {
            log('error', 'Контейнер sidebar-body не найден');
            return;
        }

        // Создаем HTML структуру модуля контекста
        sidebarBody.innerHTML = createContextHTML();
        
        // Создаем модальные окна на верхнем уровне DOM
        createModals();

        // Инициализируем сразу без задержки, как в chat-module.js
        setupEventListeners();
        loadDataFromStorage();
        renderTree(); // Отображаем дерево после загрузки данных
        contextState.initialized = true;
        contextState.isActive = true;
        
        log('debug', 'Context module initialized');
    }

    /**
     * Создание HTML структуры модуля
     */
    function createContextHTML() {
        return `
            <div class="d-flex flex-column h-100">
                <!-- Шапка с кнопками -->
                <div class="border-bottom p-3">
                    <div class="d-flex justify-content-between align-items-center">
                        <h6 class="mb-0"></h6>
                        <div class="d-flex align-items-center">
                            <!-- Кнопка загрузки настроек по умолчанию -->
                            <button type="button" class="btn btn-sm btn-outline-secondary me-2"
                                    id="loadDefaultBtn"
                                    title="Заменить содержимое настроек дерева из файла настроек по умолчанию">
                                <i class="bi bi-box-arrow-in-right"></i>
                            </button>
                            
                            <!-- Вертикальный сепаратор -->
                            <div class="vr mx-3"></div>
                            
                            <!-- Кнопка загрузки файла -->
                            <button type="button" class="btn btn-sm btn-outline-secondary me-2"
                                    id="uploadFileBtn"
                                    title="Загрузить файл настроек с ПК">
                                <i class="bi bi-upload"></i>
                            </button>
                            
                            <!-- Кнопка вставки из буфера -->
                            <button type="button" class="btn btn-sm btn-outline-secondary me-2"
                                    id="pasteFromClipboardBtn"
                                    title="Заменить содержимое настроек дерева из буфера обмена">
                                <i class="bi bi-clipboard-plus"></i>
                            </button>
                            
                            <!-- Кнопка копирования в буфер -->
                            <button type="button" class="btn btn-sm btn-outline-secondary me-2"
                                    id="copyToClipboardBtn"
                                    title="Скопировать содержимое из настроек в буфер обмена">
                                <i class="bi bi-clipboard"></i>
                            </button>
                            
                            <!-- Кнопка скачивания -->
                            <button type="button" class="btn btn-sm btn-outline-secondary me-2"
                                    id="downloadBtn"
                                    title="Скачать содержимое из редактора в файл на ПК">
                                <i class="bi bi-download"></i>
                            </button>
                            
                            <!-- Вертикальный сепаратор -->
                            <div class="vr mx-3"></div>
                            
                            <!-- Кнопка помощи -->
                            <button type="button" class="btn btn-sm btn-outline-secondary"
                                    id="contextHelpBtn"
                                    title="Помощь по работе с настройками дерева контекста чата">
                                <i class="bi bi-question-circle"></i>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Область дерева контекста -->
                <div class="flex-grow-1 p-3" style="overflow-y: auto;">
                    <div id="contextTreeContainer">
                        <!-- Дерево будет отображаться здесь -->
                    </div>
                </div>

                <!-- Скрытый input для загрузки файлов -->
                <input type="file" id="fileInput" accept=".json" style="display: none;">
            </div>
        `;
    }

    /**
     * Создание модальных окон на верхнем уровне DOM
     */
    function createModals() {
        // Удаляем существующие модальные окна если они есть
        const existingConfirmModal = document.getElementById('contextConfirmModal');
        const existingHelpModal = document.getElementById('contextHelpModal');
        
        if (existingConfirmModal) {
            existingConfirmModal.remove();
        }
        if (existingHelpModal) {
            existingHelpModal.remove();
        }

        // Создаем модальные окна
        const modalsHTML = `
            <!-- Модальное окно подтверждения -->
            <div class="modal fade" id="contextConfirmModal" tabindex="-1" aria-labelledby="contextConfirmModalLabel" aria-hidden="true">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="contextConfirmModalLabel">Подтверждение действия</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="alert alert-warning" role="alert">
                                <i class="bi bi-exclamation-triangle me-2"></i>
                                <strong>Внимание!</strong> Вы действительно хотите заменить структуру дерева контекста?
                                Рекомендую перед этим сохранить текущую конфигурацию в файл, чтобы Вы могли при необходимости
                                к ней вернуться в случае неудачи с загрузкой новой конфигурации.
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
                            <button type="button" class="btn btn-primary" data-bs-dismiss="modal" id="contextConfirmActionBtn">Продолжить</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Модальное окно помощи -->
            <div class="modal fade" id="contextHelpModal" tabindex="-1" aria-labelledby="contextHelpModalLabel" aria-hidden="true">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="contextHelpModalLabel">
                                <i class="bi bi-question-circle me-2"></i>
                                Помощь по работе с настройками дерева контекста чата
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="text-center text-muted">
                                <i class="bi bi-tools fs-1 mb-3"></i>
                                <h6>Содержимое разрабатывается</h6>
                                <p>Подробная справка по работе с настройками дерева контекста будет добавлена в ближайшее время.</p>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Закрыть</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Добавляем модальные окна в body
        document.body.insertAdjacentHTML('beforeend', modalsHTML);
        
        log('debug', 'Модальные окна созданы на верхнем уровне DOM');
    }

    /**
     * Очистка модальных окон
     */
    function cleanupModals() {
        const confirmModal = document.getElementById('contextConfirmModal');
        const helpModal = document.getElementById('contextHelpModal');
        
        if (confirmModal) {
            // Закрываем модальное окно если оно открыто
            const modalInstance = bootstrap.Modal.getInstance(confirmModal);
            if (modalInstance) {
                modalInstance.hide();
            }
            confirmModal.remove();
        }
        
        if (helpModal) {
            // Закрываем модальное окно если оно открыто
            const modalInstance = bootstrap.Modal.getInstance(helpModal);
            if (modalInstance) {
                modalInstance.hide();
            }
            helpModal.remove();
        }
        
        // Очищаем callback
        window.contextConfirmCallback = null;
        
        // Сбрасываем флаги состояния
        contextState.initialized = false;
        contextState.listenersAttached = false;
        
        log('debug', 'Модальные окна очищены');
    }

    /**
     * Настройка обработчиков событий DOM
     */
    function setupEventListeners() {
        // Проверяем, не настроены ли уже обработчики
        if (contextState.listenersAttached) {
            log('debug', 'Event listeners already attached, skipping');
            return;
        }
        
        log('debug', 'Setting up event listeners');
        
        // Кнопка загрузки настроек по умолчанию
        const loadDefaultBtn = document.getElementById('loadDefaultBtn');
        if (loadDefaultBtn) {
            loadDefaultBtn.addEventListener('click', () => {
                showConfirmModal(loadDefaultSettings);
            });
            log('debug', 'Load default button event listener attached');
        } else {
            log('error', 'Load default button not found');
        }

        // Кнопка загрузки файла
        const uploadFileBtn = document.getElementById('uploadFileBtn');
        const fileInput = document.getElementById('fileInput');
        if (uploadFileBtn && fileInput) {
            uploadFileBtn.addEventListener('click', () => {
                showConfirmModal(() => fileInput.click());
            });

            fileInput.addEventListener('change', handleFileUpload);
            log('debug', 'Upload file button event listeners attached');
        } else {
            log('error', 'Upload file button or file input not found');
        }

        // Кнопка вставки из буфера обмена
        const pasteFromClipboardBtn = document.getElementById('pasteFromClipboardBtn');
        if (pasteFromClipboardBtn) {
            pasteFromClipboardBtn.addEventListener('click', () => {
                showConfirmModal(pasteFromClipboard);
            });
            log('debug', 'Paste from clipboard button event listener attached');
        } else {
            log('error', 'Paste from clipboard button not found');
        }

        // Кнопка копирования в буфер обмена
        const copyToClipboardBtn = document.getElementById('copyToClipboardBtn');
        if (copyToClipboardBtn) {
            copyToClipboardBtn.addEventListener('click', copyToClipboard);
            log('debug', 'Copy to clipboard button event listener attached');
        } else {
            log('error', 'Copy to clipboard button not found');
        }

        // Кнопка скачивания
        const downloadBtn = document.getElementById('downloadBtn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', downloadSettings);
            log('debug', 'Download button event listener attached');
        } else {
            log('error', 'Download button not found');
        }

        // Кнопка помощи
        const helpBtn = document.getElementById('contextHelpBtn');
        if (helpBtn) {
            helpBtn.addEventListener('click', showHelpModal);
            log('debug', 'Help button event listener attached');
        } else {
            log('error', 'Help button not found');
        }

        // Кнопка подтверждения в модальном окне
        const confirmActionBtn = document.getElementById('contextConfirmActionBtn');
        if (confirmActionBtn) {
            confirmActionBtn.addEventListener('click', () => {
                log('debug', 'Confirm action button clicked');
                
                // Выполняем callback сразу
                const callback = window.contextConfirmCallback;
                window.contextConfirmCallback = null;
                
                if (callback && typeof callback === 'function') {
                    try {
                        log('debug', 'Executing callback');
                        callback();
                    } catch (error) {
                        log('error', 'Ошибка выполнения callback:', error);
                    }
                }
            });
            log('debug', 'Confirm action button event listener attached');
        } else {
            log('error', 'Confirm action button not found');
        }
        
        // Проверяем наличие модальных окон
        const confirmModal = document.getElementById('contextConfirmModal');
        const helpModal = document.getElementById('contextHelpModal');
        
        if (confirmModal) {
            log('debug', 'Confirm modal found');
        } else {
            log('error', 'Confirm modal not found');
        }
        
        if (helpModal) {
            log('debug', 'Help modal found');
        } else {
            log('error', 'Help modal not found');
        }
        
        // Устанавливаем флаг, что обработчики настроены
        contextState.listenersAttached = true;
        log('debug', 'Event listeners setup completed');
    }

    /**
     * Показать модальное окно подтверждения
     */
    function showConfirmModal(callback) {
        log('debug', 'showConfirmModal called');
        
        // Сохраняем callback для использования в обработчике
        window.contextConfirmCallback = callback;
        
        const modal = new bootstrap.Modal(document.getElementById('contextConfirmModal'));
        modal.show();
    }

    /**
     * Показать модальное окно помощи
     */
    function showHelpModal() {
        log('debug', 'showHelpModal called');
        
        const modal = new bootstrap.Modal(document.getElementById('contextHelpModal'));
        modal.show();
    }

    /**
     * Загрузка данных из LocalStorage
     */
    function loadDataFromStorage() {
        try {
            const storedData = localStorage.getItem(STORAGE_KEY);
            if (storedData) {
                contextState.currentData = JSON.parse(storedData);
                log('debug', 'Data loaded from LocalStorage:', contextState.currentData);
            } else {
                contextState.currentData = {};
                log('debug', 'No data found in LocalStorage, initialized empty object');
            }
        } catch (error) {
            log('error', 'Error loading data from LocalStorage:', error);
            contextState.currentData = {};
            
            window.eventBus.emit('notification.show.error', {
                message: 'Ошибка загрузки данных из LocalStorage',
                duration: 5000,
                moduleId: 'sidebar-context'
            });
        }
    }

    /**
     * Валидация структуры дерева
     */
    function validateTreeStructure(data) {
        if (!data || !data.elements || !Array.isArray(data.elements)) {
            return { valid: false, errors: ['Отсутствует массив elements'] };
        }

        const elements = data.elements;
        const errors = [];

        // Проверка ограничений
        if (elements.length > MAX_TREE_ELEMENTS) {
            errors.push(`Превышено максимальное количество элементов (${MAX_TREE_ELEMENTS})`);
        }

        // Проверка уникальности ID
        const ids = new Set();
        const duplicateIds = [];
        
        elements.forEach(element => {
            if (ids.has(element.id)) {
                duplicateIds.push(element.id);
            } else {
                ids.add(element.id);
            }
        });

        if (duplicateIds.length > 0) {
            errors.push(`Дублирующиеся ID: ${duplicateIds.join(', ')}`);
        }

        // Проверка существования родительских элементов
        const invalidParents = [];
        elements.forEach(element => {
            if (element.parentid && element.parentid !== 0) {
                if (!ids.has(element.parentid)) {
                    invalidParents.push(`ID ${element.id} ссылается на несуществующий parent ${element.parentid}`);
                }
            }
        });

        if (invalidParents.length > 0) {
            errors.push(...invalidParents);
        }

        // Проверка циклических ссылок
        const cyclicErrors = detectCycles(elements);
        if (cyclicErrors.length > 0) {
            errors.push(...cyclicErrors);
        }

        // Проверка глубины дерева
        const depthErrors = checkTreeDepth(elements);
        if (depthErrors.length > 0) {
            errors.push(...depthErrors);
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Обнаружение циклических ссылок
     */
    function detectCycles(elements) {
        const errors = [];
        const elementMap = new Map();
        
        // Создаем карту элементов
        elements.forEach(element => {
            elementMap.set(element.id, element);
        });

        // Проверяем каждый элемент на циклы
        elements.forEach(element => {
            const visited = new Set();
            const path = [];
            
            if (hasCycle(element.id, elementMap, visited, path)) {
                errors.push(`Обнаружен цикл: ${path.join(' -> ')}`);
            }
        });

        return errors;
    }

    /**
     * Рекурсивная проверка на циклы
     */
    function hasCycle(elementId, elementMap, visited, path) {
        if (visited.has(elementId)) {
            path.push(elementId);
            return true;
        }

        const element = elementMap.get(elementId);
        if (!element || !element.parentid || element.parentid === 0) {
            return false;
        }

        visited.add(elementId);
        path.push(elementId);

        const result = hasCycle(element.parentid, elementMap, visited, path);
        
        if (!result) {
            visited.delete(elementId);
            path.pop();
        }

        return result;
    }

    /**
     * Проверка глубины дерева
     */
    function checkTreeDepth(elements) {
        const errors = [];
        const elementMap = new Map();
        
        // Создаем карту элементов
        elements.forEach(element => {
            elementMap.set(element.id, element);
        });

        // Проверяем глубину для каждого элемента
        elements.forEach(element => {
            const depth = calculateDepth(element.id, elementMap, new Set());
            if (depth > MAX_TREE_DEPTH) {
                errors.push(`Элемент ID ${element.id} превышает максимальную глубину (${MAX_TREE_DEPTH}), текущая глубина: ${depth}`);
            }
        });

        return errors;
    }

    /**
     * Вычисление глубины элемента
     */
    function calculateDepth(elementId, elementMap, visited) {
        if (visited.has(elementId)) {
            return 0; // Избегаем бесконечной рекурсии
        }

        const element = elementMap.get(elementId);
        if (!element || !element.parentid || element.parentid === 0) {
            return 1; // Корневой элемент
        }

        visited.add(elementId);
        const parentDepth = calculateDepth(element.parentid, elementMap, visited);
        visited.delete(elementId);

        return parentDepth + 1;
    }

    /**
     * Построение иерархического дерева
     */
    function buildTree(elements) {
        const elementMap = new Map();
        const rootElements = [];

        // Создаем карту элементов
        elements.forEach(element => {
            elementMap.set(element.id, { ...element, children: [] });
        });

        // Строим дерево
        elements.forEach(element => {
            const treeElement = elementMap.get(element.id);
            
            if (!element.parentid || element.parentid === 0) {
                rootElements.push(treeElement);
            } else {
                const parent = elementMap.get(element.parentid);
                if (parent) {
                    parent.children.push(treeElement);
                }
            }
        });

        // Сортируем элементы по position
        const sortByPosition = (a, b) => (a.position || 0) - (b.position || 0);
        
        rootElements.sort(sortByPosition);
        
        function sortChildren(element) {
            if (element.children && element.children.length > 0) {
                element.children.sort(sortByPosition);
                element.children.forEach(sortChildren);
            }
        }
        
        rootElements.forEach(sortChildren);

        return rootElements;
    }

    /**
     * Отображение дерева
     */
    function renderTree() {
        const container = document.getElementById('contextTreeContainer');
        if (!container) {
            log('error', 'Context tree container not found');
            return;
        }

        try {
            const data = contextState.currentData;
            
            if (!data || !data.elements || data.elements.length === 0) {
                container.innerHTML = `
                    <div class="d-flex flex-column h-100 justify-content-center align-items-center text-center">
                        <div class="mb-4">
                            <i class="bi bi-diagram-3 display-1 text-muted"></i>
                        </div>
                        <h5 class="text-muted mb-3">Дерево контекста пусто</h5>
                        <p class="text-muted mb-4">Загрузите настройки по умолчанию или создайте элементы</p>
                    </div>
                `;
                return;
            }

            // Валидация структуры
            const validation = validateTreeStructure(data);
            if (!validation.valid) {
                container.innerHTML = `
                    <div class="alert alert-danger" role="alert">
                        <h6><i class="bi bi-exclamation-triangle me-2"></i>Ошибки в структуре дерева:</h6>
                        <ul class="mb-0">
                            ${validation.errors.map(error => `<li>${error}</li>`).join('')}
                        </ul>
                    </div>
                `;
                return;
            }

            // Строим и отображаем дерево
            const tree = buildTree(data.elements);
            container.innerHTML = renderTreeNodes(tree);
            
            // Подключаем обработчики событий
            attachTreeEventListeners();
            
            log('debug', 'Tree rendered successfully');
            
        } catch (error) {
            log('error', 'Error rendering tree:', error);
            container.innerHTML = `
                <div class="alert alert-danger" role="alert">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    Ошибка отображения дерева: ${error.message}
                </div>
            `;
        }
    }

    /**
     * Отображение узлов дерева
     */
    function renderTreeNodes(nodes, level = 0) {
        if (!nodes || nodes.length === 0) {
            return '';
        }

        return nodes.map(node => {
            const hasChildren = node.children && node.children.length > 0;
            const indent = level * 20;
            
            // Определяем состояние развертывания по умолчанию
            // Только уровень 0 (первый) - развернут
            // Уровень 1 и глубже (второй и далее) - свернуты
            const isExpanded = level === 0;
            const chevronClass = isExpanded ? 'bi-chevron-down' : 'bi-chevron-right';
            
            return `
                <div class="tree-node" data-id="${node.id}" style="margin-left: ${indent}px;">
                    <div class="d-flex align-items-center py-2 px-2 border-bottom tree-item"
                         style="cursor: pointer; border-radius: 4px;">
                        
                        <!-- Expand/Collapse button -->
                        ${hasChildren ? `
                            <button class="btn btn-sm btn-link p-0 me-2 tree-toggle"
                                    data-id="${node.id}"
                                    title="${hasChildren ? 'Развернуть/Свернуть' : ''}">
                                <i class="${chevronClass}"></i>
                            </button>
                        ` : '<span class="me-4"></span>'}
                        
                        <!-- Checkbox -->
                        ${node.is_check ? `
                            <div class="form-check me-2">
                                <input class="form-check-input tree-checkbox"
                                       type="checkbox"
                                       data-id="${node.id}"
                                       ${node.is_checked ? 'checked' : ''}
                                       ${node.is_check_lock !== '' ? 'disabled' : ''}
                                       title="${node.is_check_lock !== '' ? 'Вы не можете изменить чек-бокс, заблокировано Администратором' : ''}">
                            </div>
                        ` : ''}
                        
                        <!-- Icon -->
                        ${node.icon ? `
                            <i class="${node.icon} me-2" style="width: 16px;"></i>
                        ` : ''}
                        
                        <!-- Name -->
                        <span class="flex-grow-1 tree-name"
                              title="${node.description || ''}"
                              data-id="${node.id}">
                            ${node.name}
                        </span>
                        
                        <!-- Action buttons -->
                        <div class="tree-actions ms-2">
                            ${node.iife_view ? `
                                <button class="btn btn-sm btn-link text-muted p-1 tree-view-btn"
                                        data-id="${node.id}"
                                        title="Просмотр"
                                        style="margin-right: 2px;">
                                    <i class="bi bi-eye"></i>
                                </button>
                            ` : ''}
                            
                            ${node.iife_edit ? `
                                <button class="btn btn-sm btn-link text-muted p-1 tree-edit-btn"
                                        data-id="${node.id}"
                                        title="Редактирование"
                                        style="margin-right: 2px;">
                                    <i class="bi bi-pencil"></i>
                                </button>
                            ` : ''}
                            
                            ${node.element_settings ? `
                                <button class="btn btn-sm btn-link text-muted p-1 tree-settings-btn"
                                        data-id="${node.id}"
                                        title="Настройки элемента">
                                    <i class="bi bi-gear"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                    
                    <!-- Children -->
                    ${hasChildren ? `
                        <div class="tree-children" data-parent-id="${node.id}" style="display: ${isExpanded ? 'block' : 'none'};">
                            ${renderTreeNodes(node.children, level + 1)}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    /**
     * Подключение обработчиков событий для дерева
     */
    function attachTreeEventListeners() {
        const container = document.getElementById('contextTreeContainer');
        if (!container) return;

        // Удаляем старые обработчики событий
        const newContainer = container.cloneNode(true);
        container.parentNode.replaceChild(newContainer, container);
        const refreshedContainer = document.getElementById('contextTreeContainer');

        // Обработчик для кнопок развертывания/свертывания
        refreshedContainer.addEventListener('click', function(e) {
            if (e.target.closest('.tree-toggle')) {
                e.preventDefault();
                e.stopPropagation();
                
                const button = e.target.closest('.tree-toggle');
                const nodeId = button.dataset.id;
                const childrenContainer = container.querySelector(`.tree-children[data-parent-id="${nodeId}"]`);
                const icon = button.querySelector('i');
                
                if (childrenContainer) {
                    const isExpanded = childrenContainer.style.display !== 'none';
                    
                    if (isExpanded) {
                        childrenContainer.style.display = 'none';
                        icon.className = 'bi bi-chevron-right';
                    } else {
                        childrenContainer.style.display = 'block';
                        icon.className = 'bi bi-chevron-down';
                    }
                }
            }
        });

        // Обработчик для чекбоксов
        refreshedContainer.addEventListener('change', function(e) {
            if (e.target.classList.contains('tree-checkbox')) {
                const nodeId = parseInt(e.target.dataset.id);
                const isChecked = e.target.checked;
                
                updateElementCheckState(nodeId, isChecked);
            }
        });

        // Обработчик для кнопки просмотра
        refreshedContainer.addEventListener('click', function(e) {
            if (e.target.closest('.tree-view-btn')) {
                e.preventDefault();
                e.stopPropagation();
                
                const button = e.target.closest('.tree-view-btn');
                const nodeId = parseInt(button.dataset.id);
                
                handleViewElement(nodeId);
            }
        });

        // Обработчик для кнопки редактирования
        refreshedContainer.addEventListener('click', function(e) {
            if (e.target.closest('.tree-edit-btn')) {
                e.preventDefault();
                e.stopPropagation();
                
                const button = e.target.closest('.tree-edit-btn');
                const nodeId = parseInt(button.dataset.id);
                
                handleEditElement(nodeId);
            }
        });

        // Обработчик для кнопки настроек
        refreshedContainer.addEventListener('click', function(e) {
            if (e.target.closest('.tree-settings-btn')) {
                e.preventDefault();
                e.stopPropagation();
                
                const button = e.target.closest('.tree-settings-btn');
                const nodeId = parseInt(button.dataset.id);
                
                handleElementSettings(nodeId);
            }
        });
    }

    /**
     * Обновление состояния чекбокса элемента
     */
    function updateElementCheckState(nodeId, isChecked) {
        try {
            const data = contextState.currentData;
            if (!data || !data.elements) return;

            const element = data.elements.find(el => el.id === nodeId);
            if (element) {
                element.is_checked = isChecked;
                saveDataToStorage(data);
                
                log('debug', `Checkbox state updated for element ${nodeId}: ${isChecked}`);
                
                // Отправляем событие об изменении состояния
                window.eventBus.emit('context.element.checkbox.changed', {
                    elementId: nodeId,
                    isChecked: isChecked,
                    element: element
                });
            }
        } catch (error) {
            log('error', 'Error updating checkbox state:', error);
        }
    }

    /**
     * Обработка просмотра элемента
     */
    function handleViewElement(nodeId) {
        try {
            const data = contextState.currentData;
            if (!data || !data.elements) return;

            const element = data.elements.find(el => el.id === nodeId);
            if (!element || !element.iife_view) return;

            log('debug', `Opening view for element ${nodeId} with module: ${element.iife_view}`);

            // Отправляем EventBus сообщение если есть
            if (element.eventbus_message) {
                try {
                    const message = JSON.parse(element.eventbus_message);
                    if (message.eventName) {
                        window.eventBus.emit(message.eventName, message.data || {});
                    }
                } catch (error) {
                    log('error', 'Error parsing eventbus message:', error);
                }
            }

            // Открываем модальное окно с IIFE модулем
            openIifeModal(element, 'view');

        } catch (error) {
            log('error', 'Error handling view element:', error);
        }
    }

    /**
     * Обработка редактирования элемента
     */
    function handleEditElement(nodeId) {
        try {
            const data = contextState.currentData;
            if (!data || !data.elements) return;

            const element = data.elements.find(el => el.id === nodeId);
            if (!element || !element.iife_edit) return;

            log('debug', `Opening edit for element ${nodeId} with module: ${element.iife_edit}`);

            // Отправляем EventBus сообщение если есть
            if (element.eventbus_message) {
                try {
                    const message = JSON.parse(element.eventbus_message);
                    if (message.eventName) {
                        window.eventBus.emit(message.eventName, message.data || {});
                    }
                } catch (error) {
                    log('error', 'Error parsing eventbus message:', error);
                }
            }

            // Открываем модальное окно с IIFE модулем
            openIifeModal(element, 'edit');

        } catch (error) {
            log('error', 'Error handling edit element:', error);
        }
    }

    /**
     * Обработка настроек элемента
     */
    function handleElementSettings(nodeId) {
        try {
            const data = contextState.currentData;
            if (!data || !data.elements) return;

            const element = data.elements.find(el => el.id === nodeId);
            if (!element) return;

            log('debug', `Opening settings for element ${nodeId}`);

            // Проверяем, что модуль редактора элементов загружен
            if (typeof window.elementTreeEditor === 'undefined') {
                // Загружаем модуль редактора элементов
                loadElementTreeEditor(() => {
                    openElementEditor(element);
                });
            } else {
                openElementEditor(element);
            }

        } catch (error) {
            log('error', 'Error handling element settings:', error);
        }
    }

    /**
     * Загрузка модуля редактора элементов дерева
     */
    function loadElementTreeEditor(callback) {
        const script = document.createElement('script');
        script.src = '/static/chat/sidebar/plugins/editor-element-tree.js';
        script.onload = callback;
        script.onerror = () => {
            log('error', 'Failed to load element tree editor module');
            window.eventBus.emit('notification.show.error', {
                message: 'Ошибка загрузки модуля редактирования элементов',
                duration: 5000,
                moduleId: 'sidebar-context'
            });
        };
        document.head.appendChild(script);
    }

    /**
     * Открытие редактора элемента
     */
    function openElementEditor(element) {
        if (typeof window.elementTreeEditor !== 'undefined') {
            window.elementTreeEditor.open(element, (updatedElement) => {
                saveElementChanges(updatedElement);
            });
        }
    }

    /**
     * Сохранение изменений элемента
     */
    function saveElementChanges(updatedElement) {
        try {
            const data = contextState.currentData;
            if (!data || !data.elements) return;

            const elementIndex = data.elements.findIndex(el => el.id === updatedElement.id);
            if (elementIndex !== -1) {
                // Сохраняем состояние развертывания дерева перед обновлением
                const expandedState = saveTreeExpandedState();
                
                data.elements[elementIndex] = updatedElement;
                
                if (saveDataToStorage(data)) {
                    renderTree(); // Перерисовываем дерево
                    
                    // Восстанавливаем состояние развертывания после перерисовки
                    setTimeout(() => {
                        restoreTreeExpandedState(expandedState);
                    }, 50);
                    
                    window.eventBus.emit('notification.show.success', {
                        message: 'Элемент дерева обновлен',
                        duration: 3000,
                        moduleId: 'sidebar-context'
                    });
                    
                    log('debug', 'Element updated:', updatedElement);
                }
            }
        } catch (error) {
            log('error', 'Error saving element changes:', error);
            
            window.eventBus.emit('notification.show.error', {
                message: 'Ошибка сохранения изменений элемента',
                duration: 5000,
                moduleId: 'sidebar-context'
            });
        }
    }

    /**
     * Сохранение состояния развертывания дерева
     */
    function saveTreeExpandedState() {
        const container = document.getElementById('contextTreeContainer');
        if (!container) return {};

        const expandedState = {};
        const childrenContainers = container.querySelectorAll('.tree-children');
        
        childrenContainers.forEach(childContainer => {
            const parentId = childContainer.dataset.parentId;
            const isExpanded = childContainer.style.display === 'block';
            if (parentId) {
                expandedState[parentId] = isExpanded;
            }
        });

        return expandedState;
    }

    /**
     * Восстановление состояния развертывания дерева
     */
    function restoreTreeExpandedState(expandedState) {
        const container = document.getElementById('contextTreeContainer');
        if (!container || !expandedState) return;

        Object.keys(expandedState).forEach(parentId => {
            const isExpanded = expandedState[parentId];
            const childrenContainer = container.querySelector(`.tree-children[data-parent-id="${parentId}"]`);
            const toggleButton = container.querySelector(`.tree-toggle[data-id="${parentId}"]`);
            
            if (childrenContainer && toggleButton) {
                childrenContainer.style.display = isExpanded ? 'block' : 'none';
                const icon = toggleButton.querySelector('i');
                if (icon) {
                    icon.className = isExpanded ? 'bi bi-chevron-down' : 'bi bi-chevron-right';
                }
            }
        });
    }

    /**
     * Открытие модального окна с IIFE модулем
     */
    function openIifeModal(element, mode) {
        const moduleName = mode === 'view' ? element.iife_view : element.iife_edit;
        log('debug', `Opening IIFE modal for element ${element.id} in ${mode} mode with module: ${moduleName}`);
        
        // Определяем какой модуль загружать
        let moduleScript = '';
        let moduleObject = '';
        
        if (moduleName === 'viewer-md') {
            moduleScript = '/static/chat/sidebar/plugins/viewer-md.js';
            moduleObject = 'markdownViewer';
        } else if (moduleName === 'editor-md') {
            moduleScript = '/static/chat/sidebar/plugins/editor-md.js';
            moduleObject = 'markdownEditor';
        } else {
            // Для неизвестных модулей показываем уведомление
            window.eventBus.emit('notification.show.warning', {
                message: `Модуль "${moduleName}" не найден или не поддерживается`,
                duration: 5000,
                moduleId: 'sidebar-context'
            });
            return;
        }
        
        // Проверяем, загружен ли модуль
        if (typeof window[moduleObject] !== 'undefined') {
            // Модуль уже загружен, открываем его
            if (mode === 'view') {
                window[moduleObject].open(element);
            } else {
                window[moduleObject].open(element, (updatedElement) => {
                    saveElementChanges(updatedElement);
                });
            }
        } else {
            // Загружаем модуль
            loadIifeModule(moduleScript, () => {
                if (typeof window[moduleObject] !== 'undefined') {
                    if (mode === 'view') {
                        window[moduleObject].open(element);
                    } else {
                        window[moduleObject].open(element, (updatedElement) => {
                            saveElementChanges(updatedElement);
                        });
                    }
                } else {
                    window.eventBus.emit('notification.show.error', {
                        message: `Ошибка загрузки модуля "${moduleName}"`,
                        duration: 5000,
                        moduleId: 'sidebar-context'
                    });
                }
            });
        }
    }

    /**
     * Загрузка IIFE модуля
     */
    function loadIifeModule(scriptPath, callback) {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.onload = callback;
        script.onerror = () => {
            log('error', `Failed to load IIFE module: ${scriptPath}`);
            window.eventBus.emit('notification.show.error', {
                message: `Ошибка загрузки модуля: ${scriptPath}`,
                duration: 5000,
                moduleId: 'sidebar-context'
            });
        };
        document.head.appendChild(script);
    }

    /**
     * Сохранение данных в LocalStorage
     */
    function saveDataToStorage(data) {
        try {
            // Валидация JSON
            if (typeof data === 'string') {
                JSON.parse(data); // Проверяем, что это валидный JSON
                localStorage.setItem(STORAGE_KEY, data);
                contextState.currentData = JSON.parse(data);
            } else {
                const jsonString = JSON.stringify(data, null, 2);
                localStorage.setItem(STORAGE_KEY, jsonString);
                contextState.currentData = data;
            }
            
            log('debug', 'Data saved to LocalStorage:', contextState.currentData);
            return true;
        } catch (error) {
            log('error', 'Error saving data to LocalStorage:', error);
            
            window.eventBus.emit('notification.show.error', {
                message: 'Ошибка сохранения данных: неверный формат JSON',
                duration: 5000,
                moduleId: 'sidebar-context'
            });
            return false;
        }
    }

    /**
     * Загрузка настроек по умолчанию
     */
    async function loadDefaultSettings() {
        try {
            const response = await fetch(DEFAULT_SETTINGS_PATH);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.text();
            if (!data.trim()) {
                throw new Error('Файл настроек пуст');
            }

            if (saveDataToStorage(data)) {
                window.eventBus.emit('notification.show.success', {
                    message: 'Содержимое из заводских настроек по умолчанию загружено в LocalStorage',
                    duration: 5000,
                    moduleId: 'sidebar-context'
                });
            }
        } catch (error) {
            log('error', 'Error loading default settings:', error);
            
            // Определяем тип ошибки для более точного сообщения
            let errorMessage = 'Не удалось загрузить настройки по умолчанию';
            if (error.message.includes('404') || error.message.includes('HTTP error')) {
                errorMessage += ': файл не найден';
            } else if (error.message.includes('пуст')) {
                errorMessage += ': файл пуст';
            } else {
                errorMessage += ': ' + error.message;
            }
            
            window.eventBus.emit('notification.show.error', {
                message: errorMessage,
                duration: 5000,
                moduleId: 'sidebar-context'
            });
        }
    }

    /**
     * Обработка загрузки файла
     */
    function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const content = e.target.result;
                if (saveDataToStorage(content)) {
                    window.eventBus.emit('notification.show.success', {
                        message: 'Конфигурация загружена в LocalStorage',
                        duration: 5000,
                        moduleId: 'sidebar-context'
                    });
                }
            } catch (error) {
                log('error', 'Error reading file:', error);
                
                window.eventBus.emit('notification.show.error', {
                    message: 'Ошибка чтения файла',
                    duration: 5000,
                    moduleId: 'sidebar-context'
                });
            }
        };

        reader.onerror = function() {
            log('error', 'File reading error');
            
            window.eventBus.emit('notification.show.error', {
                message: 'Ошибка чтения файла',
                duration: 5000,
                moduleId: 'sidebar-context'
            });
        };

        reader.readAsText(file);
        
        // Очищаем input для возможности повторной загрузки того же файла
        event.target.value = '';
    }

    /**
     * Вставка из буфера обмена
     */
    async function pasteFromClipboard() {
        try {
            if (!navigator.clipboard) {
                throw new Error('Clipboard API не поддерживается');
            }

            const text = await navigator.clipboard.readText();
            if (!text.trim()) {
                throw new Error('Буфер обмена пуст');
            }

            if (saveDataToStorage(text)) {
                renderTree(); // Перерисовываем дерево после загрузки
                window.eventBus.emit('notification.show.success', {
                    message: 'Содержимое из буфера обмена загружено в LocalStorage',
                    duration: 5000,
                    moduleId: 'sidebar-context'
                });
            }
        } catch (error) {
            log('error', 'Error pasting from clipboard:', error);
            
            window.eventBus.emit('notification.show.warning', {
                message: 'Не удалось вставить из буфера обмена: содержимое пустое или недоступно',
                duration: 5000,
                moduleId: 'sidebar-context'
            });
        }
    }

    /**
     * Копирование в буфер обмена
     */
    async function copyToClipboard() {
        try {
            const data = localStorage.getItem(STORAGE_KEY) || '{}';
            
            if (!navigator.clipboard) {
                throw new Error('Clipboard API не поддерживается');
            }

            await navigator.clipboard.writeText(data);
            
            window.eventBus.emit('notification.show.success', {
                message: 'Содержимое скопировано в буфер обмена',
                duration: 5000,
                moduleId: 'sidebar-context'
            });
        } catch (error) {
            log('error', 'Error copying to clipboard:', error);
            
            window.eventBus.emit('notification.show.error', {
                message: 'Ошибка копирования в буфер обмена',
                duration: 5000,
                moduleId: 'sidebar-context'
            });
        }
    }

    /**
     * Скачивание настроек в файл
     */
    function downloadSettings() {
        try {
            const data = localStorage.getItem(STORAGE_KEY) || '{}';
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            // Создаем имя файла с текущей датой и временем
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            
            const filename = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}_context-settings.json`;
            
            // Создаем временную ссылку для скачивания
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            window.eventBus.emit('notification.show.success', {
                message: 'Файл скачан',
                duration: 5000,
                moduleId: 'sidebar-context'
            });
        } catch (error) {
            log('error', 'Error downloading settings:', error);
            
            window.eventBus.emit('notification.show.error', {
                message: 'Ошибка скачивания файла',
                duration: 5000,
                moduleId: 'sidebar-context'
            });
        }
    }

    /**
     * Развертывание узла дерева
     */
    function expandTreeNode(nodeId) {
        const container = document.getElementById('contextTreeContainer');
        if (!container) return;

        const childrenContainer = container.querySelector(`.tree-children[data-parent-id="${nodeId}"]`);
        const toggleButton = container.querySelector(`.tree-toggle[data-id="${nodeId}"]`);
        
        if (childrenContainer && toggleButton) {
            childrenContainer.style.display = 'block';
            const icon = toggleButton.querySelector('i');
            if (icon) {
                icon.className = 'bi bi-chevron-down';
            }
            log('debug', `Node ${nodeId} expanded`);
        }
    }

    /**
     * Свертывание узла дерева
     */
    function collapseTreeNode(nodeId) {
        const container = document.getElementById('contextTreeContainer');
        if (!container) return;

        const childrenContainer = container.querySelector(`.tree-children[data-parent-id="${nodeId}"]`);
        const toggleButton = container.querySelector(`.tree-toggle[data-id="${nodeId}"]`);
        
        if (childrenContainer && toggleButton) {
            childrenContainer.style.display = 'none';
            const icon = toggleButton.querySelector('i');
            if (icon) {
                icon.className = 'bi bi-chevron-right';
            }
            log('debug', `Node ${nodeId} collapsed`);
        }
    }

    /**
     * Настройка слушателей EventBus
     */
    function setupEventBusListeners() {
        // Слушаем команду загрузки модуля контекста
        window.eventBus.on('sidebar.module.load', (data) => {
            if (data.module === 'context') {
                initializeContext();
            } else if (contextState.isActive) {
                contextState.isActive = false;
                // Очищаем модальные окна при переключении на другой модуль
                cleanupModals();
            }
        });

        // Слушаем команды для функционала дерева
        window.eventBus.on('context.tree.refresh', () => {
            log('debug', 'Context tree refresh requested');
            
            // Сохраняем состояние развертывания дерева перед обновлением
            const expandedState = saveTreeExpandedState();
            
            renderTree();
            
            // Восстанавливаем состояние развертывания после перерисовки
            setTimeout(() => {
                restoreTreeExpandedState(expandedState);
            }, 50);
        });

        window.eventBus.on('context.tree.expand', (data) => {
            log('debug', 'Context tree expand requested:', data);
            if (data.nodeId) {
                expandTreeNode(data.nodeId);
            }
        });

        window.eventBus.on('context.tree.collapse', (data) => {
            log('debug', 'Context tree collapse requested:', data);
            if (data.nodeId) {
                collapseTreeNode(data.nodeId);
            }
        });
    }

    // Экспорт функций для использования в других модулях
    window.sidebarContextModule = {
        isInitialized: () => contextState.initialized,
        isActive: () => contextState.isActive,
        getCurrentData: () => contextState.currentData,
        loadDefaultSettings: loadDefaultSettings,
        saveData: saveDataToStorage,
        loadData: loadDataFromStorage,
        // Функции для работы с деревом
        refreshTree: () => {
            log('debug', 'refreshTree called');
            renderTree();
        },
        expandNode: (nodeId) => {
            log('debug', 'expandNode called:', nodeId);
            expandTreeNode(nodeId);
        },
        collapseNode: (nodeId) => {
            log('debug', 'collapseNode called:', nodeId);
            collapseTreeNode(nodeId);
        },
        validateTree: () => {
            const data = contextState.currentData;
            return data ? validateTreeStructure(data) : { valid: false, errors: ['Нет данных'] };
        },
        renderTree: renderTree
    };

})();