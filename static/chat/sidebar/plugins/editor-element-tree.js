/**
 * Модуль редактирования элемента дерева контекста (IIFE)
 */
(function() {
    'use strict';

    // Уровень логирования модуля
    const LOG_LEVEL = 'debug';

    // Функция логирования с проверкой уровня
    function log(level, message, ...args) {
        const levels = { debug: 0, warn: 1, error: 2 };
        if (levels[level] >= levels[LOG_LEVEL]) {
            console[level](`[editor-element-tree] ${message}`, ...args);
        }
    }

    // Состояние модуля
    const editorState = {
        currentElement: null,
        modalInstance: null,
        onSaveCallback: null
    };

    /**
     * Открытие редактора элемента дерева
     * @param {Object} element - Элемент для редактирования
     * @param {Function} onSave - Callback для сохранения
     */
    function openEditor(element, onSave) {
        log('debug', 'Opening element editor for:', element);
        
        // Проверяем существующее модальное окно в DOM
        const existingModal = document.getElementById('elementTreeEditorModal');
        if (existingModal) {
            const existingModalInstance = bootstrap.Modal.getInstance(existingModal);
            if (existingModalInstance && existingModal.classList.contains('show')) {
                log('debug', 'Modal is currently visible, ignoring request');
                return;
            }
        }
        
        editorState.currentElement = JSON.parse(JSON.stringify(element)); // Глубокая копия
        editorState.onSaveCallback = onSave;
        
        createModal();
        showModal();
    }

    /**
     * Создание модального окна редактора
     */
    function createModal() {
        // Удаляем существующее модальное окно если есть
        const existingModal = document.getElementById('elementTreeEditorModal');
        if (existingModal) {
            // Закрываем модальное окно если оно открыто
            const modalInstance = bootstrap.Modal.getInstance(existingModal);
            if (modalInstance) {
                modalInstance.hide();
            }
            existingModal.remove();
        }

        const modalHTML = `
            <div class="modal fade" id="elementTreeEditorModal" tabindex="-1" aria-labelledby="elementTreeEditorModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-lg" style="height: 96vh; max-height: 96vh;">
                    <div class="modal-content" style="height: 100%;">
                        <div class="modal-header">
                            <h5 class="modal-title" id="elementTreeEditorModalLabel">
                                <i class="bi bi-gear me-2"></i>
                                Редактирование элемента дерева
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body" style="overflow-y: auto; flex: 1;">
                            ${createFormHTML()}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отменить</button>
                            <button type="button" class="btn btn-primary" id="saveElementBtn">Сохранить и закрыть</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        setupEventListeners();
    }

    /**
     * Создание HTML формы редактирования
     */
    function createFormHTML() {
        const element = editorState.currentElement;
        
        return `
            <form id="elementEditForm" class="needs-validation" novalidate>
                <div class="row">
                    <!-- ID, Parent ID, Позиция и Иконка на одной строке -->
                    <div class="col-md-3">
                        <div class="mb-3">
                            <label for="elementId" class="form-label">
                                ID <span class="text-danger">*</span>
                                <i class="bi bi-question-circle text-muted" title="Уникальный идентификатор элемента (целое число)"></i>
                            </label>
                            <input type="number" class="form-control" id="elementId" value="${element.id || ''}" required min="1">
                            <div class="invalid-feedback">Введите корректный ID (положительное число)</div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="mb-3">
                            <label for="elementParentId" class="form-label">
                                Parent ID
                                <i class="bi bi-question-circle text-muted" title="ID родительского элемента (0 или null для корневых элементов)"></i>
                            </label>
                            <input type="number" class="form-control" id="elementParentId" value="${element.parentid || 0}" min="0">
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="mb-3">
                            <label for="elementPosition" class="form-label">
                                Позиция
                                <i class="bi bi-question-circle text-muted" title="Порядок сортировки (чем меньше число, тем выше в списке)"></i>
                            </label>
                            <input type="number" class="form-control" id="elementPosition" value="${element.position || 100}" min="0">
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="mb-3">
                            <label for="elementIcon" class="form-label">
                                Иконка
                                <i class="bi bi-question-circle text-muted" title="Имя иконки Bootstrap (bi-*) или Font Awesome (fa-*, fas fa-*, fab fa-*)"></i>
                            </label>
                            <input type="text" class="form-control" id="elementIcon" value="${element.icon || ''}" placeholder="bi-folder, fa-home, fas fa-star">
                        </div>
                    </div>
                </div>

                <!-- Name -->
                <div class="mb-3">
                    <label for="elementName" class="form-label">
                        Название <span class="text-danger">*</span>
                        <i class="bi bi-question-circle text-muted" title="Отображаемое название элемента в дереве"></i>
                    </label>
                    <input type="text" class="form-control" id="elementName" value="${element.name || ''}" required maxlength="255">
                    <div class="invalid-feedback">Введите название элемента</div>
                </div>

                <!-- Description -->
                <div class="mb-3">
                    <label for="elementDescription" class="form-label">
                        Описание
                        <i class="bi bi-question-circle text-muted" title="Описание элемента (отображается при наведении)"></i>
                    </label>
                    <textarea class="form-control" id="elementDescription" rows="2" maxlength="500">${element.description || ''}</textarea>
                </div>

                <!-- Checkbox settings -->
                <div class="row">
                    <div class="col-md-4">
                        <div class="mb-3">
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" id="elementIsCheck" ${element.is_check ? 'checked' : ''}>
                                <label class="form-check-label" for="elementIsCheck">
                                    Показать чекбокс
                                    <i class="bi bi-question-circle text-muted" title="Отображать ли чекбокс для выбора элемента"></i>
                                </label>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="mb-3">
                            <label for="elementCheckLock" class="form-label">
                                Блокировка чекбокса
                                <i class="bi bi-question-circle text-muted" title="Пустое - не блокировать, 0 - заблокировать снятым, 1 - заблокировать отмеченным"></i>
                            </label>
                            <select class="form-select" id="elementCheckLock">
                                <option value="" ${element.is_check_lock === '' ? 'selected' : ''}>Не блокировать</option>
                                <option value="0" ${element.is_check_lock === 0 ? 'selected' : ''}>Заблокировать снятым</option>
                                <option value="1" ${element.is_check_lock === 1 ? 'selected' : ''}>Заблокировать отмеченным</option>
                            </select>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="mb-3">
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" id="elementIsChecked" ${element.is_checked ? 'checked' : ''}>
                                <label class="form-check-label" for="elementIsChecked">
                                    Отмечен
                                    <i class="bi bi-question-circle text-muted" title="Состояние чекбокса (отмечен/не отмечен)"></i>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Prompt -->
                <div class="mb-3">
                    <label for="elementPrompt" class="form-label">
                        Промпт для LLM
                        <i class="bi bi-question-circle text-muted" title="Текст промпта, который будет передан в контекст LLM"></i>
                    </label>
                    <textarea class="form-control" id="elementPrompt" rows="3">${element.prompt || ''}</textarea>
                </div>

                <!-- IIFE modules -->
                <div class="row">
                    <div class="col-md-6">
                        <div class="mb-3">
                            <label for="elementIifeView" class="form-label">
                                IIFE модуль просмотра
                                <i class="bi bi-question-circle text-muted" title="Название IIFE модуля для просмотра (например, viewer-md)"></i>
                            </label>
                            <input type="text" class="form-control" id="elementIifeView" value="${element.iife_view || ''}" placeholder="viewer-md">
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="mb-3">
                            <label for="elementIifeEdit" class="form-label">
                                IIFE модуль редактирования
                                <i class="bi bi-question-circle text-muted" title="Название IIFE модуля для редактирования (например, editor-md)"></i>
                            </label>
                            <input type="text" class="form-control" id="elementIifeEdit" value="${element.iife_edit || ''}" placeholder="editor-md">
                        </div>
                    </div>
                </div>

                <!-- Form URL -->
                <div class="mb-3">
                    <label for="elementFormUrl" class="form-label">
                        URL формы
                        <i class="bi bi-question-circle text-muted" title="URL расположения формы FormIO.js для модулей редактирования"></i>
                    </label>
                    <input type="url" class="form-control" id="elementFormUrl" value="${element.form_url || ''}" placeholder="/forms/example.json">
                </div>

                <!-- EventBus message -->
                <div class="mb-3">
                    <label for="elementEventbusMessage" class="form-label">
                        Сообщение EventBus
                        <i class="bi bi-question-circle text-muted" title="JSON команда для EventBus (отправляется при клике на кнопки просмотра/редактирования)"></i>
                    </label>
                    <textarea class="form-control" id="elementEventbusMessage" rows="2" placeholder='{"eventName": "module.editor.switchTab", "data": {"tab": "edit", "delay": 300}}'>${element.eventbus_message || ''}</textarea>
                    <div class="form-text">Формат: JSON объект с полями eventName и data</div>
                </div>

                <!-- Element settings -->
                <div class="mb-3">
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" id="elementSettings" ${element.element_settings ? 'checked' : ''}>
                        <label class="form-check-label" for="elementSettings">
                            Показать кнопку настроек
                            <i class="bi bi-question-circle text-muted" title="Отображать ли кнопку шестеренки для редактирования элемента"></i>
                        </label>
                    </div>
                </div>
            </form>
        `;
    }

    /**
     * Настройка обработчиков событий
     */
    function setupEventListeners() {
        const saveBtn = document.getElementById('saveElementBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', handleSave);
        }

        // Валидация JSON для EventBus сообщения
        const eventbusInput = document.getElementById('elementEventbusMessage');
        if (eventbusInput) {
            eventbusInput.addEventListener('blur', validateEventbusMessage);
        }
    }

    /**
     * Валидация EventBus сообщения
     */
    function validateEventbusMessage() {
        const input = document.getElementById('elementEventbusMessage');
        const value = input.value.trim();
        
        if (value && value !== '') {
            try {
                const parsed = JSON.parse(value);
                if (!parsed.eventName) {
                    throw new Error('Отсутствует поле eventName');
                }
                input.classList.remove('is-invalid');
                input.classList.add('is-valid');
            } catch (error) {
                input.classList.remove('is-valid');
                input.classList.add('is-invalid');
                
                // Показываем ошибку
                let feedback = input.parentNode.querySelector('.invalid-feedback');
                if (!feedback) {
                    feedback = document.createElement('div');
                    feedback.className = 'invalid-feedback';
                    input.parentNode.appendChild(feedback);
                }
                feedback.textContent = `Некорректный JSON: ${error.message}`;
            }
        } else {
            input.classList.remove('is-invalid', 'is-valid');
        }
    }

    /**
     * Обработка сохранения
     */
    function handleSave() {
        const form = document.getElementById('elementEditForm');
        
        // Валидация формы
        if (!form.checkValidity()) {
            form.classList.add('was-validated');
            return;
        }

        // Валидация EventBus сообщения
        validateEventbusMessage();
        const eventbusInput = document.getElementById('elementEventbusMessage');
        if (eventbusInput.classList.contains('is-invalid')) {
            return;
        }

        // Собираем данные формы
        const updatedElement = {
            id: parseInt(document.getElementById('elementId').value),
            parentid: parseInt(document.getElementById('elementParentId').value) || 0,
            position: parseInt(document.getElementById('elementPosition').value) || 100,
            icon: document.getElementById('elementIcon').value.trim(),
            name: document.getElementById('elementName').value.trim(),
            description: document.getElementById('elementDescription').value.trim(),
            is_check: document.getElementById('elementIsCheck').checked,
            is_check_lock: document.getElementById('elementCheckLock').value === '' ? '' : parseInt(document.getElementById('elementCheckLock').value),
            is_checked: document.getElementById('elementIsChecked').checked,
            prompt: document.getElementById('elementPrompt').value.trim(),
            iife_view: document.getElementById('elementIifeView').value.trim(),
            iife_edit: document.getElementById('elementIifeEdit').value.trim(),
            form_url: document.getElementById('elementFormUrl').value.trim(),
            eventbus_message: document.getElementById('elementEventbusMessage').value.trim(),
            element_settings: document.getElementById('elementSettings').checked
        };

        log('debug', 'Saving element:', updatedElement);

        // Вызываем callback для сохранения
        if (editorState.onSaveCallback) {
            editorState.onSaveCallback(updatedElement);
        }

        // Закрываем модальное окно
        hideModal();
    }

    /**
     * Показать модальное окно
     */
    function showModal() {
        const modalElement = document.getElementById('elementTreeEditorModal');
        editorState.modalInstance = new bootstrap.Modal(modalElement);
        
        // Добавляем обработчик события закрытия модального окна
        modalElement.addEventListener('hidden.bs.modal', function() {
            // Сбрасываем состояние при закрытии
            editorState.modalInstance = null;
            editorState.currentElement = null;
            editorState.onSaveCallback = null;
            
            // Уведомляем context.js о необходимости перерисовки дерева
            if (window.eventBus) {
                window.eventBus.emit('context.tree.refresh');
            }
        });
        
        editorState.modalInstance.show();
    }

    /**
     * Скрыть модальное окно
     */
    function hideModal() {
        if (editorState.modalInstance) {
            editorState.modalInstance.hide();
            editorState.modalInstance = null;
        }
    }

    /**
     * Очистка модуля
     */
    function cleanup() {
        const modal = document.getElementById('elementTreeEditorModal');
        if (modal) {
            if (editorState.modalInstance) {
                editorState.modalInstance.hide();
                editorState.modalInstance = null;
            }
            modal.remove();
        }
        
        editorState.currentElement = null;
        editorState.modalInstance = null;
        editorState.onSaveCallback = null;
    }

    // Экспорт функций для использования в других модулях
    window.elementTreeEditor = {
        open: openEditor,
        cleanup: cleanup
    };

    // Уведомляем о готовности модуля
    document.addEventListener('DOMContentLoaded', function() {
        window.eventBus.emit('module.editor-element-tree.ready', {
            timestamp: Date.now(),
            moduleId: 'editor-element-tree'
        });
    });

})();