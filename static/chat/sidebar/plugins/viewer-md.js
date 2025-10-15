/**
 * Модуль просмотра Markdown контента (IIFE)
 */
(function() {
    'use strict';

    // Уровень логирования модуля
    const LOG_LEVEL = 'debug';

    // Функция логирования с проверкой уровня
    function log(level, message, ...args) {
        const levels = { debug: 0, warn: 1, error: 2 };
        if (levels[level] >= levels[LOG_LEVEL]) {
            console[level](`[viewer-md] ${message}`, ...args);
        }
    }

    // Состояние модуля
    const viewerState = {
        currentElement: null,
        modalInstance: null
    };

    /**
     * Открытие просмотрщика Markdown
     * @param {Object} element - Элемент для просмотра
     */
    function openViewer(element) {
        log('debug', 'Opening Markdown viewer for:', element);
        
        viewerState.currentElement = element;
        
        createModal();
        showModal();
    }

    /**
     * Создание модального окна просмотрщика
     */
    function createModal() {
        // Удаляем существующее модальное окно если есть
        const existingModal = document.getElementById('markdownViewerModal');
        if (existingModal) {
            existingModal.remove();
        }

        const modalHTML = `
            <div class="modal fade" id="markdownViewerModal" tabindex="-1" aria-labelledby="markdownViewerModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="markdownViewerModalLabel">
                                <i class="bi bi-eye me-2"></i>
                                Просмотр: ${viewerState.currentElement.name}
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="alert alert-info" role="alert">
                                <h6><i class="bi bi-info-circle me-2"></i>Информация об элементе</h6>
                                <p><strong>Название:</strong> ${viewerState.currentElement.name}</p>
                                <p><strong>Описание:</strong> ${viewerState.currentElement.description || 'Не указано'}</p>
                                <p><strong>ID:</strong> ${viewerState.currentElement.id}</p>
                            </div>
                            
                            ${viewerState.currentElement.prompt ? `
                                <div class="card">
                                    <div class="card-header">
                                        <h6 class="mb-0"><i class="bi bi-chat-text me-2"></i>Промпт для LLM</h6>
                                    </div>
                                    <div class="card-body">
                                        <pre class="bg-light p-3 rounded">${viewerState.currentElement.prompt}</pre>
                                    </div>
                                </div>
                            ` : ''}
                            
                            <div class="mt-3">
                                <div class="alert alert-warning" role="alert">
                                    <i class="bi bi-tools me-2"></i>
                                    <strong>В разработке:</strong> Полнофункциональный просмотрщик Markdown будет реализован позже.
                                </div>
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
    }

    /**
     * Показать модальное окно
     */
    function showModal() {
        const modalElement = document.getElementById('markdownViewerModal');
        viewerState.modalInstance = new bootstrap.Modal(modalElement);
        viewerState.modalInstance.show();
    }

    /**
     * Скрыть модальное окно
     */
    function hideModal() {
        if (viewerState.modalInstance) {
            viewerState.modalInstance.hide();
        }
    }

    /**
     * Очистка модуля
     */
    function cleanup() {
        const modal = document.getElementById('markdownViewerModal');
        if (modal) {
            if (viewerState.modalInstance) {
                viewerState.modalInstance.hide();
            }
            modal.remove();
        }
        
        viewerState.currentElement = null;
        viewerState.modalInstance = null;
    }

    // Экспорт функций для использования в других модулях
    window.markdownViewer = {
        open: openViewer,
        cleanup: cleanup
    };

    // Уведомляем о готовности модуля
    document.addEventListener('DOMContentLoaded', function() {
        window.eventBus.emit('module.viewer-md.ready', {
            timestamp: Date.now(),
            moduleId: 'viewer-md'
        });
    });

})();