/**
 * Плагин Mermaid для markdown-it
 * Обеспечивает рендеринг Mermaid диаграмм в markdown контенте
 *
 * ПРОМПТ для агента ЛЛМ чтобы он мог понимать как использовать этот плагин как инструмент взаимодействия с пользователем:
 * У тебя есть инструмент Mermaid для создания диаграмм и схем, который поддерживает
 * множество типов диаграмм: flowchart (блок-схемы), sequence (диаграммы последовательности),
 * class (диаграммы классов), state (диаграммы состояний), gantt (диаграммы Ганта),
 * pie (круговые диаграммы), journey (пользовательские пути), gitgraph (git графы),
 * er (диаграммы сущность-связь), mindmap (ментальные карты), timeline (временные линии).
 * Для отображения диаграммы оберни код в блок кода ```mermaid и ```.
 * Диаграммы интерактивны и идеально подходят для визуализации процессов, архитектуры,
 * алгоритмов и структур данных.
 */
(function() {
    'use strict';

    // Уровень логирования модуля
    const LOG_LEVEL = 'warn';

    // Функция логирования с проверкой уровня
    function log(level, message, ...args) {
        const levels = { debug: 0, warn: 1, error: 2 };
        if (levels[level] >= levels[LOG_LEVEL]) {
            console[level](`[mermaid-plugin] ${message}`, ...args);
        }
    }

    // Состояние плагина
    const pluginState = {
        initialized: false,
        mermaidReady: false,
        theme: 'dark',
        diagramCounter: 0
    };

    /**
     * Плагин для markdown-it для обработки блоков ```mermaid
     */
    function mermaidPlugin(md) {
        const defaultRenderer = md.renderer.rules.fence || function(tokens, idx, options, env, renderer) {
            return renderer.renderToken(tokens, idx, options);
        };

        md.renderer.rules.fence = function(tokens, idx, options, env, renderer) {
            const token = tokens[idx];
            const info = token.info ? token.info.trim() : '';
            const langName = info ? info.split(/\s+/g)[0] : '';

            if (langName === 'mermaid') {
                const diagramId = 'mermaid-' + (++pluginState.diagramCounter) + '-' + Math.random().toString(36).substr(2, 9);
                const content = token.content.trim();
                
                log('debug', `Creating Mermaid diagram with ID: ${diagramId}`);
                
                // Возвращаем div с уникальным ID для Mermaid
                return `<div class="mermaid-diagram" id="${diagramId}" data-mermaid-content="${escapeHtml(content)}">${escapeHtml(content)}</div>\n`;
            }

            return defaultRenderer(tokens, idx, options, env, renderer);
        };
    }

    /**
     * Инициализация библиотеки Mermaid
     */
    function initializeMermaid() {
        if (!window.mermaid) {
            log('error', 'Mermaid library not found');
            return false;
        }

        if (pluginState.mermaidReady) {
            log('debug', 'Mermaid already initialized');
            return true;
        }

        try {
            window.mermaid.initialize({
                startOnLoad: false,
                theme: pluginState.theme,
                securityLevel: 'loose',
                fontFamily: 'Arial, sans-serif',
                flowchart: {
                    useMaxWidth: true,
                    htmlLabels: true
                },
                sequence: {
                    useMaxWidth: true
                },
                gantt: {
                    useMaxWidth: true
                }
            });

            pluginState.mermaidReady = true;
            log('debug', 'Mermaid initialized successfully');

            // Уведомляем о готовности плагина
            if (window.eventBus) {
                window.eventBus.emit('module.mermaid-plugin.ready', {
                    timestamp: Date.now(),
                    moduleId: 'mermaid-plugin',
                    theme: pluginState.theme
                });
            }

            return true;
        } catch (error) {
            log('error', 'Failed to initialize Mermaid:', error);
            return false;
        }
    }

    /**
     * Рендеринг всех Mermaid диаграмм на странице
     */
    async function renderDiagrams() {
        if (!window.mermaid || !pluginState.mermaidReady) {
            log('warn', 'Mermaid not ready, attempting to initialize');
            if (!initializeMermaid()) {
                return;
            }
        }
        
        const diagrams = document.querySelectorAll('.mermaid-diagram:not([data-processed])');
        log('debug', `Found ${diagrams.length} unprocessed Mermaid diagrams`);

        for (const diagram of diagrams) {
            await renderSingleDiagram(diagram);
        }
    }

    /**
     * Рендеринг одной диаграммы
     */
    async function renderSingleDiagram(diagram) {
        if (!diagram || diagram.hasAttribute('data-processed')) {
            return;
        }

        try {
            const content = diagram.getAttribute('data-mermaid-content') || diagram.textContent;
            const diagramId = diagram.id;
            
            log('debug', `Rendering diagram: ${diagramId}`);

            // Рендерим диаграмму
            const { svg } = await window.mermaid.render(diagramId + '-svg', content);
            
            // Заменяем содержимое на SVG
            diagram.innerHTML = svg;
            diagram.setAttribute('data-processed', 'true');
            
            log('debug', `Diagram rendered successfully: ${diagramId}`);

            // Уведомляем о рендеринге диаграммы
            if (window.eventBus) {
                window.eventBus.emit('module.mermaid-plugin.diagram-rendered', {
                    timestamp: Date.now(),
                    moduleId: 'mermaid-plugin',
                    diagramId: diagramId
                });
            }

        } catch (error) {
            log('error', 'Mermaid rendering error:', error);
            
            // Показываем ошибку пользователю
            diagram.innerHTML = `
                <div class="alert alert-warning">
                    <strong>Ошибка рендеринга диаграммы:</strong><br>
                    ${escapeHtml(error.message)}<br>
                    <small class="text-muted">Код диаграммы от ЛЛМ пришел с ошибками. Перегенерируйте ответ или зайдите в режим редактирования и исправьте ошибку.</small>
                </div>
            `;
            diagram.setAttribute('data-processed', 'true');

            // Уведомляем об ошибке
            if (window.eventBus) {
                window.eventBus.emit('module.mermaid-plugin.error', {
                    timestamp: Date.now(),
                    moduleId: 'mermaid-plugin',
                    diagramId: diagram.id,
                    error: error.message
                });
            }
        }
    }

    /**
     * Проверка наличия Mermaid контента в тексте
     */
    function hasContent(content) {
        return content && content.includes('```mermaid');
    }

    /**
     * Обновление темы Mermaid
     */
    function updateTheme(theme) {
        const newTheme = theme === 'dark' ? 'dark' : 'default';
        
        if (pluginState.theme === newTheme) {
            return;
        }

        pluginState.theme = newTheme;
        log('debug', `Updating Mermaid theme to: ${newTheme}`);

        if (window.mermaid && pluginState.mermaidReady) {
            // Переинициализируем Mermaid с новой темой
            pluginState.mermaidReady = false;
            initializeMermaid();

            // Сбрасываем флаг обработки для всех диаграмм
            document.querySelectorAll('.mermaid-diagram[data-processed]').forEach(diagram => {
                diagram.removeAttribute('data-processed');
            });

            // Перерендериваем все диаграммы
            setTimeout(() => renderDiagrams(), 100);
        }
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
     * Сброс состояния диаграмм для повторного рендеринга
     */
    function resetDiagrams() {
        document.querySelectorAll('.mermaid-diagram[data-processed]').forEach(diagram => {
            diagram.removeAttribute('data-processed');
        });
        log('debug', 'Reset all diagram processing flags');
    }

    /**
     * Получение статистики плагина
     */
    function getStats() {
        const totalDiagrams = document.querySelectorAll('.mermaid-diagram').length;
        const processedDiagrams = document.querySelectorAll('.mermaid-diagram[data-processed]').length;
        
        return {
            initialized: pluginState.initialized,
            mermaidReady: pluginState.mermaidReady,
            theme: pluginState.theme,
            diagramCounter: pluginState.diagramCounter,
            totalDiagrams: totalDiagrams,
            processedDiagrams: processedDiagrams,
            pendingDiagrams: totalDiagrams - processedDiagrams
        };
    }

    // Инициализация при загрузке DOM
    document.addEventListener('DOMContentLoaded', function() {
        log('debug', 'DOM loaded, initializing Mermaid plugin');
        
        // Инициализируем Mermaid
        setTimeout(initializeMermaid, 100);
        
        // Регистрируем плагин в ядре markdown-it
        if (window.markdownCore) {
            window.markdownCore.registerPlugin('mermaid', mermaidPlugin);
            log('debug', 'Mermaid plugin registered with markdown core');
        } else {
            log('warn', 'Markdown core not available, plugin will be registered later');
            // Ждем готовности ядра
            if (window.eventBus) {
                window.eventBus.on('module.markdown-core.ready', () => {
                    if (window.markdownCore) {
                        window.markdownCore.registerPlugin('mermaid', mermaidPlugin);
                        log('debug', 'Mermaid plugin registered with markdown core (delayed)');
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

        pluginState.initialized = true;
        log('debug', 'Mermaid plugin initialized');
    });

    // Публичный API
    window.mermaidPlugin = {
        // Основные функции
        plugin: mermaidPlugin,
        initialize: initializeMermaid,
        renderDiagrams: renderDiagrams,
        renderSingleDiagram: renderSingleDiagram,
        
        // Утилиты
        hasContent: hasContent,
        updateTheme: updateTheme,
        resetDiagrams: resetDiagrams,
        
        // Информация о состоянии
        getStats: getStats,
        
        // Проверка готовности
        get isReady() {
            return pluginState.mermaidReady;
        },
        
        get theme() {
            return pluginState.theme;
        }
    };

    log('debug', 'Mermaid plugin module loaded');

})();