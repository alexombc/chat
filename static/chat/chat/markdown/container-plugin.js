/**
 * Плагин Container для markdown-it
 * Обеспечивает рендеринг контейнеров и предупреждений
 * Основан на официальном плагине markdown-it-container
 * Источник: https://github.com/markdown-it/markdown-it-container
 */
(function() {
    'use strict';

    // Уровень логирования модуля
    const LOG_LEVEL = 'warn';

    // Функция логирования с проверкой уровня
    function log(level, message, ...args) {
        const levels = { debug: 0, warn: 1, error: 2 };
        if (levels[level] >= levels[LOG_LEVEL]) {
            console[level](`[container-plugin] ${message}`, ...args);
        }
    }

    // Состояние плагина
    const pluginState = {
        initialized: false,
        ready: false,
        containerCounter: 0,
        supportedTypes: ['warning', 'info', 'note', 'tip', 'danger', 'success']
    };

    // Конфигурация типов контейнеров
    const containerConfig = {
        warning: {
            icon: 'bi-exclamation-triangle-fill',
            class: 'alert-warning',
            title: 'Предупреждение'
        },
        info: {
            icon: 'bi-info-circle-fill',
            class: 'alert-info',
            title: 'Информация'
        },
        note: {
            icon: 'bi-sticky-fill',
            class: 'alert-secondary',
            title: 'Заметка'
        },
        tip: {
            icon: 'bi-lightbulb-fill',
            class: 'alert-success',
            title: 'Совет'
        },
        danger: {
            icon: 'bi-exclamation-octagon-fill',
            class: 'alert-danger',
            title: 'Опасность'
        },
        success: {
            icon: 'bi-check-circle-fill',
            class: 'alert-success',
            title: 'Успех'
        }
    };

    /**
     * Основная функция плагина контейнеров (на основе markdown-it-container)
     */
    function createContainerPlugin(name, options) {
        options = options || {};

        // Валидация по умолчанию
        function validateDefault(params) {
            return params.trim().split(' ', 2)[0] === name;
        }

        // Рендерер по умолчанию
        function renderDefault(tokens, idx, _options, env, slf) {
            // Добавляем класс к открывающему тегу
            if (tokens[idx].nesting === 1) {
                tokens[idx].attrJoin('class', name);
            }
            return slf.renderToken(tokens, idx, _options, env, slf);
        }

        const min_markers = 3;
        const marker_str = options.marker || ':';
        const marker_char = marker_str.charCodeAt(0);
        const marker_len = marker_str.length;
        const validate = options.validate || validateDefault;
        const render = options.render || renderDefault;

        function container(state, startLine, endLine, silent) {
            let pos;
            let auto_closed = false;
            let start = state.bMarks[startLine] + state.tShift[startLine];
            let max = state.eMarks[startLine];

            // Быстрая проверка первого символа
            if (marker_char !== state.src.charCodeAt(start)) {
                return false;
            }

            // Проверка остальной части маркера
            for (pos = start + 1; pos <= max; pos++) {
                if (marker_str[(pos - start) % marker_len] !== state.src[pos]) {
                    break;
                }
            }

            const marker_count = Math.floor((pos - start) / marker_len);
            if (marker_count < min_markers) {
                return false;
            }

            pos -= (pos - start) % marker_len;
            const markup = state.src.slice(start, pos);
            const params = state.src.slice(pos, max);

            if (!validate(params, markup)) {
                return false;
            }

            // В режиме валидации возвращаем успех
            if (silent) {
                return true;
            }

            // Поиск конца блока
            let nextLine = startLine;
            for (;;) {
                nextLine++;
                if (nextLine >= endLine) {
                    // Незакрытый блок должен быть автоматически закрыт в конце документа
                    break;
                }

                start = state.bMarks[nextLine] + state.tShift[nextLine];
                max = state.eMarks[nextLine];

                if (start < max && state.sCount[nextLine] < state.blkIndent) {
                    // Непустая строка с отрицательным отступом должна остановить список
                    break;
                }

                if (marker_char !== state.src.charCodeAt(start)) {
                    continue;
                }

                if (state.sCount[nextLine] - state.blkIndent >= 4) {
                    // Закрывающий маркер должен иметь отступ менее 4 пробелов
                    continue;
                }

                for (pos = start + 1; pos <= max; pos++) {
                    if (marker_str[(pos - start) % marker_len] !== state.src[pos]) {
                        break;
                    }
                }

                // Закрывающий маркер должен быть не короче открывающего
                if (Math.floor((pos - start) / marker_len) < marker_count) {
                    continue;
                }

                // Убеждаемся, что в хвосте только пробелы
                pos -= (pos - start) % marker_len;
                pos = state.skipSpaces(pos);

                if (pos < max) {
                    continue;
                }

                // Найден!
                auto_closed = true;
                break;
            }

            const old_parent = state.parentType;
            const old_line_max = state.lineMax;
            state.parentType = 'container';

            // Это предотвратит ленивые продолжения за пределами нашего конечного маркера
            state.lineMax = nextLine;

            const token_o = state.push('container_' + name + '_open', 'div', 1);
            token_o.markup = markup;
            token_o.block = true;
            token_o.info = params;
            token_o.map = [startLine, nextLine];

            state.md.block.tokenize(state, startLine + 1, nextLine);

            const token_c = state.push('container_' + name + '_close', 'div', -1);
            token_c.markup = state.src.slice(start, pos);
            token_c.block = true;

            state.parentType = old_parent;
            state.lineMax = old_line_max;
            state.line = nextLine + (auto_closed ? 1 : 0);

            return true;
        }

        return function(md) {
            md.block.ruler.before('fence', 'container_' + name, container, {
                alt: ['paragraph', 'reference', 'blockquote', 'list']
            });
            md.renderer.rules['container_' + name + '_open'] = render;
            md.renderer.rules['container_' + name + '_close'] = render;
        };
    }

    /**
     * Создание кастомного рендерера для различных типов контейнеров
     */
    function createCustomRenderer(containerType) {
        return function(tokens, idx, _options, env, slf) {
            const token = tokens[idx];
            
            if (token.nesting === 1) {
                // Открывающий тег
                const containerId = 'container-' + containerType + '-' + (++pluginState.containerCounter);
                const title = token.info.trim().replace(containerType, '').trim() || containerConfig[containerType].title;
                const config = containerConfig[containerType];
                
                log('debug', `Creating ${containerType} container with ID: ${containerId}`);
                
                return `<div class="alert ${config.class} container-${containerType}" id="${containerId}" role="alert">
                    <div class="d-flex align-items-center mb-2">
                        <i class="bi ${config.icon} me-2"></i>
                        <strong>${escapeHtml(title)}</strong>
                    </div>
                    <div class="container-content">`;
            } else {
                // Закрывающий тег
                return `    </div>
                </div>\n`;
            }
        };
    }

    /**
     * Главный плагин для markdown-it
     */
    function containerPlugin(md, options = {}) {
        log('debug', 'Initializing container plugin');
        
        // Регистрируем все поддерживаемые типы контейнеров
        for (const containerType of pluginState.supportedTypes) {
            const containerPluginFn = createContainerPlugin(containerType, {
                render: createCustomRenderer(containerType)
            });
            
            // Применяем плагин к markdown-it
            containerPluginFn(md);
            
            log('debug', `Registered container type: ${containerType}`);
        }
    }

    /**
     * Инициализация плагина
     */
    function initialize() {
        try {
            pluginState.ready = true;
            log('debug', 'Container plugin initialized successfully');

            // Уведомляем о готовности плагина
            if (window.eventBus) {
                window.eventBus.emit('module.container-plugin.ready', {
                    timestamp: Date.now(),
                    moduleId: 'container-plugin',
                    supportedTypes: pluginState.supportedTypes
                });
            }

            return true;
        } catch (error) {
            log('error', 'Failed to initialize container plugin:', error);
            return false;
        }
    }

    /**
     * Рендеринг контейнеров на странице (если требуется дополнительная обработка)
     */
    function renderContent() {
        const containers = document.querySelectorAll('.alert[class*="container-"]:not([data-processed])');
        log('debug', `Found ${containers.length} unprocessed containers`);

        for (const container of containers) {
            try {
                // Помечаем как обработанный
                container.setAttribute('data-processed', 'true');
                
                // Дополнительная обработка контейнеров при необходимости
                // (например, добавление интерактивности)
                
            } catch (error) {
                log('error', 'Container processing error:', error);
            }
        }

        // Уведомляем о рендеринге контейнеров
        if (window.eventBus && containers.length > 0) {
            window.eventBus.emit('module.container-plugin.content-rendered', {
                timestamp: Date.now(),
                moduleId: 'container-plugin',
                elementsCount: containers.length
            });
        }
    }

    /**
     * Проверка наличия контейнеров в тексте
     */
    function hasContent(content) {
        if (!content) return false;
        
        // Проверяем наличие синтаксиса контейнеров
        for (const type of pluginState.supportedTypes) {
            if (content.includes(`:::${type}`) || content.includes(`::: ${type}`)) {
                return true;
            }
        }
        return false;
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
     * Получение статистики плагина
     */
    function getStats() {
        const totalContainers = document.querySelectorAll('.alert[class*="container-"]').length;
        const processedContainers = document.querySelectorAll('.alert[class*="container-"][data-processed]').length;
        
        return {
            initialized: pluginState.initialized,
            ready: pluginState.ready,
            containerCounter: pluginState.containerCounter,
            supportedTypes: pluginState.supportedTypes,
            totalContainers: totalContainers,
            processedContainers: processedContainers,
            pendingContainers: totalContainers - processedContainers
        };
    }

    // Инициализация при загрузке DOM
    document.addEventListener('DOMContentLoaded', function() {
        log('debug', 'DOM loaded, initializing Container plugin');
        
        // Инициализация стилей
        initializeStyles();
        
        // Инициализация плагина
        initialize();
        
        // Регистрация плагина в ядре markdown-it
        if (window.markdownCore) {
            window.markdownCore.registerPlugin('container', containerPlugin);
            log('debug', 'Container plugin registered with markdown core');
        } else {
            log('warn', 'Markdown core not available, plugin will be registered later');
            // Ждем готовности ядра
            if (window.eventBus) {
                window.eventBus.on('module.markdown-core.ready', () => {
                    if (window.markdownCore) {
                        window.markdownCore.registerPlugin('container', containerPlugin);
                        log('debug', 'Container plugin registered with markdown core (delayed)');
                    }
                });
            }
        }

        pluginState.initialized = true;
        log('debug', 'Container plugin initialized');
    });

    // Публичный API
    window.containerPlugin = {
        // Основные функции
        plugin: containerPlugin,
        initialize: initialize,
        renderContent: renderContent,
        
        // Утилиты
        hasContent: hasContent,
        
        // Информация о состоянии
        getStats: getStats,
        
        // Проверка готовности
        get isReady() {
            return pluginState.ready;
        },
        
        // Доступ к конфигурации
        get supportedTypes() {
            return [...pluginState.supportedTypes];
        },
        
        get containerConfig() {
            return { ...containerConfig };
        }
    };

    /**
     * Инициализация CSS стилей для контейнеров
     */
    function initializeStyles() {
        // Проверяем, не добавлены ли уже стили
        if (document.getElementById('container-plugin-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'container-plugin-styles';
        style.textContent = `
            /* Минимальные дополнительные стили для контейнеров */
            /* Используем максимально Bootstrap классы */
            
            .container-content {
                margin-top: 0.5rem;
            }
            
            .container-content > *:last-child {
                margin-bottom: 0 !important;
            }
            
            /* Небольшие улучшения для иконок */
            .alert .bi {
                font-size: 1.1em;
                vertical-align: baseline;
            }
            
            /* Адаптивность для мобильных */
            @media (max-width: 576px) {
                .alert {
                    font-size: 0.9rem;
                }
                
                .alert .bi {
                    font-size: 1em;
                }
            }
        `;
        
        document.head.appendChild(style);
        log('debug', 'Container plugin styles initialized');
    }

    log('debug', 'Container plugin module loaded');

})();