/**
 * Модуль рендеринга сообщений чата
 * Отвечает за отображение сообщений с поддержкой markdown и плагинов
 */
(function() {
    'use strict';

    // Уровень логирования модуля
    const LOG_LEVEL = 'warn';

    // Функция логирования с проверкой уровня
    function log(level, message, ...args) {
        const levels = { debug: 0, warn: 1, error: 2 };
        if (levels[level] >= levels[LOG_LEVEL]) {
            console[level](`[message-renderer] ${message}`, ...args);
        }
    }

    // Состояние рендерера
    const rendererState = {
        initialized: false,
        containerId: 'messagesArea',
        markdownInstance: null
    };

    /**
     * Проверка доступности зависимостей
     */
    function checkDependencies() {
        if (!window.eventBus) {
            log('error', 'EventBus is required for message renderer');
            return false;
        }
        
        if (!window.markdownCore) {
            log('error', 'Markdown core is required for message renderer');
            return false;
        }
        
        return true;
    }

    /**
     * Инициализация рендерера
     */
    function initialize() {
        if (!checkDependencies()) {
            return false;
        }

        try {
            // Получаем экземпляр markdown-it из ядра
            rendererState.markdownInstance = window.markdownCore.getInstance();
            
            if (!rendererState.markdownInstance) {
                log('error', 'Failed to get markdown instance from core');
                return false;
            }

            rendererState.initialized = true;
            log('debug', 'Message renderer initialized successfully');

            // Уведомляем о готовности рендерера
            window.eventBus.emit('module.message-renderer.ready', {
                timestamp: Date.now(),
                moduleId: 'message-renderer',
                containerId: rendererState.containerId
            });

            return true;
        } catch (error) {
            log('error', 'Failed to initialize message renderer:', error);
            return false;
        }
    }

    /**
     * Установка контейнера для сообщений
     */
    function setContainer(containerId) {
        if (typeof containerId !== 'string' || !containerId.trim()) {
            log('error', 'Container ID must be a non-empty string');
            return false;
        }

        rendererState.containerId = containerId;
        log('debug', `Container set to: ${containerId}`);
        return true;
    }

    /**
     * Получение экземпляра markdown-it
     */
    function getMarkdownInstance() {
        if (!rendererState.markdownInstance && window.markdownCore) {
            rendererState.markdownInstance = window.markdownCore.getInstance();
        }
        return rendererState.markdownInstance;
    }

    /**
     * Рендеринг всех сообщений
     */
    function render(messages, containerId = null) {
        if (!rendererState.initialized) {
            log('warn', 'Renderer not initialized, attempting to initialize');
            if (!initialize()) {
                return false;
            }
        }

        const targetContainerId = containerId || rendererState.containerId;
        const messagesArea = document.getElementById(targetContainerId);
        
        if (!messagesArea) {
            log('error', `Messages container not found: ${targetContainerId}`);
            return false;
        }

        if (!Array.isArray(messages)) {
            log('error', 'Messages must be an array');
            return false;
        }

        try {
            if (messages.length === 0) {
                messagesArea.innerHTML = `
                    <div class="text-center text-muted">
                        <i class="bi bi-chat-dots fs-1"></i>
                        <p class="mt-2">Начните новый разговор</p>
                    </div>
                `;
                return true;
            }

            // Рендерим все сообщения
            const renderedMessages = messages.map(message => renderSingle(message)).join('');
            messagesArea.innerHTML = renderedMessages;

            // Прокрутка вниз
            messagesArea.scrollTop = messagesArea.scrollHeight;

            // Рендеринг плагинов после отображения сообщений
            setTimeout(() => renderPlugins(), 100);

            log('debug', `Rendered ${messages.length} messages`);

            // Уведомляем о рендеринге сообщений
            window.eventBus.emit('module.message-renderer.messages-rendered', {
                timestamp: Date.now(),
                moduleId: 'message-renderer',
                messagesCount: messages.length,
                containerId: targetContainerId
            });

            return true;
        } catch (error) {
            log('error', 'Failed to render messages:', error);
            return false;
        }
    }

    /**
     * Рендеринг одного сообщения
     */
    function renderSingle(message) {
        if (!message || typeof message !== 'object') {
            log('error', 'Invalid message object');
            return '';
        }

        const isUser = message.role === 'user';
        const messageId = `msg_${message.id || Date.now()}`;
        
        // Определяем режим отображения для сообщений ассистента
        let dataMode;
        let content;
        
        if (isUser) {
            // Для сообщений пользователя по умолчанию показываем markdown код с автопереносом
            dataMode = 'markdown';
            content = `<pre style="white-space: pre-wrap; word-wrap: break-word; overflow-wrap: break-word;"><code>${escapeHtml(message.content)}</code></pre>`;
        } else {
            // Для сообщений ассистента: если стримится - markdown режим, иначе - rendered
            if (message.isStreaming) {
                dataMode = 'markdown';
                content = `<pre style="white-space: pre-wrap; word-wrap: break-word; overflow-wrap: break-word;"><code>${escapeHtml(message.content)}</code></pre>`;
            } else {
                dataMode = 'rendered';
                const md = getMarkdownInstance();
                if (md) {
                    const env = {
                        isStreaming: false
                    };
                    log('debug', `Рендерим сообщение ${message.id}, длина контента: ${message.content.length}`);
                    content = md.render(message.content, env);
                } else {
                    log('warn', 'Экземпляр markdown недоступен, используем экранированный HTML');
                    content = escapeHtml(message.content);
                }
            }
        }

        return `
            <div class="mb-3 ${isUser ? 'text-end' : ''}" data-mode="${dataMode}">
                <div class="d-inline-block" style="${isUser ? 'width: 80%; max-width: 80%;' : 'width: 80%; max-width: 80%;'}">
                    <!-- Заголовок сообщения с иконками -->
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <small class="text-muted">${isUser ? 'Вы' : 'Ассистент'}</small>
                        <div class="d-flex gap-1">
                            <button class="btn btn-sm btn-link p-0 view-mode-btn"
                                    data-message-id="${messageId}" data-mode="rendered"
                                    title="Просмотр" style="font-size: 0.8rem;">
                                <i class="bi bi-eye"></i>
                            </button>
                            <button class="btn btn-sm btn-link p-0 view-mode-btn"
                                    data-message-id="${messageId}" data-mode="markdown"
                                    title="Исходный код Markdown" style="font-size: 0.8rem;">
                                <i class="bi bi-code"></i>
                            </button>
                            ${!isUser ? `
                            <button class="btn btn-sm btn-link p-0 split-mode-btn"
                                    data-message-id="${messageId}"
                                    title="Сплит" style="font-size: 0.8rem;">
                                <i class="bi bi-layout-split"></i>
                            </button>
                            <button class="btn btn-sm btn-link p-0 fullscreen-mode-btn"
                                    data-message-id="${messageId}"
                                    title="Распахнуть на все окно" style="font-size: 0.8rem;">
                                <i class="bi bi-arrows-fullscreen"></i>
                            </button>
                            ` : ''}
                        </div>
                    </div>
                    
                    <!-- Содержимое сообщения -->
                    <div class="card ${isUser ? 'text-white' : 'bg-body-secondary'}" style="${isUser ? 'background-color: rgba(28, 42, 63, 0.7);' : ''}">
                        <div class="card-body p-3">
                            <div id="${messageId}_content" class="message-content" style="${isUser ? 'text-align: left;' : ''}">
                                ${content}
                            </div>
                        </div>
                    </div>
                    
                    <!-- Прикрепленные файлы -->
                    ${renderMessageFiles(message)}
                    
                    <!-- Нижние иконки -->
                    <div class="d-flex gap-1 mt-1 ${isUser ? 'justify-content-end' : ''}">
                        <button class="btn btn-sm btn-link p-0 copy-btn"
                                data-content="${escapeHtml(message.content)}"
                                title="Копировать в буфер обмена" style="font-size: 0.8rem;">
                            <i class="bi bi-clipboard"></i>
                        </button>
                        <button class="btn btn-sm btn-link p-0 download-message-btn"
                                data-message-id="${messageId}"
                                title="Скачать сообщение в файл md" style="font-size: 0.8rem;">
                            <i class="bi bi-download"></i>
                        </button>
                        <button class="btn btn-sm btn-link p-0 edit-btn"
                                data-message-id="${messageId}"
                                title="Редактировать" style="font-size: 0.8rem;">
                            <i class="bi bi-pencil"></i>
                        </button>
                        ${isUser ? `
                        <button class="btn btn-sm btn-link p-0 resend-user-btn"
                                data-message-id="${messageId}"
                                title="Отправить вопрос заново" style="font-size: 0.8rem;">
                            <i class="bi bi-send"></i>
                        </button>
                        ` : `
                        <button class="btn btn-sm btn-link p-0 regenerate-btn"
                                data-message-id="${messageId}"
                                title="Сгенерировать ответ заново" style="font-size: 0.8rem;">
                            <i class="bi bi-arrow-clockwise"></i>
                        </button>
                        `}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Рендеринг прикрепленных файлов для сообщения
     */
    function renderMessageFiles(message) {
        if (!message.files || message.files.length === 0) {
            return '';
        }

        let filesHTML = '<div class="mt-2 mb-1">';
        filesHTML += '<div class="d-flex flex-wrap gap-2">';
        
        message.files.forEach((fileInfo, index) => {
            const fileType = window.filePreview ? window.filePreview.determineFileType(fileInfo) : 'other';
            const config = window.filePreview ? window.filePreview.FILE_TYPES[fileType] : { icon: 'bi-file-earmark', color: '#6c757d' };
            const fileSize = window.filePreview ? window.filePreview.formatFileSize(fileInfo.size) : (fileInfo.size + ' байт');
            
            filesHTML += `
                <div class="badge bg-body-secondary text-body border d-flex align-items-center gap-1 p-2" style="max-width: 200px;">
                    <i class="${config.icon}" style="color: ${config.color}; font-size: 0.9rem;"></i>
                    <span class="text-truncate" title="${fileInfo.name}" style="font-size: 0.75rem;">${fileInfo.name}</span>
                    <small class="text-muted" style="font-size: 0.7rem;">${fileSize}</small>
                </div>
            `;
        });
        
        filesHTML += '</div>';
        filesHTML += '</div>';
        
        return filesHTML;
    }

    /**
     * Обновление потокового сообщения
     */
    function updateStreaming(message) {
        if (!message || typeof message !== 'object') {
            log('error', 'Invalid message object for streaming update');
            return false;
        }

        const messageId = `msg_${message.id}`;
        const contentElement = document.getElementById(messageId + '_content');
        const messageContainer = contentElement ? contentElement.closest('.mb-3') : null;
        
        if (!contentElement) {
            log('warn', `Content element not found for streaming update: ${messageId}`);
            return false;
        }

        try {
            // Во время стриминга показываем markdown код
            if (message.isStreaming) {
                // Устанавливаем режим markdown для стримящегося сообщения
                if (messageContainer) {
                    messageContainer.setAttribute('data-mode', 'markdown');
                }
                
                // Отображаем содержимое как markdown код с индикатором печати
                const escapedContent = escapeHtml(message.content);
                contentElement.innerHTML = `<pre style="white-space: pre-wrap; word-wrap: break-word; overflow-wrap: break-word;"><code>${escapedContent}</code></pre>`;
                contentElement.innerHTML += '<span class="streaming-indicator ms-2"><i class="bi bi-three-dots text-muted"></i></span>';
                
                log('debug', `Streaming message ${messageId} in markdown mode, content length: ${message.content.length}`);
            } else {
                // После завершения стрима переключаем в rendered режим
                if (messageContainer) {
                    messageContainer.setAttribute('data-mode', 'rendered');
                }
                
                // Рендерим markdown содержимое
                const md = getMarkdownInstance();
                if (md) {
                    const env = {
                        isStreaming: false
                    };
                    contentElement.innerHTML = md.render(message.content, env);
                    log('debug', `Message ${messageId} switched to rendered mode after streaming completion`);
                } else {
                    contentElement.innerHTML = escapeHtml(message.content);
                }
                
                // Рендеринг плагинов только после завершения стриминга
                setTimeout(() => renderPlugins(), 100);
            }
            
            // Прокручиваем к низу для отслеживания новых сообщений
            const messagesArea = document.getElementById(rendererState.containerId);
            if (messagesArea) {
                messagesArea.scrollTop = messagesArea.scrollHeight;
            }

            // Уведомляем об обновлении потокового сообщения
            window.eventBus.emit('module.message-renderer.streaming-updated', {
                timestamp: Date.now(),
                moduleId: 'message-renderer',
                messageId: messageId,
                isStreaming: message.isStreaming,
                mode: message.isStreaming ? 'markdown' : 'rendered'
            });

            return true;
        } catch (error) {
            log('error', 'Failed to update streaming message:', error);
            return false;
        }
    }

    /**
     * Рендеринг контента плагинов
     */
    function renderPlugins() {
        try {
            // Рендеринг Mermaid диаграмм
            if (window.mermaidPlugin && window.mermaidPlugin.isReady) {
                window.mermaidPlugin.renderDiagrams();
            } else if (window.mermaidPlugin) {
                // Ждем готовности плагина
                setTimeout(() => {
                    if (window.mermaidPlugin.isReady) {
                        window.mermaidPlugin.renderDiagrams();
                    }
                }, 200);
            }

            // Рендеринг математических формул
            if (window.mathPlugin && window.mathPlugin.isReady) {
                window.mathPlugin.renderFormulas();
            } else if (window.mathPlugin) {
                // Ждем готовности плагина
                setTimeout(() => {
                    if (window.mathPlugin.isReady) {
                        window.mathPlugin.renderFormulas();
                    }
                }, 200);
            }

            // Рендеринг mindmap диаграмм
            if (window.mindmapPlugin && window.mindmapPlugin.isReady) {
                window.mindmapPlugin.renderMindmaps();
            } else if (window.mindmapPlugin) {
                // Ждем готовности плагина
                setTimeout(() => {
                    if (window.mindmapPlugin.isReady) {
                        window.mindmapPlugin.renderMindmaps();
                    }
                }, 200);
            }

            // Рендеринг форм FormIO
            if (window.formioPlugin && window.formioPlugin.isReady) {
                window.formioPlugin.renderForms();
            } else if (window.formioPlugin) {
                // Ждем готовности плагина
                setTimeout(() => {
                    if (window.formioPlugin.isReady) {
                        window.formioPlugin.renderForms();
                    }
                }, 200);
            }

            // Рендеринг Python редакторов Pyodide
            if (window.pyodidePlugin && window.pyodidePlugin.isInitialized) {
                window.pyodidePlugin.renderEditors();
            } else if (window.pyodidePlugin) {
                // Ждем готовности плагина
                setTimeout(() => {
                    if (window.pyodidePlugin.isInitialized) {
                        window.pyodidePlugin.renderEditors();
                    }
                }, 200);
            }

            // Рендеринг DOCX редакторов
            if (window.docxPlugin && window.docxPlugin.isInitialized) {
                window.docxPlugin.renderEditors();
            } else if (window.docxPlugin) {
                // Ждем готовности плагина
                setTimeout(() => {
                    if (window.docxPlugin.isInitialized) {
                        window.docxPlugin.renderEditors();
                    }
                }, 200);
            }

            // Здесь можно добавить рендеринг других плагинов
            // Например: PlantUML, etc.

            log('debug', 'Plugin rendering completed');
        } catch (error) {
            log('error', 'Failed to render plugins:', error);
        }
    }

    /**
     * Экранирование HTML
     */
    function escapeHtml(text) {
        if (typeof text !== 'string') {
            return '';
        }
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Получение статистики рендерера
     */
    function getStats() {
        const messagesArea = document.getElementById(rendererState.containerId);
        const messageElements = messagesArea ? messagesArea.querySelectorAll('.message-content') : [];
        
        return {
            initialized: rendererState.initialized,
            containerId: rendererState.containerId,
            hasMarkdownInstance: !!rendererState.markdownInstance,
            messagesCount: messageElements.length,
            hasContainer: !!messagesArea
        };
    }

    // Инициализация при загрузке DOM
    document.addEventListener('DOMContentLoaded', function() {
        log('debug', 'DOM loaded, initializing message renderer');
        
        // Ждем готовности markdown core
        if (window.markdownCore && window.markdownCore.isReady) {
            initialize();
        } else if (window.eventBus) {
            window.eventBus.on('module.markdown-core.ready', () => {
                initialize();
            });
        } else {
            // Пытаемся инициализироваться через некоторое время
            setTimeout(initialize, 500);
        }
    });

    // Публичный API
    window.messageRenderer = {
        // Основные функции рендеринга
        render: render,
        renderSingle: renderSingle,
        updateStreaming: updateStreaming,
        renderPlugins: renderPlugins,
        
        // Управление
        initialize: initialize,
        setContainer: setContainer,
        getMarkdownInstance: getMarkdownInstance,
        
        // Утилиты
        escapeHtml: escapeHtml,
        renderMessageFiles: renderMessageFiles,
        
        // Информация о состоянии
        getStats: getStats,
        
        // Проверка готовности
        get isReady() {
            return rendererState.initialized;
        },
        
        get containerId() {
            return rendererState.containerId;
        }
    };

    log('debug', 'Message renderer module loaded');

})();