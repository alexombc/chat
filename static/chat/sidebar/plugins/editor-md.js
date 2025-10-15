/**
 * Модуль редактирования Markdown контента (IIFE)
 */
(function() {
    'use strict';

    // Уровень логирования модуля
    const LOG_LEVEL = 'debug';

    // Функция логирования с проверкой уровня
    function log(level, message, ...args) {
        const levels = { debug: 0, warn: 1, error: 2 };
        if (levels[level] >= levels[LOG_LEVEL]) {
            console[level](`[editor-md] ${message}`, ...args);
        }
    }

    // Состояние модуля
    const editorState = {
        currentElement: null,
        modalInstance: null,
        onSaveCallback: null
    };

    /**
     * Открытие редактора Markdown
     * @param {Object} element - Элемент для редактирования
     * @param {Function} onSave - Callback для сохранения
     */
    function openEditor(element, onSave) {
        log('debug', 'Opening Markdown editor for:', element);
        
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
        const existingModal = document.getElementById('markdownEditorModal');
        if (existingModal) {
            existingModal.remove();
        }

        const modalHTML = `
            <div class="modal fade" id="markdownEditorModal" tabindex="-1" aria-labelledby="markdownEditorModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="markdownEditorModalLabel">
                                <i class="bi bi-pencil me-2"></i>
                                Редактирование: ${editorState.currentElement.name}
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="alert alert-info" role="alert">
                                <h6><i class="bi bi-info-circle me-2"></i>Информация об элементе</h6>
                                <p><strong>Название:</strong> ${editorState.currentElement.name}</p>
                                <p><strong>Описание:</strong> ${editorState.currentElement.description || 'Не указано'}</p>
                                <p><strong>ID:</strong> ${editorState.currentElement.id}</p>
                            </div>
                            
                            <div class="card">
                                <div class="card-header">
                                    <h6 class="mb-0"><i class="bi bi-chat-text me-2"></i>Промпт для LLM</h6>
                                </div>
                                <div class="card-body">
                                    <textarea class="form-control" id="promptEditor" rows="10" placeholder="Введите промпт для LLM...">${editorState.currentElement.prompt || ''}</textarea>
                                    <div class="form-text">Этот текст будет передан в контекст LLM при выборе элемента</div>
                                </div>
                            </div>
                            
                            <div class="mt-3">
                                <div class="alert alert-warning" role="alert">
                                    <i class="bi bi-tools me-2"></i>
                                    <strong>В разработке:</strong> Полнофункциональный редактор Markdown с предварительным просмотром будет реализован позже.
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отменить</button>
                            <button type="button" class="btn btn-primary" id="saveMarkdownBtn">Сохранить</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        setupEventListeners();
    }

    /**
     * Настройка обработчиков событий
     */
    function setupEventListeners() {
        const saveBtn = document.getElementById('saveMarkdownBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', handleSave);
        }
    }

    /**
     * Обработка сохранения
     */
    function handleSave() {
        const promptEditor = document.getElementById('promptEditor');
        if (!promptEditor) return;

        // Обновляем промпт в элементе
        editorState.currentElement.prompt = promptEditor.value.trim();

        log('debug', 'Saving markdown content for element:', editorState.currentElement.id);

        // Вызываем callback для сохранения
        if (editorState.onSaveCallback) {
            editorState.onSaveCallback(editorState.currentElement);
        }

        // Закрываем модальное окно
        hideModal();
    }

    /**
     * Показать модальное окно
     */
    function showModal() {
        const modalElement = document.getElementById('markdownEditorModal');
        editorState.modalInstance = new bootstrap.Modal(modalElement);
        editorState.modalInstance.show();
    }

    /**
     * Скрыть модальное окно
     */
    function hideModal() {
        if (editorState.modalInstance) {
            editorState.modalInstance.hide();
        }
    }

    /**
     * Очистка модуля
     */
    function cleanup() {
        const modal = document.getElementById('markdownEditorModal');
        if (modal) {
            if (editorState.modalInstance) {
                editorState.modalInstance.hide();
            }
            modal.remove();
        }
        
        editorState.currentElement = null;
        editorState.modalInstance = null;
        editorState.onSaveCallback = null;
    }

    // Экспорт функций для использования в других модулях
    window.markdownEditor = {
        open: openEditor,
        cleanup: cleanup
    };

    // Уведомляем о готовности модуля
    document.addEventListener('DOMContentLoaded', function() {
        window.eventBus.emit('module.editor-md.ready', {
            timestamp: Date.now(),
            moduleId: 'editor-md'
        });
    });

})();