/**
 * Плагин Math для markdown-it
 * Обеспечивает рендеринг математических формул с помощью KaTeX
 * Основан на официальном плагине markdown-it-katex
 */
(function() {
    'use strict';

    // Уровень логирования модуля
    const LOG_LEVEL = 'warn';

    // Функция логирования с проверкой уровня
    function log(level, message, ...args) {
        const levels = { debug: 0, warn: 1, error: 2 };
        if (levels[level] >= levels[LOG_LEVEL]) {
            console[level](`[math-plugin] ${message}`, ...args);
        }
    }

    // Состояние плагина
    const pluginState = {
        initialized: false,
        katexReady: false,
        formulaCounter: 0
    };

    // Проверка валидности разделителя
    function isValidDelim(state, pos) {
        var prevChar, nextChar, max = state.posMax,
            can_open = true,
            can_close = true;

        prevChar = pos > 0 ? state.src.charCodeAt(pos - 1) : -1;
        nextChar = pos + 1 <= max ? state.src.charCodeAt(pos + 1) : -1;

        // Проверяем условия для открытия и закрытия
        if (prevChar === 0x20/* " " */ || prevChar === 0x09/* \t */ ||
            (nextChar >= 0x30/* "0" */ && nextChar <= 0x39/* "9" */)) {
            can_close = false;
        }
        if (nextChar === 0x20/* " " */ || nextChar === 0x09/* \t */) {
            can_open = false;
        }

        return {
            can_open: can_open,
            can_close: can_close
        };
    }

    // Парсер inline математики
    function math_inline(state, silent) {
        var start, match, token, res, pos, esc_count;

        if (state.src[state.pos] !== "$") {
            return false;
        }

        res = isValidDelim(state, state.pos);
        if (!res.can_open) {
            if (!silent) { state.pending += "$"; }
            state.pos += 1;
            return true;
        }

        // Ищем закрывающий разделитель с учетом экранирования
        start = state.pos + 1;
        match = start;
        while ((match = state.src.indexOf("$", match)) !== -1) {
            // Проверяем экранирование
            pos = match - 1;
            while (state.src[pos] === "\\") { pos -= 1; }

            // Четное количество экранирующих символов = потенциальный закрывающий разделитель
            if (((match - pos) % 2) == 1) { break; }
            match += 1;
        }

        // Не найден закрывающий разделитель
        if (match === -1) {
            if (!silent) { state.pending += "$"; }
            state.pos = start;
            return true;
        }

        // Пустое содержимое
        if (match - start === 0) {
            if (!silent) { state.pending += "$$"; }
            state.pos = start + 1;
            return true;
        }

        // Проверяем валидность закрывающего разделителя
        res = isValidDelim(state, match);
        if (!res.can_close) {
            if (!silent) { state.pending += "$"; }
            state.pos = start;
            return true;
        }

        if (!silent) {
            token = state.push('math_inline', 'span', 0);
            token.markup = "$";
            token.content = state.src.slice(start, match);
        }

        state.pos = match + 1;
        return true;
    }

    // Парсер block математики
    function math_block(state, start, end, silent) {
        var firstLine, lastLine, next, lastPos, found = false, token,
            pos = state.bMarks[start] + state.tShift[start],
            max = state.eMarks[start];

        if (pos + 2 > max) { return false; }
        if (state.src.slice(pos, pos + 2) !== '$$') { return false; }

        pos += 2;
        firstLine = state.src.slice(pos, max);

        if (silent) { return true; }

        if (firstLine.trim().slice(-2) === '$$') {
            // Однострочная формула
            firstLine = firstLine.trim().slice(0, -2);
            found = true;
        }

        for (next = start; !found;) {
            next++;
            if (next >= end) { break; }

            pos = state.bMarks[next] + state.tShift[next];
            max = state.eMarks[next];

            if (pos < max && state.tShift[next] < state.blkIndent) {
                // Строка с отрицательным отступом должна остановить список
                break;
            }

            if (state.src.slice(pos, max).trim().slice(-2) === '$$') {
                lastPos = state.src.slice(0, max).lastIndexOf('$$');
                lastLine = state.src.slice(pos, lastPos);
                found = true;
            }
        }

        state.line = next + 1;
        token = state.push('math_block', 'div', 0);
        token.block = true;
        token.content = (firstLine && firstLine.trim() ? firstLine + '\n' : '') +
                       state.getLines(start + 1, next, state.tShift[start], true) +
                       (lastLine && lastLine.trim() ? lastLine : '');
        token.map = [start, state.line];
        token.markup = '$$';
        return true;
    }

    /**
     * Плагин для markdown-it для обработки математических формул
     */
    function mathPlugin(md, options) {
        options = options || {};

        // Рендерер inline формул
        var katexInline = function(latex) {
            options.displayMode = false;
            try {
                return window.katex.renderToString(latex, options);
            } catch (error) {
                if (options.throwOnError) {
                    log('error', 'KaTeX inline error:', error);
                }
                return escapeHtml(latex);
            }
        };

        var inlineRenderer = function(tokens, idx) {
            const formulaId = 'math-inline-' + (++pluginState.formulaCounter);
            const latex = tokens[idx].content;
            return `<span class="math-formula math-inline" id="${formulaId}" data-formula="${escapeHtml(latex)}">${escapeHtml(latex)}</span>`;
        };

        // Рендерер block формул
        var katexBlock = function(latex) {
            options.displayMode = true;
            try {
                return "<p>" + window.katex.renderToString(latex, options) + "</p>";
            } catch (error) {
                if (options.throwOnError) {
                    log('error', 'KaTeX block error:', error);
                }
                return escapeHtml(latex);
            }
        };

        var blockRenderer = function(tokens, idx) {
            const formulaId = 'math-block-' + (++pluginState.formulaCounter);
            const latex = tokens[idx].content;
            return `<div class="math-formula math-block" id="${formulaId}" data-formula="${escapeHtml(latex)}">${escapeHtml(latex)}</div>\n`;
        };

        md.inline.ruler.after('escape', 'math_inline', math_inline);
        md.block.ruler.after('blockquote', 'math_block', math_block, {
            alt: ['paragraph', 'reference', 'blockquote', 'list']
        });
        md.renderer.rules.math_inline = inlineRenderer;
        md.renderer.rules.math_block = blockRenderer;
    }

    /**
     * Инициализация библиотеки KaTeX
     */
    function initializeKaTeX() {
        if (!window.katex) {
            log('error', 'KaTeX library not found');
            return false;
        }

        if (pluginState.katexReady) {
            log('debug', 'KaTeX already initialized');
            return true;
        }

        try {
            pluginState.katexReady = true;
            log('debug', 'KaTeX initialized successfully');

            // Уведомляем о готовности плагина
            if (window.eventBus) {
                window.eventBus.emit('module.math-plugin.ready', {
                    timestamp: Date.now(),
                    moduleId: 'math-plugin'
                });
            }

            return true;
        } catch (error) {
            log('error', 'Failed to initialize KaTeX:', error);
            return false;
        }
    }

    /**
     * Рендеринг всех математических формул на странице
     */
    function renderFormulas() {
        if (!window.katex || !pluginState.katexReady) {
            log('warn', 'KaTeX not ready, attempting to initialize');
            if (!initializeKaTeX()) {
                return;
            }
        }
        
        const formulas = document.querySelectorAll('.math-formula:not([data-processed])');
        log('debug', `Found ${formulas.length} unprocessed math formulas`);

        for (const formula of formulas) {
            renderSingleFormula(formula);
        }

        // Уведомляем о завершении рендеринга
        if (window.eventBus && formulas.length > 0) {
            window.eventBus.emit('module.math-plugin.content-rendered', {
                timestamp: Date.now(),
                moduleId: 'math-plugin',
                elementsCount: formulas.length
            });
        }
    }

    /**
     * Рендеринг одной формулы
     */
    function renderSingleFormula(element) {
        if (!element || element.hasAttribute('data-processed')) {
            return;
        }

        try {
            const formulaText = element.getAttribute('data-formula') || element.textContent;
            const isBlock = element.classList.contains('math-block');
            
            log('debug', `Rendering ${isBlock ? 'block' : 'inline'} formula: ${formulaText}`);

            // Рендерим формулу
            window.katex.render(formulaText, element, {
                displayMode: isBlock,
                throwOnError: false,
                errorColor: '#cc0000'
            });
            
            element.setAttribute('data-processed', 'true');
            log('debug', `Formula rendered successfully: ${element.id}`);

            // Уведомляем о рендеринге формулы
            if (window.eventBus) {
                window.eventBus.emit('module.math-plugin.formula-rendered', {
                    timestamp: Date.now(),
                    moduleId: 'math-plugin',
                    formulaId: element.id,
                    isBlock: isBlock
                });
            }

        } catch (error) {
            log('error', 'Math rendering error:', error);
            
            // Показываем ошибку пользователю
            element.innerHTML = `
                <div class="alert alert-warning">
                    <strong>Ошибка рендеринга формулы:</strong><br>
                    ${escapeHtml(error.message)}<br>
                    <small class="text-muted">Проверьте синтаксис LaTeX формулы.</small>
                </div>
            `;
            element.setAttribute('data-processed', 'true');

            // Уведомляем об ошибке
            if (window.eventBus) {
                window.eventBus.emit('module.math-plugin.error', {
                    timestamp: Date.now(),
                    moduleId: 'math-plugin',
                    formulaId: element.id,
                    error: error.message
                });
            }
        }
    }

    /**
     * Проверка наличия математических формул в тексте
     */
    function hasContent(content) {
        return content && (content.includes('$') || content.includes('$$'));
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
     * Сброс состояния формул для повторного рендеринга
     */
    function resetFormulas() {
        document.querySelectorAll('.math-formula[data-processed]').forEach(formula => {
            formula.removeAttribute('data-processed');
        });
        log('debug', 'Reset all formula processing flags');
    }

    /**
     * Получение статистики плагина
     */
    function getStats() {
        const totalFormulas = document.querySelectorAll('.math-formula').length;
        const processedFormulas = document.querySelectorAll('.math-formula[data-processed]').length;
        
        return {
            initialized: pluginState.initialized,
            katexReady: pluginState.katexReady,
            formulaCounter: pluginState.formulaCounter,
            totalFormulas: totalFormulas,
            processedFormulas: processedFormulas,
            pendingFormulas: totalFormulas - processedFormulas
        };
    }

    // Инициализация при загрузке DOM
    document.addEventListener('DOMContentLoaded', function() {
        log('debug', 'DOM loaded, initializing Math plugin');
        
        // Инициализация KaTeX
        setTimeout(initializeKaTeX, 100);
        
        // Регистрация плагина в ядре markdown-it
        if (window.markdownCore) {
            window.markdownCore.registerPlugin('math', mathPlugin);
            log('debug', 'Math plugin registered with markdown core');
        } else {
            log('warn', 'Markdown core not available, plugin will be registered later');
            // Ждем готовности ядра
            if (window.eventBus) {
                window.eventBus.on('module.markdown-core.ready', () => {
                    if (window.markdownCore) {
                        window.markdownCore.registerPlugin('math', mathPlugin);
                        log('debug', 'Math plugin registered with markdown core (delayed)');
                    }
                });
            }
        }

        pluginState.initialized = true;
        log('debug', 'Math plugin initialized');
    });

    // Публичный API
    window.mathPlugin = {
        // Основные функции
        plugin: mathPlugin,
        initialize: initializeKaTeX,
        renderFormulas: renderFormulas,
        renderSingleFormula: renderSingleFormula,
        
        // Утилиты
        hasContent: hasContent,
        resetFormulas: resetFormulas,
        
        // Информация о состоянии
        getStats: getStats,
        
        // Проверка готовности
        get isReady() {
            return pluginState.katexReady;
        }
    };

    log('debug', 'Math plugin module loaded');

})();