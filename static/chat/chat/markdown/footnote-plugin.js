/**
 * Плагин Footnote для markdown-it
 * Обеспечивает рендеринг сносок в markdown
 * Основан на официальном плагине markdown-it-footnote
 * Источник: https://github.com/markdown-it/markdown-it-footnote
 */
(function() {
    'use strict';

    // Уровень логирования модуля
    const LOG_LEVEL = 'warn';

    // Функция логирования с проверкой уровня
    function log(level, message, ...args) {
        const levels = { debug: 0, warn: 1, error: 2 };
        if (levels[level] >= levels[LOG_LEVEL]) {
            console[level](`[footnote-plugin] ${message}`, ...args);
        }
    }

    // Состояние плагина
    const pluginState = {
        initialized: false,
        ready: false,
        footnoteCounter: 0
    };

    ///////////////////////////////////////////////////////////////////////////////
    // Функции рендеринга

    function render_footnote_anchor_name(tokens, idx, options, env/*, slf */) {
        const n = Number(tokens[idx].meta.id + 1).toString();
        let prefix = '';
        if (typeof env.docId === 'string') prefix = `-${env.docId}-`;
        return prefix + n;
    }

    function render_footnote_caption(tokens, idx/*, options, env, slf */) {
        let n = Number(tokens[idx].meta.id + 1).toString();
        if (tokens[idx].meta.subId > 0) n += `:${tokens[idx].meta.subId}`;
        return `[${n}]`;
    }

    function render_footnote_ref(tokens, idx, options, env, slf) {
        const id = slf.rules.footnote_anchor_name(tokens, idx, options, env, slf);
        const caption = slf.rules.footnote_caption(tokens, idx, options, env, slf);
        let refid = id;
        if (tokens[idx].meta.subId > 0) refid += `:${tokens[idx].meta.subId}`;
        return `<sup class="footnote-ref"><a href="#fn${id}" id="fnref${refid}">${caption}</a></sup>`;
    }

    function render_footnote_block_open(tokens, idx, options) {
        return (options.xhtmlOut ? '<hr class="footnotes-sep" />\n' : '<hr class="footnotes-sep">\n') +
               '<section class="footnotes">\n' +
               '<ol class="footnotes-list">\n';
    }

    function render_footnote_block_close() {
        return '</ol>\n</section>\n';
    }

    function render_footnote_open(tokens, idx, options, env, slf) {
        let id = slf.rules.footnote_anchor_name(tokens, idx, options, env, slf);
        if (tokens[idx].meta.subId > 0) id += `:${tokens[idx].meta.subId}`;
        return `<li id="fn${id}" class="footnote-item">`;
    }

    function render_footnote_close() {
        return '</li>\n';
    }

    function render_footnote_anchor(tokens, idx, options, env, slf) {
        let id = slf.rules.footnote_anchor_name(tokens, idx, options, env, slf);
        if (tokens[idx].meta.subId > 0) id += `:${tokens[idx].meta.subId}`;
        /* ↩ с escape-кодом для предотвращения отображения как Apple Emoji на iOS */
        return ` <a href="#fnref${id}" class="footnote-backref">\u21a9\uFE0E</a>`;
    }

    /**
     * Основная функция плагина для markdown-it
     */
    function footnotePlugin(md) {
        const parseLinkLabel = md.helpers.parseLinkLabel;
        const isSpace = md.utils.isSpace;

        // Устанавливаем правила рендеринга
        md.renderer.rules.footnote_ref = render_footnote_ref;
        md.renderer.rules.footnote_block_open = render_footnote_block_open;
        md.renderer.rules.footnote_block_close = render_footnote_block_close;
        md.renderer.rules.footnote_open = render_footnote_open;
        md.renderer.rules.footnote_close = render_footnote_close;
        md.renderer.rules.footnote_anchor = render_footnote_anchor;

        // Вспомогательные функции (используются только в других правилах, токены к ним не привязаны)
        md.renderer.rules.footnote_caption = render_footnote_caption;
        md.renderer.rules.footnote_anchor_name = render_footnote_anchor_name;

        // Обработка определения блока сноски
        function footnote_def(state, startLine, endLine, silent) {
            const start = state.bMarks[startLine] + state.tShift[startLine];
            const max = state.eMarks[startLine];

            // строка должна быть минимум 5 символов - "[^x]:"
            if (start + 4 > max) return false;

            if (state.src.charCodeAt(start) !== 0x5B/* [ */) return false;
            if (state.src.charCodeAt(start + 1) !== 0x5E/* ^ */) return false;

            let pos;
            for (pos = start + 2; pos < max; pos++) {
                if (state.src.charCodeAt(pos) === 0x20) return false;
                if (state.src.charCodeAt(pos) === 0x5D /* ] */) {
                    break;
                }
            }

            if (pos === start + 2) return false; // нет пустых меток сносок
            if (pos + 1 >= max || state.src.charCodeAt(++pos) !== 0x3A /* : */) return false;

            if (silent) return true;

            pos++;

            if (!state.env.footnotes) state.env.footnotes = {};
            if (!state.env.footnotes.refs) state.env.footnotes.refs = {};
            const label = state.src.slice(start + 2, pos - 2);
            state.env.footnotes.refs[`:${label}`] = -1;

            const token_fref_o = new state.Token('footnote_reference_open', '', 1);
            token_fref_o.meta = { label };
            token_fref_o.level = state.level++;
            state.tokens.push(token_fref_o);

            const oldBMark = state.bMarks[startLine];
            const oldTShift = state.tShift[startLine];
            const oldSCount = state.sCount[startLine];
            const oldParentType = state.parentType;
            const posAfterColon = pos;
            const initial = state.sCount[startLine] + pos - (state.bMarks[startLine] + state.tShift[startLine]);

            let offset = initial;

            while (pos < max) {
                const ch = state.src.charCodeAt(pos);

                if (isSpace(ch)) {
                    if (ch === 0x09) {
                        offset += 4 - offset % 4;
                    } else {
                        offset++;
                    }
                } else {
                    break;
                }
                pos++;
            }

            state.tShift[startLine] = pos - posAfterColon;
            state.sCount[startLine] = offset - initial;
            state.bMarks[startLine] = posAfterColon;
            state.blkIndent += 4;
            state.parentType = 'footnote';

            if (state.sCount[startLine] < state.blkIndent) {
                state.sCount[startLine] += state.blkIndent;
            }

            state.md.block.tokenize(state, startLine, endLine, true);

            state.parentType = oldParentType;
            state.blkIndent -= 4;
            state.tShift[startLine] = oldTShift;
            state.sCount[startLine] = oldSCount;
            state.bMarks[startLine] = oldBMark;

            const token_fref_c = new state.Token('footnote_reference_close', '', -1);
            token_fref_c.level = --state.level;
            state.tokens.push(token_fref_c);

            return true;
        }

        // Обработка встроенных сносок (^[...])
        function footnote_inline(state, silent) {
            const max = state.posMax;
            const start = state.pos;

            if (start + 2 >= max) return false;
            if (state.src.charCodeAt(start) !== 0x5E/* ^ */) return false;
            if (state.src.charCodeAt(start + 1) !== 0x5B/* [ */) return false;

            const labelStart = start + 2;
            const labelEnd = parseLinkLabel(state, start + 1);

            // парсер не смог найти ']', значит это не валидная сноска
            if (labelEnd < 0) return false;

            // Мы нашли конец ссылки и точно знаем, что это валидная ссылка;
            // остается только вызвать токенизатор.
            //
            if (!silent) {
                if (!state.env.footnotes) state.env.footnotes = {};
                if (!state.env.footnotes.list) state.env.footnotes.list = [];
                const footnoteId = state.env.footnotes.list.length;

                const tokens = [];
                state.md.inline.parse(
                    state.src.slice(labelStart, labelEnd),
                    state.md,
                    state.env,
                    tokens
                );

                const token = state.push('footnote_ref', '', 0);
                token.meta = { id: footnoteId };

                state.env.footnotes.list[footnoteId] = {
                    content: state.src.slice(labelStart, labelEnd),
                    tokens: tokens
                };
            }

            state.pos = labelEnd + 1;
            state.posMax = max;
            return true;
        }

        // Обработка ссылок на сноски ([^...])
        function footnote_ref(state, silent) {
            const max = state.posMax;
            const start = state.pos;

            // должно быть минимум 4 символа - "[^x]"
            if (start + 3 > max) return false;

            if (!state.env.footnotes || !state.env.footnotes.refs) return false;

            if (state.src.charCodeAt(start) !== 0x5B/* [ */) return false;
            if (state.src.charCodeAt(start + 1) !== 0x5E/* ^ */) return false;

            let pos;
            for (pos = start + 2; pos < max; pos++) {
                if (state.src.charCodeAt(pos) === 0x20) return false;
                if (state.src.charCodeAt(pos) === 0x0A) return false;
                if (state.src.charCodeAt(pos) === 0x5D /* ] */) {
                    break;
                }
            }

            if (pos === start + 2) return false; // нет пустых меток сносок
            if (pos >= max) return false;

            pos++;

            const label = state.src.slice(start + 2, pos - 1);
            if (typeof state.env.footnotes.refs[`:${label}`] === 'undefined') return false;

            if (!silent) {
                if (!state.env.footnotes.list) state.env.footnotes.list = [];

                let footnoteId;
                if (state.env.footnotes.refs[`:${label}`] < 0) {
                    footnoteId = state.env.footnotes.list.length;
                    state.env.footnotes.list[footnoteId] = { label: label, count: 0 };
                    state.env.footnotes.refs[`:${label}`] = footnoteId;
                } else {
                    footnoteId = state.env.footnotes.refs[`:${label}`];
                }

                const footnoteSubId = state.env.footnotes.list[footnoteId].count;
                state.env.footnotes.list[footnoteId].count++;

                const token = state.push('footnote_ref', '', 0);
                token.meta = { id: footnoteId, subId: footnoteSubId, label: label };
            }

            state.pos = pos;
            state.posMax = max;
            return true;
        }

        // Склеивание токенов сносок в конец потока токенов
        function footnote_tail(state) {
            let tokens;
            let current;
            let currentLabel;
            let insideRef = false;
            const refTokens = {};

            if (!state.env.footnotes) {
                return;
            }

            state.tokens = state.tokens.filter(function (tok) {
                if (tok.type === 'footnote_reference_open') {
                    insideRef = true;
                    current = [];
                    currentLabel = tok.meta.label;
                    return false;
                }
                if (tok.type === 'footnote_reference_close') {
                    insideRef = false;
                    // добавляем ':' чтобы избежать конфликта с членами Object.prototype
                    refTokens[':' + currentLabel] = current;
                    return false;
                }
                if (insideRef) {
                    current.push(tok);
                }
                return !insideRef;
            });

            if (!state.env.footnotes.list) { return; }
            const list = state.env.footnotes.list;

            state.tokens.push(new state.Token('footnote_block_open', '', 1));

            for (let i = 0, l = list.length; i < l; i++) {
                const token_fo = new state.Token('footnote_open', '', 1);
                token_fo.meta = { id: i, label: list[i].label };
                state.tokens.push(token_fo);

                if (list[i].tokens) {
                    tokens = [];

                    const token_po = new state.Token('paragraph_open', 'p', 1);
                    token_po.block = true;
                    tokens.push(token_po);

                    const token_i = new state.Token('inline', '', 0);
                    token_i.children = list[i].tokens;
                    token_i.content = list[i].content;
                    tokens.push(token_i);

                    const token_pc = new state.Token('paragraph_close', 'p', -1);
                    token_pc.block = true;
                    tokens.push(token_pc);
                } else if (list[i].label) {
                    tokens = refTokens[`:${list[i].label}`];
                }

                if (tokens) state.tokens = state.tokens.concat(tokens);

                let lastParagraph;
                if (state.tokens[state.tokens.length - 1].type === 'paragraph_close') {
                    lastParagraph = state.tokens.pop();
                } else {
                    lastParagraph = null;
                }

                const t = list[i].count > 0 ? list[i].count : 1;

                for (let j = 0; j < t; j++) {
                    const token_a = new state.Token('footnote_anchor', '', 0);
                    token_a.meta = { id: i, subId: j, label: list[i].label };
                    state.tokens.push(token_a);
                }

                if (lastParagraph) {
                    state.tokens.push(lastParagraph);
                }

                state.tokens.push(new state.Token('footnote_close', '', -1));
            }

            state.tokens.push(new state.Token('footnote_block_close', '', -1));
        }

        // Регистрируем парсеры
        md.block.ruler.before('reference', 'footnote_def', footnote_def, { alt: ['paragraph', 'reference'] });
        md.inline.ruler.after('image', 'footnote_inline', footnote_inline);
        md.inline.ruler.after('footnote_inline', 'footnote_ref', footnote_ref);
        md.core.ruler.after('inline', 'footnote_tail', footnote_tail);
    }

    /**
     * Инициализация плагина
     */
    function initialize() {
        try {
            pluginState.ready = true;
            log('debug', 'Плагин сносок успешно инициализирован');

            // Уведомляем о готовности плагина
            if (window.eventBus) {
                window.eventBus.emit('module.footnote-plugin.ready', {
                    timestamp: Date.now(),
                    moduleId: 'footnote-plugin'
                });
            }

            return true;
        } catch (error) {
            log('error', 'Ошибка инициализации плагина сносок:', error);
            return false;
        }
    }

    /**
     * Рендеринг сносок на странице (если потребуется дополнительная обработка)
     */
    function renderContent() {
        const footnotes = document.querySelectorAll('.footnotes');
        log('debug', `Найдено ${footnotes.length} секций сносок`);

        if (footnotes.length > 0 && window.eventBus) {
            window.eventBus.emit('module.footnote-plugin.content-rendered', {
                timestamp: Date.now(),
                moduleId: 'footnote-plugin',
                elementsCount: footnotes.length
            });
        }
    }

    /**
     * Проверка наличия сносок в тексте
     */
    function hasContent(content) {
        return content && (content.includes('[^') || content.includes('^['));
    }

    /**
     * Получение статистики плагина
     */
    function getStats() {
        const footnoteRefs = document.querySelectorAll('.footnote-ref').length;
        const footnoteItems = document.querySelectorAll('.footnote-item').length;
        
        return {
            initialized: pluginState.initialized,
            ready: pluginState.ready,
            footnoteCounter: pluginState.footnoteCounter,
            footnoteRefs: footnoteRefs,
            footnoteItems: footnoteItems
        };
    }

    // Инициализация при загрузке DOM
    document.addEventListener('DOMContentLoaded', function() {
        log('debug', 'DOM загружен, инициализация плагина сносок');
        
        // Инициализация плагина
        initialize();
        
        // Регистрация плагина в ядре markdown-it
        if (window.markdownCore) {
            window.markdownCore.registerPlugin('footnote', footnotePlugin);
            log('debug', 'Плагин сносок зарегистрирован в ядре markdown');
        } else {
            log('warn', 'Ядро markdown недоступно, плагин будет зарегистрирован позже');
            // Ждем готовности ядра
            if (window.eventBus) {
                window.eventBus.on('module.markdown-core.ready', () => {
                    if (window.markdownCore) {
                        window.markdownCore.registerPlugin('footnote', footnotePlugin);
                        log('debug', 'Плагин сносок зарегистрирован в ядре markdown (отложенно)');
                    }
                });
            }
        }

        pluginState.initialized = true;
        log('debug', 'Плагин сносок инициализирован');
    });

    // Публичный API
    window.footnotePlugin = {
        // Основные функции
        plugin: footnotePlugin,
        initialize: initialize,
        renderContent: renderContent,
        
        // Утилиты
        hasContent: hasContent,
        
        // Информация о состоянии
        getStats: getStats,
        
        // Проверка готовности
        get isReady() {
            return pluginState.ready;
        }
    };

    log('debug', 'Модуль плагина сносок загружен');

})();