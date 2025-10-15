/**
 * Плагин Mindmap для markdown-it
 * Обеспечивает рендеринг интерактивных mind map диаграмм с помощью markmap
 * Основан на рабочем примере из _work/09 markdown-it-mindmap/demo.html
 * 
 * ПРОМПТ для агента ЛЛМ чтобы он мог понимать как использовать этот плагин как инструмент взаимодействия с пользователем:
 * У тебя есть инструмент markdown-it-markmap для визуализации интерактивных ментальных карт, который поддерживает
 * многоуровневые иерархии (через #, ##, ### заголовки и маркированные списки),
 * форматирование текста (**жирный**, *курсив*, ~~зачеркивание~~, `код`, [ссылки](url)),
 * математические формулы ($E=mc^2$) и многострочный текст.
 * Для отображения карты оберни код в блок кода ```mindmap и ```.
 * Карты интерактивны — поддерживают сворачивание/разворачивание узлов и идеально подходят
 * для визуализации сложных структур, идей и взаимосвязей.
 * 
 */
(function() {
    'use strict';

    // Уровень логирования модуля
    const LOG_LEVEL = 'warn';

    // Функция логирования с проверкой уровня
    function log(level, message, ...args) {
        const levels = { debug: 0, warn: 1, error: 2 };
        if (levels[level] >= levels[LOG_LEVEL]) {
            console[level](`[mindmap-plugin] ${message}`, ...args);
        }
    }

    // Состояние плагина
    const pluginState = {
        initialized: false,
        markmapReady: false,
        theme: 'dark',
        mindmapCounter: 0,
        transformer: null,
        markmapView: null,
        loadingPromise: null
    };

    /**
     * Плагин для markdown-it для обработки блоков ```mindmap
     * Модифицированная версия для отложенного рендеринга
     */
    function mindmapPlugin(md) {
        const temp = md.renderer.rules.fence?.bind(md.renderer.rules) || (() => '');
        
        md.renderer.rules.fence = function(tokens, idx, options, env, slf) {
            const token = tokens[idx];
            if (token.info === 'mindmap') {
                const mindmapId = 'mindmap-' + (++pluginState.mindmapCounter) + '-' + Math.random().toString(36).substr(2, 9);
                const content = token.content.trim();
                
                log('debug', `Creating Mindmap placeholder with ID: ${mindmapId}`);
                
                // Проверяем, находимся ли мы в режиме стриминга
                // Если да, показываем обычный блок кода
                // Если нет, создаем mindmap контейнер
                if (env && env.isStreaming) {
                    // Во время стриминга показываем обычный блок кода
                    return `<pre class="mindmap-streaming" data-mindmap-id="${mindmapId}" data-mindmap-content="${escapeHtml(content)}"><code class="language-mindmap">${escapeHtml(content)}</code></pre>\n`;
                } else {
                    // После завершения стриминга создаем mindmap контейнер
                    return `<div class="mindmap-container" style="text-align: center; margin: 1rem 0; padding: 1rem; background-color: var(--bs-body-bg); border-radius: 0.375rem; border: 1px solid var(--bs-border-color);">
                        <svg class="markmap-svg markmap mindmap-${mindmapId}" id="${mindmapId}" data-mindmap-content="${escapeHtml(content)}" style="width: 100%; height: 400px; max-width: 100%;">
                            <text x="50%" y="50%" text-anchor="middle" fill="var(--bs-body-color)" font-size="14">
                                Загрузка mind map...
                            </text>
                        </svg>
                    </div>\n`;
                }
            }
            return temp(tokens, idx, options, env, slf);
        };
    }

    /**
     * Загрузка внешних библиотек через динамический импорт
     */
    async function loadExternalLibraries() {
        // Если уже загружаем, ждем завершения
        if (pluginState.loadingPromise) {
            return pluginState.loadingPromise;
        }

        pluginState.loadingPromise = (async () => {
            try {
                // D3 должна быть уже загружена в HTML
                if (!window.d3) {
                    log('error', 'D3 library should be loaded in HTML but is not available');
                    return false;
                }

                // Загружаем markmap библиотеки через ES6 модули
                if (!pluginState.transformer || !pluginState.markmapView) {
                    log('debug', 'Loading markmap libraries via dynamic import');
                    
                    // Используем точно такой же подход как в demo.html
                    const { Transformer } = await import('https://jspm.dev/markmap-lib');
                    const { Markmap } = await import('https://jspm.dev/markmap-view');
                    
                    pluginState.transformer = new Transformer();
                    pluginState.markmapView = Markmap;
                    
                    log('debug', 'Markmap libraries loaded successfully via ES6 modules');
                }

                return true;
            } catch (error) {
                log('error', 'Failed to load external libraries:', error);
                pluginState.loadingPromise = null; // Сбрасываем для повторной попытки
                return false;
            }
        })();

        return pluginState.loadingPromise;
    }

    /**
     * Загрузка скрипта
     */
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            // Проверяем, не загружен ли уже скрипт
            const existingScript = document.querySelector(`script[src="${src}"]`);
            if (existingScript) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    /**
     * Инициализация библиотеки markmap
     */
    async function initializeMarkmap() {
        if (pluginState.markmapReady) {
            log('debug', 'Markmap already initialized');
            return true;
        }

        try {
            // Загружаем внешние библиотеки
            const librariesLoaded = await loadExternalLibraries();
            if (!librariesLoaded) {
                return false;
            }

            // Проверяем доступность всех необходимых компонентов
            if (!window.d3) {
                log('error', 'D3 library not available after loading');
                return false;
            }

            if (!pluginState.transformer || !pluginState.markmapView) {
                log('error', 'Markmap libraries not available after loading');
                return false;
            }

            pluginState.markmapReady = true;
            log('debug', 'Markmap initialized successfully');

            // Уведомляем о готовности плагина
            if (window.eventBus) {
                window.eventBus.emit('module.mindmap-plugin.ready', {
                    timestamp: Date.now(),
                    moduleId: 'mindmap-plugin',
                    theme: pluginState.theme
                });
            }

            return true;
        } catch (error) {
            log('error', 'Failed to initialize Markmap:', error);
            return false;
        }
    }

    /**
     * Рендеринг всех mindmap диаграмм на странице
     */
    async function renderMindmaps() {
        if (!pluginState.markmapReady) {
            log('warn', 'Markmap not ready, attempting to initialize');
            const initialized = await initializeMarkmap();
            if (!initialized) {
                return;
            }
        }
        
        // Сначала преобразуем блоки кода в mindmap контейнеры
        await convertStreamingMindmaps();
        
        // Затем рендерим все mindmap диаграммы
        const mindmaps = document.querySelectorAll('.markmap-svg:not([data-processed])');
        log('debug', `Found ${mindmaps.length} unprocessed mindmaps`);

        for (const mindmap of mindmaps) {
            await renderSingleMindmap(mindmap);
        }
    }

    /**
     * Преобразование блоков кода mindmap в контейнеры после завершения стриминга
     */
    async function convertStreamingMindmaps() {
        const streamingMindmaps = document.querySelectorAll('.mindmap-streaming:not([data-converted])');
        log('debug', `Found ${streamingMindmaps.length} streaming mindmaps to convert`);

        for (const streamingElement of streamingMindmaps) {
            try {
                const mindmapId = streamingElement.getAttribute('data-mindmap-id');
                const content = streamingElement.getAttribute('data-mindmap-content');
                
                if (!mindmapId || !content) {
                    log('warn', 'Missing mindmap ID or content for streaming element');
                    continue;
                }
                
                log('debug', `Converting streaming mindmap to container: ${mindmapId}`);
                
                // Создаем новый mindmap контейнер
                const mindmapContainer = document.createElement('div');
                mindmapContainer.className = 'mindmap-container';
                mindmapContainer.style.cssText = 'text-align: center; margin: 1rem 0; padding: 1rem; background-color: var(--bs-body-bg); border-radius: 0.375rem; border: 1px solid var(--bs-border-color);';
                
                mindmapContainer.innerHTML = `
                    <svg class="markmap-svg markmap mindmap-${mindmapId}" id="${mindmapId}" data-mindmap-content="${escapeHtml(content)}" style="width: 100%; height: 400px; max-width: 100%;">
                        <text x="50%" y="50%" text-anchor="middle" fill="var(--bs-body-color)" font-size="14">
                            Загрузка mind map...
                        </text>
                    </svg>
                `;
                
                // Заменяем блок кода на mindmap контейнер
                streamingElement.parentNode.replaceChild(mindmapContainer, streamingElement);
                
                log('debug', `Successfully converted streaming mindmap: ${mindmapId}`);
                
            } catch (error) {
                log('error', 'Error converting streaming mindmap:', error);
                // Помечаем как обработанный, чтобы не пытаться конвертировать снова
                streamingElement.setAttribute('data-converted', 'error');
            }
        }
    }

    /**
     * Рендеринг одной mindmap диаграммы (точно как в demo.html)
     */
    async function renderSingleMindmap(svgElement) {
        if (!svgElement || svgElement.hasAttribute('data-processed')) {
            return;
        }

        try {
            const mindmapId = svgElement.id;
            const content = svgElement.getAttribute('data-mindmap-content');
            
            if (!content) {
                log('warn', `No content found for mindmap: ${mindmapId}`);
                return;
            }
            
            log('debug', `Rendering mindmap: ${mindmapId}`);

            // Проверяем, что SVG элемент имеет корректные размеры
            const rect = svgElement.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
                log('warn', `SVG element has zero dimensions, delaying render: ${mindmapId}`);
                // Повторяем попытку через небольшую задержку
                setTimeout(() => {
                    svgElement.removeAttribute('data-processed');
                    renderSingleMindmap(svgElement);
                }, 100);
                return;
            }

            // Трансформируем контент точно как в demo.html
            const { root } = pluginState.transformer.transform(content);
            
            // Очищаем SVG элемент
            svgElement.innerHTML = '';
            
            // Создаем mindmap точно как в demo.html
            const mm = pluginState.markmapView.create(svgElement, null, root);
            
            // Принудительно подгоняем размеры для модального окна
            if (svgElement.closest('#messageViewModal')) {
                setTimeout(() => {
                    if (mm && mm.fit) {
                        mm.fit();
                    }
                }, 50);
            }
            
            svgElement.setAttribute('data-processed', 'true');
            log('debug', `Mindmap rendered successfully: ${mindmapId}`);

            // Уведомляем о рендеринге mindmap
            if (window.eventBus) {
                window.eventBus.emit('module.mindmap-plugin.mindmap-rendered', {
                    timestamp: Date.now(),
                    moduleId: 'mindmap-plugin',
                    mindmapId: mindmapId
                });
            }

        } catch (error) {
            log('error', 'Mindmap rendering error:', error);
            
            // Показываем ошибку пользователю
            svgElement.innerHTML = `
                <text x="50%" y="40%" text-anchor="middle" fill="#dc3545" font-size="14">
                    <tspan x="50%" dy="0">Ошибка рендеринга mind map:</tspan>
                    <tspan x="50%" dy="20">${escapeHtml(error.message)}</tspan>
                    <tspan x="50%" dy="40" font-size="12" fill="#6c757d">Проверьте синтаксис markdown.</tspan>
                </text>
            `;
            svgElement.setAttribute('data-processed', 'true');

            // Уведомляем об ошибке
            if (window.eventBus) {
                window.eventBus.emit('module.mindmap-plugin.error', {
                    timestamp: Date.now(),
                    moduleId: 'mindmap-plugin',
                    mindmapId: svgElement.id,
                    error: error.message
                });
            }
        }
    }

    /**
     * Проверка наличия mindmap контента в тексте
     */
    function hasContent(content) {
        return content && content.includes('```mindmap');
    }

    /**
     * Обновление темы mindmap
     */
    function updateTheme(theme) {
        const newTheme = theme === 'dark' ? 'dark' : 'light';
        
        if (pluginState.theme === newTheme) {
            return;
        }

        pluginState.theme = newTheme;
        log('debug', `Updating mindmap theme to: ${newTheme}`);

        // Сбрасываем флаг обработки для всех mindmap
        document.querySelectorAll('.markmap-svg[data-processed]').forEach(mindmap => {
            mindmap.removeAttribute('data-processed');
        });

        // Перерендериваем все mindmap с новой темой
        setTimeout(() => renderMindmaps(), 100);
    }

    /**
     * Экранирование HTML
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Сброс состояния mindmap для повторного рендеринга
     */
    function resetMindmaps() {
        document.querySelectorAll('.markmap-svg[data-processed]').forEach(mindmap => {
            mindmap.removeAttribute('data-processed');
        });
        log('debug', 'Reset all mindmap processing flags');
    }

    /**
     * Получение статистики плагина
     */
    function getStats() {
        const totalMindmaps = document.querySelectorAll('.markmap-svg').length;
        const processedMindmaps = document.querySelectorAll('.markmap-svg[data-processed]').length;
        
        return {
            initialized: pluginState.initialized,
            markmapReady: pluginState.markmapReady,
            theme: pluginState.theme,
            mindmapCounter: pluginState.mindmapCounter,
            totalMindmaps: totalMindmaps,
            processedMindmaps: processedMindmaps,
            pendingMindmaps: totalMindmaps - processedMindmaps,
            hasTransformer: !!pluginState.transformer,
            hasView: !!pluginState.markmapView,
            hasD3: !!window.d3
        };
    }

    /**
     * Настройка обработчиков для модальных окон
     */
    function setupModalHandlers() {
        // Обработчик для модального окна просмотра сообщений
        const messageModal = document.getElementById('messageViewModal');
        if (messageModal) {
            // Обработчик события полного открытия модального окна
            messageModal.addEventListener('shown.bs.modal', function() {
                log('debug', 'Modal shown, re-rendering mindmaps');
                setTimeout(() => {
                    // Сбрасываем флаги обработки для mindmap в модальном окне
                    const modalMindmaps = messageModal.querySelectorAll('.markmap-svg[data-processed]');
                    modalMindmaps.forEach(mindmap => {
                        mindmap.removeAttribute('data-processed');
                    });
                    // Перерендериваем mindmap
                    renderMindmaps();
                }, 300);
            });

            // Обработчик для MutationObserver чтобы отслеживать изменения содержимого модального окна
            const observer = new MutationObserver(function(mutations) {
                let shouldRerender = false;
                mutations.forEach(function(mutation) {
                    if (mutation.type === 'childList') {
                        // Проверяем, добавились ли новые mindmap элементы
                        mutation.addedNodes.forEach(function(node) {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                // Проверяем, что родительский контейнер сообщения находится в режиме "rendered"
                                const messageContainer = node.closest('[data-mode]');
                                if (messageContainer && messageContainer.getAttribute('data-mode') !== 'rendered') {
                                    log('debug', 'Skipping mindmap processing - message not in rendered mode');
                                    return;
                                }
                                
                                if (node.classList && node.classList.contains('markmap-svg') ||
                                    node.querySelector && node.querySelector('.markmap-svg')) {
                                    shouldRerender = true;
                                }
                            }
                        });
                    }
                });
                
                if (shouldRerender) {
                    log('debug', 'New mindmap detected in modal, re-rendering');
                    setTimeout(() => renderMindmaps(), 100);
                }
            });

            // Наблюдаем за изменениями в содержимом модального окна
            const modalBody = messageModal.querySelector('.modal-body');
            if (modalBody) {
                observer.observe(modalBody, {
                    childList: true,
                    subtree: true
                });
            }
        }
    }

    // Инициализация при загрузке DOM
    document.addEventListener('DOMContentLoaded', function() {
        log('debug', 'DOM loaded, initializing Mindmap plugin');
        
        // Инициализируем markmap асинхронно
        setTimeout(() => initializeMarkmap(), 100);
        
        // Регистрируем плагин в ядре markdown-it
        if (window.markdownCore) {
            window.markdownCore.registerPlugin('mindmap', mindmapPlugin);
            log('debug', 'Mindmap plugin registered with markdown core');
        } else {
            log('warn', 'Markdown core not available, plugin will be registered later');
            // Ждем готовности ядра
            if (window.eventBus) {
                window.eventBus.on('module.markdown-core.ready', () => {
                    if (window.markdownCore) {
                        window.markdownCore.registerPlugin('mindmap', mindmapPlugin);
                        log('debug', 'Mindmap plugin registered with markdown core (delayed)');
                    }
                });
            }
        }

        // Подписываемся на изменения темы
        if (window.eventBus) {
            window.eventBus.on('globalVars.bootstrapTheme.changed', (theme) => {
                updateTheme(theme);
            });
        }

        // Добавляем обработчик для модальных окон
        setupModalHandlers();

        pluginState.initialized = true;
        log('debug', 'Mindmap plugin initialized');
    });

    // Публичный API
    window.mindmapPlugin = {
        // Основные функции
        plugin: mindmapPlugin,
        initialize: initializeMarkmap,
        renderMindmaps: renderMindmaps,
        renderSingleMindmap: renderSingleMindmap,
        convertStreamingMindmaps: convertStreamingMindmaps,
        setupModalHandlers: setupModalHandlers,
        
        // Утилиты
        hasContent: hasContent,
        updateTheme: updateTheme,
        resetMindmaps: resetMindmaps,
        
        // Информация о состоянии
        getStats: getStats,
        
        // Проверка готовности
        get isReady() {
            return pluginState.markmapReady;
        },
        
        get theme() {
            return pluginState.theme;
        }
    };

    log('debug', 'Mindmap plugin module loaded');

})();