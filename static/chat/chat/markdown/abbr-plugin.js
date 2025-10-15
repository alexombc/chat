/**
 * Плагин Abbreviation для markdown-it
 * Обеспечивает рендеринг аббревиатур с тегом <abbr>
 * Основан на официальном плагине markdown-it-abbr
 * Источник: https://github.com/markdown-it/markdown-it-abbr
 */
(function() {
    'use strict';

    // Уровень логирования модуля
    const LOG_LEVEL = 'warn';

    // Функция логирования с проверкой уровня
    function log(level, message, ...args) {
        const levels = { debug: 0, warn: 1, error: 2 };
        if (levels[level] >= levels[LOG_LEVEL]) {
            console[level](`[abbr-plugin] ${message}`, ...args);
        }
    }

    // Состояние плагина
    const pluginState = {
        initialized: false,
        ready: false,
        abbreviationCounter: 0
    };

    /**
     * Основная функция плагина для markdown-it
     * Основана на официальном markdown-it-abbr плагине
     */
    function abbrPlugin(md) {
        const escapeRE = md.utils.escapeRE;
        const arrayReplaceAt = md.utils.arrayReplaceAt;

        // ASCII символы в категориях Cc, Sc, Sm, Sk, на которых следует завершать;
        // можно проверить классы символов здесь:
        // http://www.unicode.org/Public/UNIDATA/UnicodeData.txt
        const OTHER_CHARS = ' \\r\\n$+<=>^`|~';
        const UNICODE_PUNCT_RE = md.utils.lib.ucmicro.P.source;
        const UNICODE_SPACE_RE = md.utils.lib.ucmicro.Z.source;

        /**
         * Парсер определений аббревиатур
         */
        function abbr_def(state, startLine, endLine, silent) {
            let labelEnd;
            let pos = state.bMarks[startLine] + state.tShift[startLine];
            const max = state.eMarks[startLine];

            if (pos + 2 >= max) {
                return false;
            }

            if (state.src.charCodeAt(pos++) !== 0x2A/* * */) {
                return false;
            }

            if (state.src.charCodeAt(pos++) !== 0x5B/* [ */) {
                return false;
            }

            const labelStart = pos;

            for (; pos < max; pos++) {
                const ch = state.src.charCodeAt(pos);
                if (ch === 0x5B /* [ */) {
                    return false;
                } else if (ch === 0x5D /* ] */) {
                    labelEnd = pos;
                    break;
                } else if (ch === 0x5C /* \ */) {
                    pos++;
                }
            }

            if (labelEnd < 0 || state.src.charCodeAt(labelEnd + 1) !== 0x3A/* : */) {
                return false;
            }

            if (silent) {
                return true;
            }

            const label = state.src.slice(labelStart, labelEnd).replace(/\\\\(.)/g, '$1');
            const title = state.src.slice(labelEnd + 2, max).trim();

            if (label.length === 0) {
                return false;
            }

            if (title.length === 0) {
                return false;
            }

            if (!state.env.abbreviations) {
                state.env.abbreviations = {};
            }

            // добавляем ':' чтобы избежать конфликта с членами Object.prototype
            if (typeof state.env.abbreviations[':' + label] === 'undefined') {
                state.env.abbreviations[':' + label] = title;
                pluginState.abbreviationCounter++;
                log('debug', `Registered abbreviation: ${label} -> ${title}`);
            }

            state.line = startLine + 1;
            return true;
        }

        /**
         * Замена аббревиатур в тексте
         */
        function abbr_replace(state) {
            const blockTokens = state.tokens;

            if (!state.env.abbreviations) {
                return;
            }

            const regSimple = new RegExp('(?:' +
                Object.keys(state.env.abbreviations).map(function (x) {
                    return x.substr(1);
                }).sort(function (a, b) {
                    return b.length - a.length;
                }).map(escapeRE).join('|') +
                ')');

            const regText = '(^|' + UNICODE_PUNCT_RE + '|' + UNICODE_SPACE_RE +
                '|[' + OTHER_CHARS.split('').map(escapeRE).join('') + '])' +
                '(' + Object.keys(state.env.abbreviations).map(function (x) {
                    return x.substr(1);
                }).sort(function (a, b) {
                    return b.length - a.length;
                }).map(escapeRE).join('|') + ')' +
                '($|' + UNICODE_PUNCT_RE + '|' + UNICODE_SPACE_RE +
                '|[' + OTHER_CHARS.split('').map(escapeRE).join('') + '])';

            const reg = new RegExp(regText, 'g');

            for (let j = 0, l = blockTokens.length; j < l; j++) {
                if (blockTokens[j].type !== 'inline') {
                    continue;
                }

                let tokens = blockTokens[j].children;

                // Сканируем с конца, чтобы сохранить позицию при добавлении новых тегов
                for (let i = tokens.length - 1; i >= 0; i--) {
                    const currentToken = tokens[i];

                    if (currentToken.type !== 'text') {
                        continue;
                    }

                    let pos = 0;
                    const text = currentToken.content;
                    reg.lastIndex = 0;
                    const nodes = [];

                    // быстрый запуск regexp для определения наличия сокращенных слов
                    // в текущем токене
                    if (!regSimple.test(text)) {
                        continue;
                    }

                    let m;
                    while ((m = reg.exec(text))) {
                        if (m.index > 0 || m[1].length > 0) {
                            const token = new state.Token('text', '', 0);
                            token.content = text.slice(pos, m.index + m[1].length);
                            nodes.push(token);
                        }

                        const token_o = new state.Token('abbr_open', 'abbr', 1);
                        token_o.attrs = [['title', state.env.abbreviations[':' + m[2]]]];
                        nodes.push(token_o);

                        const token_t = new state.Token('text', '', 0);
                        token_t.content = m[2];
                        nodes.push(token_t);

                        const token_c = new state.Token('abbr_close', 'abbr', -1);
                        nodes.push(token_c);

                        reg.lastIndex -= m[3].length;
                        pos = reg.lastIndex;
                    }

                    if (!nodes.length) {
                        continue;
                    }

                    if (pos < text.length) {
                        const token = new state.Token('text', '', 0);
                        token.content = text.slice(pos);
                        nodes.push(token);
                    }

                    // заменяем текущий узел
                    blockTokens[j].children = tokens = arrayReplaceAt(tokens, i, nodes);
                }
            }
        }

        // Регистрируем парсеры
        md.block.ruler.before('reference', 'abbr_def', abbr_def, {
            alt: ['paragraph', 'reference']
        });
        md.core.ruler.after('linkify', 'abbr_replace', abbr_replace);
    }

    /**
     * Инициализация плагина
     */
    function initialize() {
        try {
            pluginState.ready = true;
            log('debug', 'Плагин аббревиатур успешно инициализирован');

            // Уведомляем о готовности плагина
            if (window.eventBus) {
                window.eventBus.emit('module.abbr-plugin.ready', {
                    timestamp: Date.now(),
                    moduleId: 'abbr-plugin'
                });
            }

            return true;
        } catch (error) {
            log('error', 'Ошибка инициализации плагина аббревиатур:', error);
            
            // Уведомляем об ошибке
            if (window.eventBus) {
                window.eventBus.emit('module.abbr-plugin.error', {
                    timestamp: Date.now(),
                    moduleId: 'abbr-plugin',
                    error: error.message
                });
            }
            
            return false;
        }
    }

    /**
     * Рендеринг аббревиатур на странице (если потребуется дополнительная обработка)
     */
    function renderContent() {
        const abbreviations = document.querySelectorAll('abbr[title]');
        log('debug', `Найдено ${abbreviations.length} аббревиатур на странице`);

        if (abbreviations.length > 0 && window.eventBus) {
            window.eventBus.emit('module.abbr-plugin.content-rendered', {
                timestamp: Date.now(),
                moduleId: 'abbr-plugin',
                elementsCount: abbreviations.length
            });
        }

        return abbreviations.length;
    }

    /**
     * Проверка наличия аббревиатур в тексте
     */
    function hasContent(content) {
        return content && content.includes('*[');
    }

    /**
     * Получение статистики плагина
     */
    function getStats() {
        const abbrElements = document.querySelectorAll('abbr[title]').length;
        
        return {
            initialized: pluginState.initialized,
            ready: pluginState.ready,
            abbreviationCounter: pluginState.abbreviationCounter,
            abbrElements: abbrElements
        };
    }

    /**
     * Экранирование HTML
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Инициализация при загрузке DOM
    document.addEventListener('DOMContentLoaded', function() {
        log('debug', 'DOM загружен, инициализация плагина аббревиатур');
        
        // Инициализация плагина
        initialize();
        
        // Регистрация плагина в ядре markdown-it
        if (window.markdownCore) {
            window.markdownCore.registerPlugin('abbr', abbrPlugin);
            log('debug', 'Плагин аббревиатур зарегистрирован в ядре markdown');
        } else {
            log('warn', 'Ядро markdown недоступно, плагин будет зарегистрирован позже');
            // Ждем готовности ядра
            if (window.eventBus) {
                window.eventBus.on('module.markdown-core.ready', () => {
                    if (window.markdownCore) {
                        window.markdownCore.registerPlugin('abbr', abbrPlugin);
                        log('debug', 'Плагин аббревиатур зарегистрирован в ядре markdown (отложенно)');
                    }
                });
            }
        }

        pluginState.initialized = true;
        log('debug', 'Плагин аббревиатур инициализирован');
    });

    // Публичный API
    window.abbrPlugin = {
        // Основные функции
        plugin: abbrPlugin,
        initialize: initialize,
        renderContent: renderContent,
        
        // Утилиты
        hasContent: hasContent,
        escapeHtml: escapeHtml,
        
        // Информация о состоянии
        getStats: getStats,
        
        // Проверка готовности
        get isReady() {
            return pluginState.ready;
        }
    };

    log('debug', 'Модуль плагина аббревиатур загружен');

})();