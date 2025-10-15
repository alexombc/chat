/**
 * Плагин Sub-Sup для markdown-it
 * Обеспечивает рендеринг подстрочного (~text~) и надстрочного (^text^) текста
 * Основан на официальных плагинах markdown-it-sub и markdown-it-sup
 * Источники: 
 * - https://github.com/markdown-it/markdown-it-sub
 * - https://github.com/markdown-it/markdown-it-sup
 */
(function() {
    'use strict';

    // Уровень логирования модуля
    const LOG_LEVEL = 'warn';

    // Функция логирования с проверкой уровня
    function log(level, message, ...args) {
        const levels = { debug: 0, warn: 1, error: 2 };
        if (levels[level] >= levels[LOG_LEVEL]) {
            console[level](`[sub-sup-plugin] ${message}`, ...args);
        }
    }

    // Состояние плагина
    const pluginState = {
        initialized: false,
        ready: false,
        subCounter: 0,
        supCounter: 0
    };

    // Регулярное выражение для обработки экранированных символов
    // same as UNESCAPE_MD_RE plus a space
    const UNESCAPE_RE = /\\([ \\!"#$%&'()*+,./:;<=>?@[\]^_`{|}~-])/g;

    /**
     * Парсер подстрочного текста (~text~)
     * Основан на markdown-it-sub
     */
    function subscript(state, silent) {
        const max = state.posMax;
        const start = state.pos;

        if (state.src.charCodeAt(start) !== 0x7E/* ~ */) {
            return false;
        }

        if (silent) {
            return false; // don't run any pairs in validation mode
        }

        if (start + 2 >= max) {
            return false;
        }

        state.pos = start + 1;
        let found = false;

        while (state.pos < max) {
            if (state.src.charCodeAt(state.pos) === 0x7E/* ~ */) {
                found = true;
                break;
            }
            state.md.inline.skipToken(state);
        }

        if (!found || start + 1 === state.pos) {
            state.pos = start;
            return false;
        }

        const content = state.src.slice(start + 1, state.pos);

        // don't allow unescaped spaces/newlines inside
        if (content.match(/(^|[^\\])(\\\\)*\s/)) {
            state.pos = start;
            return false;
        }

        // found!
        state.posMax = state.pos;
        state.pos = start + 1;

        // Earlier we checked !silent, but this implementation does not need it
        const token_so = state.push('sub_open', 'sub', 1);
        token_so.markup = '~';

        const token_t = state.push('text', '', 0);
        token_t.content = content.replace(UNESCAPE_RE, '$1');

        const token_sc = state.push('sub_close', 'sub', -1);
        token_sc.markup = '~';

        state.pos = state.posMax + 1;
        state.posMax = max;

        pluginState.subCounter++;
        log('debug', `Parsed subscript: ${content}`);

        return true;
    }

    /**
     * Парсер надстрочного текста (^text^)
     * Основан на markdown-it-sup
     */
    function superscript(state, silent) {
        const max = state.posMax;
        const start = state.pos;

        if (state.src.charCodeAt(start) !== 0x5E/* ^ */) {
            return false;
        }

        if (silent) {
            return false; // don't run any pairs in validation mode
        }

        if (start + 2 >= max) {
            return false;
        }

        state.pos = start + 1;
        let found = false;

        while (state.pos < max) {
            if (state.src.charCodeAt(state.pos) === 0x5E/* ^ */) {
                found = true;
                break;
            }
            state.md.inline.skipToken(state);
        }

        if (!found || start + 1 === state.pos) {
            state.pos = start;
            return false;
        }

        const content = state.src.slice(start + 1, state.pos);

        // don't allow unescaped spaces/newlines inside
        if (content.match(/(^|[^\\])(\\\\)*\s/)) {
            state.pos = start;
            return false;
        }

        // found!
        state.posMax = state.pos;
        state.pos = start + 1;

        // Earlier we checked !silent, but this implementation does not need it
        const token_so = state.push('sup_open', 'sup', 1);
        token_so.markup = '^';

        const token_t = state.push('text', '', 0);
        token_t.content = content.replace(UNESCAPE_RE, '$1');

        const token_sc = state.push('sup_close', 'sup', -1);
        token_sc.markup = '^';

        state.pos = state.posMax + 1;
        state.posMax = max;

        pluginState.supCounter++;
        log('debug', `Parsed superscript: ${content}`);

        return true;
    }

    /**
     * Плагин для markdown-it для обработки подстрочного и надстрочного текста
     */
    function subSupPlugin(md, options = {}) {
        log('debug', 'Registering sub-sup plugin with markdown-it');

        try {
            // Регистрируем парсер подстрочного текста после emphasis
            md.inline.ruler.after('emphasis', 'sub', subscript);
            
            // Регистрируем парсер надстрочного текста после sub
            md.inline.ruler.after('sub', 'sup', superscript);

            log('debug', 'Sub-sup plugin rules registered successfully');

            // Уведомляем о регистрации плагина
            if (window.eventBus) {
                window.eventBus.emit('module.sub-sup-plugin.registered', {
                    timestamp: Date.now(),
                    moduleId: 'sub-sup-plugin'
                });
            }

        } catch (error) {
            log('error', 'Failed to register sub-sup plugin:', error);
            
            // Уведомляем об ошибке
            if (window.eventBus) {
                window.eventBus.emit('module.sub-sup-plugin.error', {
                    timestamp: Date.now(),
                    moduleId: 'sub-sup-plugin',
                    error: error.message
                });
            }
        }
    }

    /**
     * Инициализация плагина
     */
    function initialize() {
        try {
            pluginState.ready = true;
            log('debug', 'Sub-sup plugin initialized successfully');

            // Уведомляем о готовности плагина
            if (window.eventBus) {
                window.eventBus.emit('module.sub-sup-plugin.ready', {
                    timestamp: Date.now(),
                    moduleId: 'sub-sup-plugin'
                });
            }

            return true;
        } catch (error) {
            log('error', 'Failed to initialize sub-sup plugin:', error);
            
            // Уведомляем об ошибке
            if (window.eventBus) {
                window.eventBus.emit('module.sub-sup-plugin.error', {
                    timestamp: Date.now(),
                    moduleId: 'sub-sup-plugin',
                    error: error.message
                });
            }
            
            return false;
        }
    }

    /**
     * Рендеринг контента плагина на странице
     * Для sub-sup плагина специальный рендеринг не требуется,
     * так как HTML теги <sub> и <sup> поддерживаются браузерами нативно
     */
    function renderContent() {
        // Подстрочный и надстрочный текст рендерится браузером автоматически
        // Никаких дополнительных действий не требуется
        log('debug', 'Sub-sup content rendered (native browser support)');
        
        // Уведомляем о рендеринге
        if (window.eventBus) {
            window.eventBus.emit('module.sub-sup-plugin.content-rendered', {
                timestamp: Date.now(),
                moduleId: 'sub-sup-plugin',
                subCount: pluginState.subCounter,
                supCount: pluginState.supCounter
            });
        }
    }

    /**
     * Проверка наличия подстрочного или надстрочного текста в контенте
     */
    function hasContent(content) {
        if (!content) return false;
        
        // Проверяем наличие паттернов ~text~ или ^text^
        const subPattern = /~[^~\s][^~]*[^~\s]~/;
        const supPattern = /\^[^\^\s][^\^]*[^\^\s]\^/;
        
        return subPattern.test(content) || supPattern.test(content);
    }

    /**
     * Получение статистики плагина
     */
    function getStats() {
        const subElements = document.querySelectorAll('sub').length;
        const supElements = document.querySelectorAll('sup').length;
        
        return {
            initialized: pluginState.initialized,
            ready: pluginState.ready,
            subCounter: pluginState.subCounter,
            supCounter: pluginState.supCounter,
            subElementsOnPage: subElements,
            supElementsOnPage: supElements,
            totalElements: subElements + supElements
        };
    }

    /**
     * Обновление темы (заглушка для совместимости с архитектурой)
     */
    function updateTheme(theme) {
        log('debug', `Theme updated to: ${theme} (no action needed for sub-sup)`);
    }

    // Инициализация при загрузке DOM
    document.addEventListener('DOMContentLoaded', function() {
        log('debug', 'DOM loaded, initializing Sub-sup plugin');
        
        // Инициализация плагина
        initialize();
        
        // Регистрация плагина в ядре markdown-it
        if (window.markdownCore) {
            window.markdownCore.registerPlugin('sub-sup', subSupPlugin);
            log('debug', 'Sub-sup plugin registered with markdown core');
        } else {
            log('warn', 'Markdown core not available, plugin will be registered later');
            // Ждем готовности ядра
            if (window.eventBus) {
                window.eventBus.on('module.markdown-core.ready', () => {
                    if (window.markdownCore) {
                        window.markdownCore.registerPlugin('sub-sup', subSupPlugin);
                        log('debug', 'Sub-sup plugin registered with markdown core (delayed)');
                    }
                });
            }
        }

        pluginState.initialized = true;
        log('debug', 'Sub-sup plugin initialized');
    });

    // Подписка на изменения темы
    if (window.eventBus) {
        window.eventBus.on('globalVars.bootstrapTheme.changed', (theme) => {
            updateTheme(theme);
        });
    }

    // Публичный API
    window.subSupPlugin = {
        // Основные функции
        plugin: subSupPlugin,
        initialize: initialize,
        renderContent: renderContent,
        
        // Утилиты
        hasContent: hasContent,
        updateTheme: updateTheme,
        
        // Информация о состоянии
        getStats: getStats,
        
        // Проверка готовности
        get isReady() {
            return pluginState.ready;
        }
    };

    log('debug', 'Sub-sup plugin module loaded');

})();