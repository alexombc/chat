/**
 * Плагин Pyodide для markdown-it
 * Обеспечивает интерактивный интерфейс запуска Python кода в браузере
 * 
 * ПРОМПТ для агента ЛЛМ чтобы он мог понимать как использовать этот плагин как инструмент взаимодействия с пользователем:
 */
// У тебя есть инструмент Pyodide для выполнения Python кода в браузере.
// Оберни код в блок ```python и ```. Поддерживаются: requests, numpy, pandas, matplotlib.
// Пользователь видит редактор кода с возможностью его свернуть/развернуть и отдельно ниже - результаты выполнения блока.

// ## У тебя есть возможность использовать в начале Python кода **МАГИЧЕСКИЕ КОМАНДЫ**.
// Магические команды срабатывают только при первом отображении блока кода, 
// После этого пользователь может свободно редактировать и перезапускать код.
// Порядок команд важен: `#%load` должна идти первой, затем  `#%collapse`, затем `#%autorun` в случае их наличия

// 1. Магическая команда `#%collapse` - автосворачивание редактора кода, чтобы код не отвлекал внимание пользователя от результатов вывода кода
// 2. Магическая команда `#%autorun` - автозапуск кода после загрузки библиотек Pyodide
// - Для графиков, результатов вычислений, готовых демонстраций - применяй `#%autorun` + `#%collapse`
// - Для обучающих примеров кода, которые пользователь должен увидеть и сам запустить - магические команды `#%autorun` или `#%collapse` не используй

// 3. Магическая команда `#%load="url"` - загружает готовый шаблон Python кода из указанного URL
// Доступные шаблоны
// - Шаблон для создания тестового графика `matplotlib`
//     - Команда:** `#%load="/static/template/pyodide/example-matplotlib.py"`
//     - Когда использовать: если поьзователь попросит построить произвольный или тестовый или пример графика

(function() {
    'use strict';

    // Уровень логирования модуля
    const LOG_LEVEL = 'warn';

    // Функция логирования с проверкой уровня
    function log(level, message, ...args) {
        const levels = { debug: 0, warn: 1, error: 2 };
        if (levels[level] >= levels[LOG_LEVEL]) {
            console[level](`[pyodide-plugin] ${message}`, ...args);
        }
    }

    // Состояние плагина
    const pluginState = {
        initialized: false,
        pyodideReady: false,
        pyodideInstance: null,
        editorCounter: 0,
        loadingPromise: null,
        librariesLoading: false,
        librariesReady: false,
        packagesLoaded: {
            certifi: false,
            charset_normalizer: false,
            idna: false,
            urllib3: false,
            requests: false,
            numpy: false,
            pandas: false,
            matplotlib: false
        }
    };

    // Состояние магических команд для каждого редактора
    const magicCommandsState = new Map();
    
    // Глобальное отслеживание уже обработанных магических команд (по ID редактора)
    const processedMagicCommands = new Set();
    
    // Отслеживание выполненных команд copy_console и send_console для каждого редактора
    const consoleCommandsExecuted = new Map();

    /**
     * Парсинг магических команд из Python кода
     */
    function parseMagicCommands(code) {
        const commands = {
            autorun: false,
            collapse: false,
            copy_console: null,
            send_console: null
        };
        
        const lines = code.split('\n');
        log('debug', `Парсинг магических команд из ${lines.length} строк кода`);
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            // Проверяем, что строка начинается с магической команды
            if (trimmedLine.startsWith('#%autorun')) {
                commands.autorun = true;
                log('debug', `Найдена команда #%autorun в строке ${i + 1}: ${trimmedLine}`);
            } else if (trimmedLine.startsWith('#%collapse')) {
                commands.collapse = true;
                log('debug', `Найдена команда #%collapse в строке ${i + 1}: ${trimmedLine}`);
            } else if (trimmedLine.startsWith('#%copy_console')) {
                // Парсим команду #%copy_console с опциональным промптом
                const match = trimmedLine.match(/^#%copy_console(?:="([^"]*)")?/);
                if (match) {
                    commands.copy_console = {
                        prompt: match[1] || null
                    };
                    log('debug', `Найдена команда #%copy_console в строке ${i + 1}: ${trimmedLine}, промпт: "${match[1] || 'нет'}"`);
                } else {
                    log('warn', `Неверный синтаксис команды #%copy_console в строке ${i + 1}: ${trimmedLine}`);
                }
            } else if (trimmedLine.startsWith('#%send_console')) {
                // Парсим команду #%send_console с опциональным промптом
                const match = trimmedLine.match(/^#%send_console(?:="([^"]*)")?/);
                if (match) {
                    commands.send_console = {
                        prompt: match[1] || null
                    };
                    log('debug', `Найдена команда #%send_console в строке ${i + 1}: ${trimmedLine}, промпт: "${match[1] || 'нет'}"`);
                } else {
                    log('warn', `Неверный синтаксис команды #%send_console в строке ${i + 1}: ${trimmedLine}`);
                }
            }
        }
        
        log('debug', `Результат парсинга магических команд:`, commands);
        return commands;
    }

    /**
     * Извлечение текстового вывода консоли из результатов выполнения
     */
    function extractConsoleOutput(outputContent) {
        if (!outputContent) {
            return '';
        }
        
        // Получаем текстовое содержимое, исключая HTML элементы графиков
        let textContent = '';
        
        // Если это HTML элемент
        if (outputContent.nodeType === Node.ELEMENT_NODE) {
            // Ищем все pre элементы с текстовым содержимым
            const preElements = outputContent.querySelectorAll('pre');
            if (preElements.length > 0) {
                preElements.forEach(pre => {
                    // Исключаем pre элементы, которые содержат только HTML графики
                    if (!pre.innerHTML.includes('<img') && !pre.innerHTML.includes('<div class="matplotlib-plot-container">')) {
                        textContent += pre.textContent || pre.innerText || '';
                    }
                });
            } else {
                // Если нет pre элементов, берем весь текстовый контент, исключая графики
                const clonedContent = outputContent.cloneNode(true);
                // Удаляем все элементы графиков matplotlib
                const plotContainers = clonedContent.querySelectorAll('.matplotlib-plot-container, img[src^="data:image/png;base64,"]');
                plotContainers.forEach(container => container.remove());
                textContent = clonedContent.textContent || clonedContent.innerText || '';
            }
        } else if (typeof outputContent === 'string') {
            // Если это строка, удаляем HTML теги графиков
            textContent = outputContent.replace(/<div class="matplotlib-plot-container">[\s\S]*?<\/div>/g, '')
                                     .replace(/<img[^>]*src="data:image\/png;base64,[^"]*"[^>]*>/g, '')
                                     .replace(/<[^>]*>/g, ''); // Удаляем все HTML теги
        }
        
        return textContent.trim();
    }

    /**
     * Вставка текста в поле ввода чата
     */
    function insertTextToChat(text, sendImmediately = false) {
        try {
            const messageInput = document.getElementById('messageInput');
            if (!messageInput) {
                log('error', 'Поле ввода чата не найдено');
                return false;
            }
            
            // Вставляем текст в поле ввода
            const currentValue = messageInput.value;
            const separator = currentValue.trim() ? '\n' : '';
            messageInput.value = currentValue + separator + text;
            
            // Вызываем autoResizeTextarea для корректного изменения размера поля
            if (window.chatModule && window.chatModule.autoResizeTextarea) {
                window.chatModule.autoResizeTextarea.call(messageInput);
            }
            
            // Если нужно отправить сообщение сразу
            if (sendImmediately) {
                setTimeout(() => {
                    const sendBtn = document.getElementById('sendBtn');
                    if (sendBtn && messageInput.value.trim()) {
                        sendBtn.click();
                    }
                }, 100); // Небольшая задержка для завершения вставки
            }
            
            return true;
        } catch (error) {
            log('error', 'Ошибка при вставке текста в чат:', error);
            return false;
        }
    }

    /**
     * Выполнение магических команд copy_console и send_console
     */
    function executeConsoleCommands(editorId, outputContent) {
        log('debug', `executeConsoleCommands вызвана для ${editorId}`);
        
        const state = magicCommandsState.get(editorId);
        if (!state) {
            log('debug', `Нет состояния магических команд для ${editorId}`);
            return;
        }
        
        log('debug', `Состояние магических команд для ${editorId}:`, {
            autorun: state.autorun,
            copy_console: state.copy_console,
            send_console: state.send_console
        });
        
        // Проверяем, были ли уже выполнены консольные команды для этого редактора
        if (consoleCommandsExecuted.has(editorId)) {
            log('debug', `Консольные команды для ${editorId} уже были выполнены, пропускаем`);
            return;
        }
        
        // Проверяем наличие команды autorun - консольные команды работают только с autorun
        if (!state.autorun) {
            log('debug', `Нет команды autorun для ${editorId}, пропускаем консольные команды`);
            return;
        }
        
        // Определяем приоритет: send_console имеет приоритет над copy_console
        let commandToExecute = null;
        let commandType = null;
        
        if (state.send_console) {
            commandToExecute = state.send_console;
            commandType = 'send_console';
        } else if (state.copy_console) {
            commandToExecute = state.copy_console;
            commandType = 'copy_console';
        }
        
        if (!commandToExecute) {
            log('debug', `Нет консольных команд для выполнения в ${editorId}`);
            return;
        }
        
        log('debug', `Найдена команда ${commandType} для ${editorId}:`, commandToExecute);
        
        try {
            // Извлекаем консольный вывод
            const consoleOutput = extractConsoleOutput(outputContent);
            log('debug', `Извлеченный консольный вывод для ${editorId} (длина: ${consoleOutput.length}):`, consoleOutput.substring(0, 200) + (consoleOutput.length > 200 ? '...' : ''));
            
            // Формируем текст для вставки
            let textToInsert = '';
            
            if (commandToExecute.prompt) {
                textToInsert = commandToExecute.prompt;
                if (consoleOutput) {
                    textToInsert += '\n\n' + consoleOutput;
                }
            } else {
                // Если нет промпта, вставляем только вывод консоли (если он есть)
                if (consoleOutput) {
                    textToInsert = consoleOutput;
                }
            }
            
            log('debug', `Текст для вставки в чат (длина: ${textToInsert.length}):`, textToInsert.substring(0, 200) + (textToInsert.length > 200 ? '...' : ''));
            
            // Вставляем текст только если есть что вставлять
            if (textToInsert.trim()) {
                const sendImmediately = commandType === 'send_console';
                log('debug', `Вызов insertTextToChat для ${editorId}, sendImmediately: ${sendImmediately}`);
                const success = insertTextToChat(textToInsert, sendImmediately);
                
                if (success) {
                    log('debug', `Команда ${commandType} успешно выполнена для ${editorId}`);
                    // Помечаем команды как выполненные
                    consoleCommandsExecuted.set(editorId, true);
                } else {
                    log('error', `Ошибка выполнения команды ${commandType} для ${editorId}`);
                }
            } else {
                log('debug', `Нет текста для вставки при выполнении команды ${commandType} для ${editorId}`);
                // Все равно помечаем как выполненную, чтобы не повторять
                consoleCommandsExecuted.set(editorId, true);
            }
            
        } catch (error) {
            log('error', `Ошибка при выполнении команды ${commandType} для ${editorId}:`, error);
            // Помечаем как выполненную даже при ошибке, чтобы не повторять
            consoleCommandsExecuted.set(editorId, true);
        }
    }

    /**
     * Парсинг и обработка магической команды #%load="url"
     * Загружает шаблон Python кода с указанного URL
     */
    async function parseLoadCommand(code) {
        const lines = code.split('\n');
        let modifiedCode = code;
        let hasLoadCommand = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            // Проверяем, что строка начинается с магической команды #%load
            if (trimmedLine.startsWith('#%load=')) {
                hasLoadCommand = true;
                
                // Извлекаем URL из команды
                const match = trimmedLine.match(/^#%load\s*=\s*["']([^"']+)["']/);
                if (!match) {
                    // Неверный синтаксис команды
                    const errorComment = '# Команда не выполнена так как в ней нарушен синтаксис (неверный формат URL в кавычках)';
                    lines[i] = line + '\n' + errorComment;
                    console.log('[pyodide-plugin] Неверный синтаксис команды #%load:', trimmedLine);
                    continue;
                }
                
                const url = match[1];
                
                // Валидация URL
                let fullUrl;
                try {
                    if (url.startsWith('/')) {
                        // Относительный URL от корня домена
                        fullUrl = window.location.origin + url;
                    } else if (url.startsWith('http://') || url.startsWith('https://')) {
                        // Полный URL
                        fullUrl = url;
                    } else {
                        // Относительный URL к текущему домену
                        fullUrl = window.location.origin + '/' + url;
                    }
                    
                    // Проверяем, что URL валиден
                    new URL(fullUrl);
                } catch (error) {
                    const errorComment = '# Команда не выполнена так как в ней нарушен синтаксис (неверный формат URL)';
                    lines[i] = line + '\n' + errorComment;
                    console.log('[pyodide-plugin] Неверный URL в команде #%load:', url, error);
                    continue;
                }
                
                try {
                    // Загружаем шаблон кода
                    console.log('[pyodide-plugin] Загрузка шаблона с URL:', fullUrl);
                    const response = await fetch(fullUrl);
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    
                    const templateCode = await response.text();
                    
                    // Проверяем, что загруженный шаблон не содержит команду #%load для предотвращения рекурсии
                    const templateLines = templateCode.split('\n');
                    const filteredTemplateLines = templateLines.filter(templateLine => {
                        const trimmedTemplateLine = templateLine.trim();
                        return !trimmedTemplateLine.startsWith('#%load=');
                    });
                    const filteredTemplateCode = filteredTemplateLines.join('\n');
                    
                    // Вставляем загруженный код после команды #%load
                    lines.splice(i + 1, 0, filteredTemplateCode);
                    
                    console.log('[pyodide-plugin] Шаблон успешно загружен и вставлен');
                    
                } catch (error) {
                    const errorComment = `# Команда не выполнена так как произошла ошибка загрузки: ${error.message}`;
                    lines[i] = line + '\n' + errorComment;
                    console.log('[pyodide-plugin] Ошибка загрузки шаблона:', error);
                }
            }
        }
        
        if (hasLoadCommand) {
            modifiedCode = lines.join('\n');
        }
        
        return modifiedCode;
    }

    /**
     * Плагин для markdown-it для обработки блоков ```python
     */
    function pyodidePlugin(md) {
        const defaultRenderer = md.renderer.rules.fence || function(tokens, idx, options, env, renderer) {
            return renderer.renderToken(tokens, idx, options);
        };

        md.renderer.rules.fence = function(tokens, idx, options, env, renderer) {
            const token = tokens[idx];
            const info = token.info ? token.info.trim() : '';
            const langName = info ? info.split(/\s+/g)[0] : '';

            if (langName === 'python') {
                // Проверяем, идет ли стриминг
                const isStreaming = env && env.isStreaming;
                
                if (isStreaming) {
                    // Во время стриминга НЕ обрабатываем блоки python вообще
                    // Возвращаем обработку обратно к стандартному рендереру
                    log('debug', `Пропуск обработки блока Python во время стриминга`);
                    return defaultRenderer(tokens, idx, options, env, renderer);
                }
                
                const content = token.content.trim();
                
                // Создаем стабильный ID на основе содержимого и позиции
                // Используем простой хеш вместо btoa для поддержки Unicode
                let hash = 0;
                for (let i = 0; i < content.length; i++) {
                    const char = content.charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash = hash & hash; // Преобразуем в 32-битное число
                }
                const contentHash = Math.abs(hash).toString(36).substring(0, 8);
                const editorId = `pyodide-editor-${contentHash}-${idx}`;
                
                // Проверяем, существует ли уже редактор с таким ID
                const existingEditor = document.getElementById(editorId);
                if (existingEditor) {
                    log('debug', `Переиспользование существующего ID редактора: ${editorId}`);
                    // Возвращаем существующий HTML без изменений
                    return existingEditor.outerHTML;
                }
                
                log('debug', `Создание Python редактора с ID: ${editorId}`);
                
                // После завершения стриминга создаем полный интерфейс
                return createPythonEditor(editorId, content);
            }

            return defaultRenderer(tokens, idx, options, env, renderer);
        };
    }

    /**
     * Создание HTML интерфейса Python редактора
     */
    function createPythonEditor(editorId, initialCode) {
        // Парсим магические команды из кода
        const magicCommands = parseMagicCommands(initialCode);
        
        // Проверяем наличие команды #%load для последующей обработки
        const hasLoadCommand = initialCode.includes('#%load=');
        
        // Проверяем, есть ли уже состояние для этого редактора
        const existingState = magicCommandsState.get(editorId);
        if (existingState) {
            log('debug', `Состояние магических команд для ${editorId} уже существует, обновляем`);
            // Обновляем только если это действительно новый контент
            existingState.autorun = magicCommands.autorun;
            existingState.collapse = magicCommands.collapse;
            existingState.copy_console = magicCommands.copy_console;
            existingState.send_console = magicCommands.send_console;
            existingState.isFirstRender = true; // Сбрасываем флаг первого рендера
            existingState.autorunExecuted = false; // Сбрасываем флаг выполнения
            existingState.collapseApplied = magicCommands.collapse;
            // Сбрасываем флаг выполнения консольных команд
            consoleCommandsExecuted.delete(editorId);
        } else {
            // Сохраняем состояние магических команд для этого редактора
            magicCommandsState.set(editorId, {
                ...magicCommands,
                hasLoadCommand: hasLoadCommand,
                isFirstRender: true,
                autorunExecuted: false,
                collapseApplied: magicCommands.collapse // Если есть команда collapse, помечаем как уже примененную
            });
        }
        
        log('debug', `Магические команды для ${editorId}:`, magicCommands);
        
        // Определяем начальное состояние сворачивания
        // ВАЖНО: Применяем collapse только если команды еще не были обработаны
        const shouldApplyCollapse = magicCommands.collapse && !processedMagicCommands.has(editorId);
        const isCollapsed = shouldApplyCollapse;
        const collapseIcon = isCollapsed ? 'bi-chevron-right' : 'bi-chevron-down';
        const collapseTitle = isCollapsed ? 'Развернуть редактор' : 'Свернуть редактор';
        const editorBodyDisplay = isCollapsed ? 'none' : 'block';
        const footerDisplay = isCollapsed ? 'none' : 'block';
        
        log('debug', `Collapse для ${editorId}: команда=${magicCommands.collapse}, уже обработано=${processedMagicCommands.has(editorId)}, применяем=${shouldApplyCollapse}`);
        
        return `
            <div class="pyodide-editor-container mb-4" id="${editorId}" data-python-content="${escapeHtml(initialCode)}" data-first-render="true">
                <!-- Лоадер инициализации Pyodide -->
                <div class="pyodide-loader" style="display: ${pluginState.pyodideReady ? 'none' : 'block'};">
                    <div class="card">
                        <div class="card-body text-center py-4">
                            <div class="progress mb-3">
                                <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" style="width: 0%" id="${editorId}-progress"></div>
                            </div>
                            <div class="spinner-border text-primary mb-2" role="status">
                                <span class="visually-hidden">Загрузка...</span>
                            </div>
                            <p class="mb-0 text-muted" id="${editorId}-status">Инициализация Pyodide...</p>
                        </div>
                    </div>
                </div>

                <!-- Основной интерфейс редактора -->
                <div class="pyodide-editor" style="display: ${pluginState.pyodideReady ? 'block' : 'none'};">
                    <div class="card">
                        <!-- Шапка редактора -->
                        <div class="card-header bg-secondary text-white" style="padding: 0.35rem 1rem;">
                            <div class="d-flex justify-content-between align-items-center">
                                <div class="d-flex align-items-center">
                                    <button class="btn btn-sm text-white p-0 me-2" id="${editorId}-collapse-btn" onclick="window.pyodidePlugin.toggleCollapse('${editorId}')" title="${collapseTitle}" style="border: none; background: none; font-size: 16px; margin-left: 4px;">
                                        <i class="bi ${collapseIcon}" id="${editorId}-collapse-icon"></i>
                                    </button>
                                    <div class="vr" style="margin: 0 16px; height: 29px;"></div>
                                    <h6 class="mb-0">
                                        <i class="bi bi-code-slash"></i> Редактор Python кода
                                    </h6>
                                </div>
                                <div class="btn-group btn-group-sm" role="group">
                                    <button class="btn btn-success btn-sm rounded-pill" id="${editorId}-run-btn" style="border: none;" onclick="window.pyodidePlugin.runCode('${editorId}')" title="${pluginState.librariesLoading ? 'Идет загрузка библиотек...' : 'Выполнить код'}" ${pluginState.librariesLoading ? 'disabled' : ''}>
                                        <span id="${editorId}-run-btn-content" style="display: ${pluginState.librariesLoading ? 'none' : 'inline'};">
                                            <i class="bi bi-play-fill"></i> Выполнить
                                        </span>
                                        <span id="${editorId}-run-btn-loading" style="display: ${pluginState.librariesLoading ? 'inline' : 'none'};">
                                            <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                                            Идет загрузка библиотек...
                                        </span>
                                        <span id="${editorId}-run-btn-executing" style="display: none;">
                                            <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                                            Выполняется...
                                        </span>
                                    </button>
                                    <div class="vr mx-2"></div>
                                    <button class="btn btn-outline-light btn-sm" style="border: none;" onclick="window.pyodidePlugin.uploadFile('${editorId}')" title="Загрузить файл в редактор с ПК">
                                        <i class="bi bi-upload"></i>
                                    </button>
                                    <button class="btn btn-outline-light btn-sm" style="border: none;" onclick="window.pyodidePlugin.pasteFromClipboard('${editorId}')" title="Заменить содержимое в редакторе из буфера обмена">
                                        <i class="bi bi-clipboard-plus"></i>
                                    </button>
                                    <button class="btn btn-outline-light btn-sm" style="border: none;" onclick="window.pyodidePlugin.copyToClipboard('${editorId}')" title="Скопировать содержимое из редактора в буфер обмена">
                                        <i class="bi bi-clipboard"></i>
                                    </button>
                                    <button class="btn btn-outline-light btn-sm" style="border: none;" onclick="window.pyodidePlugin.downloadCode('${editorId}')" title="Скачать содержимое из редактора в файл на ПК">
                                        <i class="bi bi-download"></i>
                                    </button>
                                    <button class="btn btn-outline-light btn-sm" style="border: none;" onclick="window.pyodidePlugin.showHelp('${editorId}')" title="Помощь по работе с блоком Python">
                                        <i class="bi bi-question-circle"></i>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- Редактор кода -->
                        <div class="card-body p-0" style="display: ${editorBodyDisplay};">
                            <div class="editor-container-wrapper position-relative d-flex">
                                <div class="line-numbers bg-body-secondary text-muted border-end" id="${editorId}-line-numbers" style="font-family: 'Courier New', monospace; font-size: 14px; line-height: 1.5; padding: 15px 15px 15px 10px; text-align: right; user-select: none; min-width: 60px; white-space: pre; overflow: hidden; font-weight: 500;">1</div>
                                <div class="editor-content flex-grow-1 position-relative">
                                    <div class="highlight-container bg-body" id="${editorId}-highlight" style="font-family: 'Courier New', monospace; font-size: 14px; line-height: 1.5; padding: 15px; overflow-y: auto; overflow-x: hidden; min-height: 150px; max-height: 800px; white-space: pre-wrap; word-break: break-all; overflow-wrap: break-word; position: relative; z-index: 1;"></div>
                                    <textarea class="editor-textarea" id="${editorId}-textarea" style="width: 100%; height: auto; min-height: 150px; max-height: 800px; resize: none; border: none; outline: none; font-family: 'Courier New', monospace; font-size: 14px; line-height: 1.5; padding: 15px; background: transparent; color: transparent; caret-color: var(--bs-body-color); position: absolute; top: 0; left: 0; z-index: 2; tab-size: 4; white-space: pre-wrap; word-break: break-all; overflow-wrap: break-word;" placeholder="# Введите Python код здесь...">${escapeHtmlForTextarea(initialCode)}</textarea>
                                </div>
                            </div>
                        </div>

                        <!-- Футер с информацией -->
                        <div class="card-footer bg-body-secondary" style="padding: 0.25rem 1rem; display: ${footerDisplay};">
                            <div class="d-flex justify-content-between align-items-center small">
                                <div class="text-body-secondary">
                                    <span id="${editorId}-cursor-info">Строка: 1, Столбец: 1</span>
                                    <span class="ms-3" id="${editorId}-char-count">Символов: ${initialCode.length}</span>
                                    <span class="ms-3" id="${editorId}-line-count">Строк: ${initialCode.split('\n').length}</span>
                                </div>
                                <div>
                                    <span class="badge bg-primary me-1" style="background-color: rgba(var(--bs-primary-rgb), 0.3) !important;">Python 3.11.3</span>
                                    <span class="badge bg-info me-1" style="background-color: rgba(var(--bs-info-rgb), 0.3) !important;">UTF-8</span>
                                    <span class="badge bg-success" style="background-color: rgba(var(--bs-success-rgb), 0.3) !important;">Готов</span>
                                </div>
                            </div>
                        </div>

                        <!-- Шапка результатов -->
                        <div class="card-header bg-secondary text-white" id="${editorId}-results-header" style="display: none;">
                            <div class="d-flex justify-content-between align-items-center">
                                <div class="d-flex align-items-center">
                                    <button class="btn btn-sm text-white p-0 me-2" id="${editorId}-results-collapse-btn" onclick="window.pyodidePlugin.toggleResultsCollapse('${editorId}')" title="Свернуть/развернуть результаты" style="border: none; background: none; font-size: 16px; margin-left: 4px;">
                                        <i class="bi bi-chevron-down" id="${editorId}-results-collapse-icon"></i>
                                    </button>
                                    <div class="vr" style="margin: 0 16px; height: 29px;"></div>
                                    <h6 class="mb-0">
                                        <i class="bi bi-terminal"></i> Результаты выполнения
                                    </h6>
                                </div>
                                <div class="btn-group btn-group-sm" role="group">
                                    <button class="btn btn-outline-light btn-sm" style="border: none;" onclick="window.pyodidePlugin.copyOutputToClipboard('${editorId}')" title="Скопировать результаты из консоли в буфер обмена">
                                        <i class="bi bi-clipboard"></i>
                                    </button>
                                    <button class="btn btn-outline-light btn-sm" style="border: none;" onclick="window.pyodidePlugin.downloadOutput('${editorId}')" title="Скачать результаты на ПК">
                                        <i class="bi bi-download"></i>
                                    </button>
                                    <div class="vr" style="margin: 0 16px;"></div>
                                    <button class="btn btn-dark btn-sm rounded-pill" style="border: none;" onclick="window.pyodidePlugin.clearOutput('${editorId}')" title="Очистить">
                                        <i class="bi bi-trash3"></i> Очистить
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- Область вывода -->
                        <div class="card-body" id="${editorId}-output" style="display: none;">
                            <div class="bg-dark text-light p-3 rounded" id="${editorId}-output-content" style="font-family: 'Courier New', monospace; font-size: 14px; min-height: 100px; max-height: 800px; overflow-y: auto; white-space: pre-wrap;"></div>
                        </div>
                    </div>
                </div>

                <!-- Скрытый input для загрузки файлов -->
                <input type="file" id="${editorId}-file-input" accept=".py,.txt" style="display: none;">
            </div>\n`;
    }

    /**
     * Инициализация Pyodide
     */
    async function initializePyodide() {
        if (pluginState.pyodideReady || pluginState.loadingPromise) {
            return pluginState.loadingPromise || Promise.resolve();
        }

        log('debug', 'Запуск инициализации Pyodide');

        pluginState.loadingPromise = (async () => {
            try {
                // Обновляем статус загрузки
                updateLoadingStatus('Загрузка Pyodide...', 10);

                // Инициализируем Pyodide с локальными файлами
                updateLoadingStatus('Инициализация Python...', 30);
                pluginState.pyodideInstance = await window.loadPyodide({
                    indexURL: "../libs/pyodide/"
                });
                
                updateLoadingStatus('Pyodide готов!', 50);
                log('debug', 'Pyodide успешно инициализирован');

                // Загружаем библиотеки в фоне (как в примере)
                loadLibrariesInBackground();

                updateLoadingStatus('Настройка окружения...', 90);

                updateLoadingStatus('Готово!', 100);

                pluginState.pyodideReady = true;
                log('debug', 'Pyodide успешно инициализирован');

                // Уведомляем о готовности плагина
                if (window.eventBus) {
                    window.eventBus.emit('module.pyodide-plugin.ready', {
                        timestamp: Date.now(),
                        moduleId: 'pyodide-plugin'
                    });
                }

            } catch (error) {
                log('error', 'Не удалось инициализировать Pyodide:', error);
                updateLoadingStatus('Ошибка загрузки Pyodide', 0);
                
                if (window.eventBus) {
                    window.eventBus.emit('module.pyodide-plugin.error', {
                        timestamp: Date.now(),
                        moduleId: 'pyodide-plugin',
                        error: error.message
                    });
                }
                throw error;
            }
        })();

        return pluginState.loadingPromise;
    }

    /**
     * Загрузка скрипта Pyodide (не используется, так как скрипт загружается в HTML)
     */
    async function loadPyodideScript() {
        // Скрипт Pyodide уже загружен в HTML файле
        return Promise.resolve();
    }

    /**
     * Загрузка библиотек в фоновом режиме (как в примере)
     */
    async function loadLibrariesInBackground() {
        try {
            log('debug', 'Загрузка библиотек в фоновом режиме...');
            
            // Устанавливаем состояние загрузки библиотек
            pluginState.librariesLoading = true;
            pluginState.librariesReady = false;
            
            // Обновляем состояние кнопок - показываем лоадер
            setRunButtonsLoading();
            
            // Загружаем зависимости для requests в правильном порядке
            try {
                await pluginState.pyodideInstance.loadPackage('../libs/pyodide/certifi-2025.7.14-py3-none-any.whl');
                pluginState.packagesLoaded.certifi = true;
                log('debug', 'Certifi успешно загружен из локального wheel файла');
            } catch (error) {
                log('warn', 'Не удалось загрузить локальную библиотеку Certifi:', error.message);
            }
            
            try {
                await pluginState.pyodideInstance.loadPackage('../libs/pyodide/charset_normalizer-3.4.2-py3-none-any.whl');
                pluginState.packagesLoaded.charset_normalizer = true;
                log('debug', 'Charset-normalizer успешно загружен из локального wheel файла');
            } catch (error) {
                log('warn', 'Не удалось загрузить локальную библиотеку Charset-normalizer:', error.message);
            }
            
            try {
                await pluginState.pyodideInstance.loadPackage('../libs/pyodide/idna-3.10-py3-none-any.whl');
                pluginState.packagesLoaded.idna = true;
                log('debug', 'IDNA успешно загружен из локального wheel файла');
            } catch (error) {
                log('warn', 'Не удалось загрузить локальную библиотеку IDNA:', error.message);
            }
            
            try {
                await pluginState.pyodideInstance.loadPackage('../libs/pyodide/urllib3-2.5.0-py3-none-any.whl');
                pluginState.packagesLoaded.urllib3 = true;
                log('debug', 'Urllib3 успешно загружен из локального wheel файла');
            } catch (error) {
                log('warn', 'Не удалось загрузить локальную библиотеку Urllib3:', error.message);
            }
            
            // Загружаем requests после всех зависимостей
            try {
                await pluginState.pyodideInstance.loadPackage('../libs/pyodide/requests-2.32.4-py3-none-any.whl');
                pluginState.packagesLoaded.requests = true;
                log('debug', 'Requests успешно загружен из локального wheel файла');
            } catch (error) {
                log('warn', 'Не удалось загрузить локальную библиотеку Requests:', error.message);
            }
            
            // Загружаем по одной библиотеке для лучшей отзывчивости
            try {
                await pluginState.pyodideInstance.loadPackage('numpy');
                pluginState.packagesLoaded.numpy = true;
                log('debug', 'NumPy успешно загружен');
            } catch (error) {
                log('warn', 'Не удалось загрузить NumPy:', error.message);
            }
            
            try {
                await pluginState.pyodideInstance.loadPackage('pandas');
                pluginState.packagesLoaded.pandas = true;
                log('debug', 'Pandas успешно загружен');
            } catch (error) {
                log('warn', 'Не удалось загрузить Pandas:', error.message);
            }
            
            try {
                await pluginState.pyodideInstance.loadPackage('matplotlib');
                pluginState.packagesLoaded.matplotlib = true;
                
                // Настраиваем matplotlib для работы в браузере
                pluginState.pyodideInstance.runPython(`
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import io
    import base64

    # Глобальная переменная для HTML выводов
    if '_html_outputs' not in globals():
        _html_outputs = []

    def show_plot():
        """Функция для отображения графиков в браузере"""
        global _html_outputs
        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
        buf.seek(0)
        img_base64 = base64.b64encode(buf.read()).decode('utf-8')
        buf.close()
        
        # Добавляем HTML изображения в список
        img_html = f'<img src="data:image/png;base64,{img_base64}" style="max-width: 100%; height: auto; margin: 10px 0;" />'
        _html_outputs.append(img_html)
        
        plt.close()
        return img_html

    # Переопределяем plt.show()
    plt.show = show_plot
    print("Matplotlib настроен для работы в браузере")
except ImportError:
    print("Matplotlib недоступен")
`);
                log('debug', 'Matplotlib успешно загружен и настроен');
            } catch (error) {
                log('warn', 'Не удалось загрузить Matplotlib:', error.message);
            }
            
            log('debug', 'Загрузка библиотек завершена');
            
            // Устанавливаем состояние готовности библиотек
            pluginState.librariesLoading = false;
            pluginState.librariesReady = true;
            
            // Обновляем состояние кнопок - скрываем лоадер
            setRunButtonsReady();
            
            // Скрываем лоадеры после завершения загрузки библиотек
            setTimeout(() => {
                document.querySelectorAll('.pyodide-loader').forEach(loader => {
                    loader.style.display = 'none';
                });
                document.querySelectorAll('.pyodide-editor').forEach(editor => {
                    editor.style.display = 'block';
                });
                
                // Инициализируем все редакторы
                initializeAllEditors();
                
                // Обрабатываем магические команды для первого рендера
                processMagicCommandsOnFirstRender();
                
                log('debug', 'Лоадеры скрыты, редакторы активированы');
            }, 500);
            
        } catch (error) {
            log('error', 'Ошибка загрузки библиотек:', error);
            
            // В случае ошибки также сбрасываем состояние
            pluginState.librariesLoading = false;
            pluginState.librariesReady = true; // Позволяем выполнение кода даже если библиотеки не загрузились
            setRunButtonsReady();
        }
    }

    /**
     * Обновление статуса загрузки
     */
    function updateLoadingStatus(message, progress) {
        document.querySelectorAll('[id$="-status"]').forEach(statusEl => {
            statusEl.textContent = message;
        });
        document.querySelectorAll('[id$="-progress"]').forEach(progressEl => {
            progressEl.style.width = progress + '%';
        });
    }

    /**
     * Обновление состояния кнопок выполнения - показать лоадер
     */
    function setRunButtonsLoading() {
        document.querySelectorAll('[id$="-run-btn"]').forEach(button => {
            const content = button.querySelector('[id$="-run-btn-content"]');
            const loading = button.querySelector('[id$="-run-btn-loading"]');
            const executing = button.querySelector('[id$="-run-btn-executing"]');
            
            if (content && loading && executing) {
                content.style.display = 'none';
                loading.style.display = 'inline';
                executing.style.display = 'none';
                button.disabled = true;
                button.title = 'Идет загрузка библиотек...';
            }
        });
    }

    /**
     * Обновление состояния кнопок выполнения - скрыть лоадер
     */
    function setRunButtonsReady() {
        document.querySelectorAll('[id$="-run-btn"]').forEach(button => {
            const content = button.querySelector('[id$="-run-btn-content"]');
            const loading = button.querySelector('[id$="-run-btn-loading"]');
            const executing = button.querySelector('[id$="-run-btn-executing"]');
            
            if (content && loading && executing) {
                content.style.display = 'inline';
                loading.style.display = 'none';
                executing.style.display = 'none';
                button.disabled = false;
                button.title = 'Выполнить код';
            }
        });
    }

    /**
     * Установка состояния выполнения для конкретной кнопки
     */
    function setRunButtonExecuting(editorId) {
        const button = document.getElementById(editorId + '-run-btn');
        if (button) {
            const content = button.querySelector('[id$="-run-btn-content"]');
            const loading = button.querySelector('[id$="-run-btn-loading"]');
            const executing = button.querySelector('[id$="-run-btn-executing"]');
            
            if (content && loading && executing) {
                content.style.display = 'none';
                loading.style.display = 'none';
                executing.style.display = 'inline';
                button.disabled = true;
                button.title = 'Выполняется код...';
            }
        }
    }

    /**
     * Сброс состояния выполнения для конкретной кнопки
     */
    function setRunButtonReady(editorId) {
        const button = document.getElementById(editorId + '-run-btn');
        if (button) {
            const content = button.querySelector('[id$="-run-btn-content"]');
            const loading = button.querySelector('[id$="-run-btn-loading"]');
            const executing = button.querySelector('[id$="-run-btn-executing"]');
            
            if (content && loading && executing) {
                content.style.display = 'inline';
                loading.style.display = 'none';
                executing.style.display = 'none';
                button.disabled = false;
                button.title = 'Выполнить код';
            }
        }
    }

    /**
     * Инициализация всех редакторов на странице
     */
    function initializeAllEditors() {
        document.querySelectorAll('.pyodide-editor-container').forEach(container => {
            const editorId = container.id;
            const textarea = document.getElementById(editorId + '-textarea');
            
            if (textarea) {
                setupEditor(editorId);
            }
        });
    }

    /**
     * Обработка магических команд для конкретного редактора
     */
    function processMagicCommandsForEditor(editorId) {
        log('debug', `processMagicCommandsForEditor вызвана для ${editorId}`);
        
        // ВАЖНО: Проверяем глобальное отслеживание - если команды уже обработаны, пропускаем
        if (processedMagicCommands.has(editorId)) {
            log('debug', `Магические команды для ${editorId} уже были обработаны ранее, пропускаем`);
            return;
        }
        
        const state = magicCommandsState.get(editorId);
        if (!state) {
            log('debug', `Нет состояния магических команд для ${editorId}`);
            return;
        }
        
        log('debug', `Состояние магических команд для ${editorId}:`, state);
        
        const container = document.getElementById(editorId);
        if (!container) {
            log('debug', `Контейнер ${editorId} не найден в DOM`);
            return;
        }
        
        // Проверяем, что это действительно первый рендер
        const isFirstRender = container.getAttribute('data-first-render') === 'true';
        log('debug', `Атрибут data-first-render для ${editorId}: ${container.getAttribute('data-first-render')}`);
        
        if (!isFirstRender) {
            log('debug', `Пропуск обработки магических команд для ${editorId} - не первый рендер`);
            return;
        }
        
        // Дополнительная проверка состояния - если уже обработано, пропускаем
        if (!state.isFirstRender) {
            log('debug', `Пропуск обработки магических команд для ${editorId} - уже обработано в состоянии`);
            return;
        }
        
        log('debug', `Обработка магических команд для ${editorId} при первом рендере:`, state);
        
        // ВАЖНО: Сначала обрабатываем команду #%load для загрузки шаблона
        if (state.hasLoadCommand) {
            const textarea = document.getElementById(editorId + '-textarea');
            if (textarea) {
                const currentCode = textarea.value;
                parseLoadCommand(currentCode).then(processedCode => {
                    if (processedCode !== currentCode) {
                        // Обновляем содержимое редактора с загруженным шаблоном
                        textarea.value = processedCode;
                        // Обновляем редактор для отображения изменений
                        if (textarea._updateEditor) {
                            textarea._updateEditor();
                        }
                        log('debug', `Шаблон загружен и применен для ${editorId}`);
                        
                        // Перепарсим магические команды из обновленного кода
                        const newMagicCommands = parseMagicCommands(processedCode);
                        state.autorun = newMagicCommands.autorun;
                        state.collapse = newMagicCommands.collapse;
                        state.copy_console = newMagicCommands.copy_console;
                        state.send_console = newMagicCommands.send_console;
                        
                        log('debug', `Перепарсинг магических команд после загрузки шаблона для ${editorId}:`, newMagicCommands);
                        
                        // Если в загруженном шаблоне есть команда collapse, применяем её
                        if (newMagicCommands.collapse && !state.collapseApplied) {
                            const collapseIcon = document.getElementById(editorId + '-collapse-icon');
                            const collapseBtn = document.getElementById(editorId + '-collapse-btn');
                            const editorBody = container.querySelector('.card-body');
                            const cardFooter = container.querySelector('.card-footer');
                            
                            if (collapseIcon && collapseBtn && editorBody && cardFooter) {
                                collapseIcon.classList.remove('bi-chevron-down');
                                collapseIcon.classList.add('bi-chevron-right');
                                collapseBtn.title = 'Развернуть редактор';
                                editorBody.style.display = 'none';
                                cardFooter.style.display = 'none';
                                state.collapseApplied = true;
                                log('debug', `Применена команда collapse из загруженного шаблона для ${editorId}`);
                            }
                        }
                    }
                }).catch(error => {
                    log('error', `Ошибка обработки команды #%load для ${editorId}:`, error);
                });
            }
        }
        
        // Обрабатываем команду %autorun (collapse уже была применена в HTML)
        if (state.autorun && !state.autorunExecuted) {
            setTimeout(() => {
                runCode(editorId).then(() => {
                    state.autorunExecuted = true;
                    log('debug', `Выполнена команда %autorun для ${editorId}`);
                    
                    // Если была команда %collapse, убеждаемся что редактор остается свернутым
                    if (state.collapse && state.collapseApplied) {
                        setTimeout(() => {
                            const collapseIcon = document.getElementById(editorId + '-collapse-icon');
                            if (collapseIcon && !collapseIcon.classList.contains('bi-chevron-right')) {
                                // Редактор развернулся, сворачиваем его обратно
                                toggleCollapse(editorId);
                                log('debug', `Повторно свернут редактор ${editorId} после автозапуска`);
                            }
                        }, 200);
                    }
                });
            }, 100);
        }
        
        // Помечаем, что первый рендер обработан
        state.isFirstRender = false;
        container.setAttribute('data-first-render', 'false');
        
        // ВАЖНО: Добавляем в глобальное отслеживание обработанных команд
        processedMagicCommands.add(editorId);
        log('debug', `Магические команды для ${editorId} добавлены в глобальное отслеживание`);
    }

    /**
     * Обработка магических команд при первом рендере (для всех редакторов)
     */
    function processMagicCommandsOnFirstRender() {
        // Проходим по всем редакторам с магическими командами
        for (const [editorId, state] of magicCommandsState.entries()) {
            processMagicCommandsForEditor(editorId);
        }
    }

    /**
     * Переинициализация редакторов при смене режима просмотра
     */
    function reinitializeEditorsOnModeChange() {
        // Небольшая задержка для завершения рендеринга DOM
        setTimeout(() => {
            log('debug', 'Переинициализация редакторов после смены режима');
            
            // Ищем все контейнеры редакторов
            const containers = document.querySelectorAll('.pyodide-editor-container');
            log('debug', `Найдено ${containers.length} контейнеров редакторов для переинициализации`);
            
            containers.forEach(container => {
                const editorId = container.id;
                
                // ВАЖНО: Проверяем режим родительского сообщения
                const messageContainer = container.closest('[data-mode]');
                const containerMode = messageContainer ? messageContainer.getAttribute('data-mode') : null;
                
                // Переинициализируем только если сообщение в режиме "rendered"
                if (containerMode !== 'rendered') {
                    log('debug', `Пропуск переинициализации редактора ${editorId} в режиме "${containerMode}" (ожидаем "rendered")`);
                    return;
                }
                
                const textarea = document.getElementById(editorId + '-textarea');
                const highlightDiv = document.getElementById(editorId + '-highlight');
                const lineNumbers = document.getElementById(editorId + '-line-numbers');
                
                // Проверяем, что все элементы существуют
                if (textarea && highlightDiv && lineNumbers) {
                    // Проверяем, что элементы видимы (не скрыты)
                    const containerStyle = window.getComputedStyle(container);
                    const isVisible = containerStyle.display !== 'none' && containerStyle.visibility !== 'hidden';
                    
                    if (isVisible) {
                        log('debug', `Переинициализация редактора ${editorId} в режиме "rendered"`);
                        
                        // Принудительно обновляем редактор
                        setupEditor(editorId);
                        
                        // ВАЖНО: Обрабатываем магические команды при переинициализации
                        if (pluginState.librariesReady) {
                            log('debug', `Вызов processMagicCommandsForEditor для переинициализированного ${editorId}`);
                            processMagicCommandsForEditor(editorId);
                        }
                        
                        // Дополнительная проверка и исправление стилей
                        setTimeout(() => {
                            const currentCode = textarea.value;
                            if (currentCode && textarea._updateEditor) {
                                textarea._updateEditor();
                                log('debug', `Дополнительное обновление редактора ${editorId} выполнено`);
                            }
                        }, 50);
                    } else {
                        log('debug', `Редактор ${editorId} скрыт, пропускаем переинициализацию`);
                    }
                } else {
                    log('warn', `Не все элементы найдены для редактора ${editorId}`);
                }
            });
            
            // Также обрабатываем блоки кода Python, которые могли появиться заново
            if (pluginState.pyodideReady) {
                setTimeout(() => {
                    renderEditors();
                }, 100);
            }
        }, 100);
    }

    /**
     * Настройка редактора
     */
    function setupEditor(editorId) {
        const textarea = document.getElementById(editorId + '-textarea');
        const highlightDiv = document.getElementById(editorId + '-highlight');
        const lineNumbers = document.getElementById(editorId + '-line-numbers');
        
        if (!textarea || !highlightDiv || !lineNumbers) {
            log('error', `Элементы редактора не найдены для ${editorId}`);
            return;
        }

        // Удаляем старые обработчики событий если они есть
        const oldUpdateEditor = textarea._updateEditor;
        if (oldUpdateEditor) {
            textarea.removeEventListener('input', oldUpdateEditor);
            textarea.removeEventListener('keyup', oldUpdateEditor);
            textarea.removeEventListener('click', oldUpdateEditor);
        }

        // Обновление редактора
        function updateEditor() {
            const code = textarea.value;
            
            // Подсветка синтаксиса с принудительным обновлением
            if (window.hljs) {
                try {
                    const highlighted = window.hljs.highlight(code, {language: 'python'});
                    highlightDiv.innerHTML = highlighted.value || escapeHtml(code);
                } catch (error) {
                    log('warn', 'Ошибка подсветки синтаксиса:', error);
                    highlightDiv.innerHTML = escapeHtml(code);
                }
            } else {
                highlightDiv.innerHTML = escapeHtml(code);
            }
            
            // Принудительно применяем стили для подсветки
            highlightDiv.style.fontFamily = "'Courier New', monospace";
            highlightDiv.style.fontSize = "14px";
            highlightDiv.style.lineHeight = "1.5";
            highlightDiv.style.whiteSpace = "pre-wrap";
            highlightDiv.style.wordBreak = "break-all";
            highlightDiv.style.overflowWrap = "break-word";
            
            // Обновление нумерации строк
            const lines = code.split('\n').length;
            let numbersHtml = '';
            for (let i = 1; i <= lines; i++) {
                numbersHtml += i + '\n';
            }
            lineNumbers.textContent = numbersHtml;
            
            // Принудительно применяем стили для нумерации
            lineNumbers.style.fontFamily = "'Courier New', monospace";
            lineNumbers.style.fontSize = "14px";
            lineNumbers.style.lineHeight = "1.5";
            lineNumbers.style.fontWeight = "500";
            
            // Принудительно применяем стили для textarea (включая видимость курсора)
            textarea.style.caretColor = "var(--bs-body-color)";
            textarea.style.color = "transparent";
            textarea.style.fontFamily = "'Courier New', monospace";
            textarea.style.fontSize = "14px";
            textarea.style.lineHeight = "1.5";
            textarea.style.whiteSpace = "pre-wrap";
            textarea.style.wordBreak = "break-all";
            textarea.style.overflowWrap = "break-word";
            
            // Синхронизация высоты
            const lineHeight = 21;
            const padding = 30;
            const height = Math.min(Math.max(lines * lineHeight + padding, 150), 800);
            
            textarea.style.height = height + 'px';
            highlightDiv.style.height = height + 'px';
            lineNumbers.style.height = height + 'px';
            
            // Обновление статистики
            updateEditorStats(editorId, code);
        }

        // Сохраняем ссылку на функцию для возможности удаления
        textarea._updateEditor = updateEditor;

        // События редактора
        textarea.addEventListener('input', updateEditor);
        textarea.addEventListener('keyup', updateEditor);
        textarea.addEventListener('click', updateEditor);
        
        textarea.addEventListener('scroll', () => {
            highlightDiv.scrollTop = textarea.scrollTop;
            highlightDiv.scrollLeft = textarea.scrollLeft;
            lineNumbers.scrollTop = textarea.scrollTop;
        });

        // Горячие клавиши
        textarea.addEventListener('keydown', (e) => {
            // Tab - вставка 4 пробелов
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                textarea.value = textarea.value.substring(0, start) + '    ' + textarea.value.substring(end);
                textarea.selectionStart = textarea.selectionEnd = start + 4;
                updateEditor();
            }
            
            // Ctrl+Enter - запуск кода
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                runCode(editorId);
            }
        });

        // Обработчик загрузки файлов
        const fileInput = document.getElementById(editorId + '-file-input');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        textarea.value = e.target.result;
                        updateEditor();
                        showNotification('success', 'Файл загружен в редактор');
                    };
                    reader.readAsText(file);
                }
            });
        }

        // Первоначальное обновление
        updateEditor();
    }

    /**
     * Обновление статистики редактора
     */
    function updateEditorStats(editorId, code) {
        const textarea = document.getElementById(editorId + '-textarea');
        const cursorInfo = document.getElementById(editorId + '-cursor-info');
        const charCount = document.getElementById(editorId + '-char-count');
        const lineCount = document.getElementById(editorId + '-line-count');
        
        if (textarea && cursorInfo && charCount && lineCount) {
            const cursorPos = textarea.selectionStart;
            const textBeforeCursor = code.substring(0, cursorPos);
            const lines = textBeforeCursor.split('\n');
            const currentLine = lines.length;
            const currentColumn = lines[lines.length - 1].length + 1;
            
            cursorInfo.textContent = `Строка: ${currentLine}, Столбец: ${currentColumn}`;
            charCount.textContent = `Символов: ${code.length}`;
            lineCount.textContent = `Строк: ${code.split('\n').length}`;
        }
    }

    /**
     * Выполнение Python кода
     */
    async function runCode(editorId) {
        if (!pluginState.pyodideReady) {
            showNotification('warning', 'Pyodide еще не готов. Дождитесь завершения инициализации.');
            return;
        }

        if (pluginState.librariesLoading) {
            showNotification('warning', 'Идет загрузка библиотек. Дождитесь завершения загрузки.');
            return;
        }

        const textarea = document.getElementById(editorId + '-textarea');
        const outputDiv = document.getElementById(editorId + '-output');
        const outputContent = document.getElementById(editorId + '-output-content');
        const resultsHeader = document.getElementById(editorId + '-results-header');
        
        if (!textarea || !outputDiv || !outputContent || !resultsHeader) {
            log('error', `Элементы вывода не найдены для ${editorId}`);
            return;
        }

        const code = textarea.value.trim();
        if (!code) {
            showNotification('warning', 'Введите Python код для выполнения');
            return;
        }

        // Устанавливаем состояние выполнения для кнопки
        setRunButtonExecuting(editorId);

        // Показываем область вывода
        resultsHeader.style.display = 'block';
        outputDiv.style.display = 'block';
        outputContent.textContent = 'Выполнение кода...\n';

        // Небольшая задержка, чтобы браузер успел обновить UI
        await new Promise(resolve => setTimeout(resolve, 50));

        const startTime = performance.now();

        try {
            // Сначала устанавливаем код в глобальную переменную Pyodide
            pluginState.pyodideInstance.globals.set("user_code", code);
            
            // Выполняем код с перехватом вывода и поддержкой matplotlib
            const result = pluginState.pyodideInstance.runPython(`
import sys
from io import StringIO
import contextlib

# Глобальные переменные для сбора HTML контента
_html_outputs = []

@contextlib.contextmanager
def capture_output():
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    stdout = StringIO()
    stderr = StringIO()
    try:
        sys.stdout = stdout
        sys.stderr = stderr
        yield stdout, stderr
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr

# Очищаем HTML выводы перед выполнением
_html_outputs = []

with capture_output() as (stdout, stderr):
    try:
        # Выполняем пользовательский код из глобальной переменной
        exec(user_code)
        output = stdout.getvalue()
        error = stderr.getvalue()
        
        # Всегда проверяем matplotlib после выполнения кода
        try:
            import matplotlib
            matplotlib.use('Agg')
            import matplotlib.pyplot as plt
            import io
            import base64
            
            # Если есть активные фигуры, сохраняем их
            if plt.get_fignums():
                for fig_num in plt.get_fignums():
                    plt.figure(fig_num)
                    buf = io.BytesIO()
                    plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
                    buf.seek(0)
                    img_base64 = base64.b64encode(buf.read()).decode('utf-8')
                    buf.close()
                    
                    # Создаем уникальный ID для графика
                    plot_id = f'plot_{fig_num}_{hash(img_base64) % 10000}'
                    
                    # Добавляем HTML изображения с тулбаром
                    img_html = f'''
<div class="matplotlib-plot-container" style="margin: 15px 0; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
    <div class="matplotlib-toolbar" style="background: #f8f9fa; padding: 8px 12px; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-weight: 500; color: #495057;">📊 График matplotlib</span>
        <div class="btn-group btn-group-sm" role="group">
            <button class="btn btn-outline-primary btn-sm" onclick="window.pyodidePlugin.downloadPlot('{plot_id}', 'png')" title="Скачать PNG">
                <i class="bi bi-download"></i> PNG
            </button>
            <button class="btn btn-outline-secondary btn-sm" onclick="window.pyodidePlugin.downloadPlot('{plot_id}', 'svg')" title="Скачать SVG">
                <i class="bi bi-download"></i> SVG
            </button>
            <button class="btn btn-outline-info btn-sm" onclick="window.pyodidePlugin.downloadPlot('{plot_id}', 'pdf')" title="Скачать PDF">
                <i class="bi bi-download"></i> PDF
            </button>
            <button class="btn btn-outline-success btn-sm" onclick="window.pyodidePlugin.copyPlotToClipboard('{plot_id}')" title="Копировать изображение">
                <i class="bi bi-clipboard"></i> Копировать
            </button>
        </div>
    </div>
    <div class="matplotlib-plot-image" style="text-align: center; padding: 10px; background: white;">
        <img id="{plot_id}" src="data:image/png;base64,{img_base64}" style="max-width: 100%; height: auto;" />
    </div>
</div>'''
                    _html_outputs.append(img_html)
                
                plt.close('all')
        except ImportError:
            # matplotlib не доступен, ничего не делаем
            pass
        except Exception as mpl_error:
            output += f"\\nОшибка matplotlib: {str(mpl_error)}"
        
        # Добавляем HTML контент в конец вывода
        if _html_outputs:
            if output and not output.endswith('\\n'):
                output += '\\n'
            output += '\\n'.join(_html_outputs)
        
        if error:
            output += "\\nОшибки:\\n" + error
        if not output.strip() and not _html_outputs:
            output = "Код выполнен успешно (без вывода)"
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        output = f"Ошибка выполнения: {type(e).__name__}: {str(e)}\\n\\nПолная трассировка:\\n{tb}"
        
output
`);

            const endTime = performance.now();
            const executionTime = Math.round(endTime - startTime);

            // Проверяем, содержит ли результат HTML (например, изображения matplotlib)
            if (result.includes('<img') || result.includes('<div') || result.includes('<svg')) {
                // Разделяем текстовый и HTML контент
                const parts = result.split(/(<img[^>]*>)/);
                let htmlContent = '';
                let textLength = 0;
                
                for (let i = 0; i < parts.length; i++) {
                    const part = parts[i];
                    if (part.startsWith('<img')) {
                        // HTML изображение - вставляем как есть (не считаем в ограничение)
                        htmlContent += part;
                    } else if (part.trim()) {
                        // Текстовый контент - проверяем ограничение длины
                        textLength += part.length;
                        if (textLength <= 10000) {
                            htmlContent += `<pre style="white-space: pre-wrap; margin: 0;">${escapeHtml(part)}</pre>`;
                        } else {
                            // Обрезаем только текстовую часть
                            const remainingLength = 10000 - (textLength - part.length);
                            if (remainingLength > 0) {
                                const truncatedPart = part.substring(0, remainingLength);
                                htmlContent += `<pre style="white-space: pre-wrap; margin: 0;">${escapeHtml(truncatedPart)}</pre>`;
                            }
                            htmlContent += `<div class="alert alert-info mt-2">
                                <small>... текстовый вывод обрезан (показано ${Math.min(textLength, 10000)} из ${textLength} символов)</small>
                                <button class="btn btn-sm btn-outline-primary ms-2" onclick="window.pyodidePlugin.showFullOutput('${editorId}', ${JSON.stringify(escapeHtml(result))})">
                                    Показать полностью
                                </button>
                            </div>`;
                            break;
                        }
                    }
                }
                
                outputContent.innerHTML = `<div>${htmlContent}</div>`;
            } else {
                // Обычный текстовый вывод с ограничением
                let displayResult = result;
                if (result.length > 10000) {
                    displayResult = result.substring(0, 10000) + '\n\n... вывод обрезан (показано 10000 из ' + result.length + ' символов)';
                    
                    outputContent.innerHTML = `<pre style="white-space: pre-wrap;">${escapeHtml(displayResult)}</pre>
                        <button class="btn btn-sm btn-outline-primary mt-2" onclick="window.pyodidePlugin.showFullOutput('${editorId}', ${JSON.stringify(escapeHtml(result))})">
                            Показать полностью
                        </button>`;
                } else {
                    outputContent.innerHTML = `<pre style="white-space: pre-wrap;">${escapeHtml(displayResult)}</pre>`;
                }
            }

            showNotification('success', `Python код выполнен за ${executionTime}мс`);

            // Выполняем магические команды copy_console и send_console после успешного выполнения
            executeConsoleCommands(editorId, outputContent);

            // Сбрасываем состояние кнопки после успешного выполнения
            setRunButtonReady(editorId);

            // Уведомляем о выполнении кода
            if (window.eventBus) {
                window.eventBus.emit('module.pyodide-plugin.code-executed', {
                    timestamp: Date.now(),
                    moduleId: 'pyodide-plugin',
                    editorId: editorId,
                    executionTime: executionTime
                });
            }

        } catch (error) {
            const endTime = performance.now();
            const executionTime = Math.round(endTime - startTime);
            
            // Формируем подробное сообщение об ошибке
            let errorDetails = `Ошибка выполнения: ${error.message}`;
            if (error.stack) {
                errorDetails += `\n\nСтек вызовов JavaScript:\n${error.stack}`;
            }
            
            outputContent.innerHTML = `<pre style="white-space: pre-wrap; color: #dc3545;">${escapeHtml(errorDetails)}</pre>`;
            showNotification('error', 'Произошла ошибка при выполнении кода');
            
            // Выполняем магические команды copy_console и send_console даже при ошибке
            // (передаем информацию об ошибке как консольный вывод)
            executeConsoleCommands(editorId, outputContent);
            
            // Сбрасываем состояние кнопки после ошибки
            setRunButtonReady(editorId);
            
            log('error', 'Ошибка выполнения Python:', error);
            log('error', 'Стек ошибки:', error.stack);
        }
    }

    /**
     * Показать полный вывод
     */
    function showFullOutput(editorId, fullResult) {
        const outputContent = document.getElementById(editorId + '-output-content');
        if (outputContent) {
            // Проверяем, содержит ли результат HTML
            if (fullResult.includes('<img') || fullResult.includes('<div') || fullResult.includes('<svg')) {
                // Разделяем текстовый и HTML контент
                const parts = fullResult.split(/(<img[^>]*>)/);
                let htmlContent = '';
                
                for (let i = 0; i < parts.length; i++) {
                    const part = parts[i];
                    if (part.startsWith('<img')) {
                        // HTML изображение - вставляем как есть
                        htmlContent += part;
                    } else if (part.trim()) {
                        // Текстовый контент - экранируем и оборачиваем в pre
                        htmlContent += `<pre style="white-space: pre-wrap; margin: 0;">${escapeHtml(part)}</pre>`;
                    }
                }
                
                outputContent.innerHTML = `<div>${htmlContent}</div>`;
            } else {
                // Обычный текстовый вывод
                outputContent.innerHTML = `<pre style="white-space: pre-wrap;">${fullResult}</pre>`;
            }
        }
    }

    /**
     * Очистка вывода
     */
    function clearOutput(editorId) {
        const outputDiv = document.getElementById(editorId + '-output');
        const outputContent = document.getElementById(editorId + '-output-content');
        const resultsHeader = document.getElementById(editorId + '-results-header');
        
        if (outputContent) outputContent.innerHTML = '';
        if (outputDiv) outputDiv.style.display = 'none';
        if (resultsHeader) resultsHeader.style.display = 'none';
        
        showNotification('info', 'Вывод очищен');
    }

    /**
     * Переключение состояния сворачивания редактора
     */
    function toggleCollapse(editorId) {
        const container = document.getElementById(editorId);
        const collapseIcon = document.getElementById(editorId + '-collapse-icon');
        const collapseBtn = document.getElementById(editorId + '-collapse-btn');
        
        if (!container || !collapseIcon || !collapseBtn) {
            log('error', `Элементы для сворачивания не найдены для ${editorId}`);
            return;
        }

        // Находим элементы редактора, которые нужно скрыть/показать (НЕ включая результаты выполнения)
        const editorCard = container.querySelector('.pyodide-editor .card');
        if (!editorCard) {
            log('error', `Карточка редактора не найдена для ${editorId}`);
            return;
        }
        
        // Находим только элементы редактора кода (исключаем результаты выполнения)
        const cardBodies = editorCard.querySelectorAll('.card-body');
        const cardFooter = editorCard.querySelector('.card-footer');
        
        // Определяем какой card-body относится к редактору (первый), а какой к результатам (второй)
        const editorBody = cardBodies[0]; // Редактор кода
        // cardBodies[1] - это результаты выполнения, их НЕ трогаем
        
        // Проверяем текущее состояние по иконке
        const isCollapsed = collapseIcon.classList.contains('bi-chevron-right');
        
        if (isCollapsed) {
            // Разворачиваем
            collapseIcon.classList.remove('bi-chevron-right');
            collapseIcon.classList.add('bi-chevron-down');
            collapseBtn.title = 'Свернуть редактор';
            
            // Показываем только элементы редактора кода
            if (editorBody) editorBody.style.display = 'block';
            if (cardFooter) cardFooter.style.display = 'block';
            
            log('debug', `Редактор ${editorId} развернут`);
        } else {
            // Сворачиваем
            collapseIcon.classList.remove('bi-chevron-down');
            collapseIcon.classList.add('bi-chevron-right');
            collapseBtn.title = 'Развернуть редактор';
            
            // Скрываем только элементы редактора кода
            if (editorBody) editorBody.style.display = 'none';
            if (cardFooter) cardFooter.style.display = 'none';
            
            log('debug', `Редактор ${editorId} свернут`);
        }
    }

    /**
     * Переключение состояния сворачивания результатов выполнения
     */
    function toggleResultsCollapse(editorId) {
        const resultsCollapseIcon = document.getElementById(editorId + '-results-collapse-icon');
        const resultsCollapseBtn = document.getElementById(editorId + '-results-collapse-btn');
        const outputDiv = document.getElementById(editorId + '-output');
        
        if (!resultsCollapseIcon || !resultsCollapseBtn || !outputDiv) {
            log('error', `Элементы для сворачивания результатов не найдены для ${editorId}`);
            return;
        }

        // Проверяем текущее состояние по иконке
        const isCollapsed = resultsCollapseIcon.classList.contains('bi-chevron-right');
        
        if (isCollapsed) {
            // Разворачиваем результаты
            resultsCollapseIcon.classList.remove('bi-chevron-right');
            resultsCollapseIcon.classList.add('bi-chevron-down');
            resultsCollapseBtn.title = 'Свернуть результаты';
            
            // Показываем область вывода
            outputDiv.style.display = 'block';
            
            log('debug', `Результаты ${editorId} развернуты`);
        } else {
            // Сворачиваем результаты
            resultsCollapseIcon.classList.remove('bi-chevron-down');
            resultsCollapseIcon.classList.add('bi-chevron-right');
            resultsCollapseBtn.title = 'Развернуть результаты';
            
            // Скрываем область вывода
            outputDiv.style.display = 'none';
            
            log('debug', `Результаты ${editorId} свернуты`);
        }
    }

    /**
     * Загрузка файла
     */
    function uploadFile(editorId) {
        const fileInput = document.getElementById(editorId + '-file-input');
        if (fileInput) {
            fileInput.click();
        }
    }

    /**
     * Вставка из буфера обмена
     */
    async function pasteFromClipboard(editorId) {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                const textarea = document.getElementById(editorId + '-textarea');
                if (textarea) {
                    textarea.value = text;
                    setupEditor(editorId); // Обновляем редактор
                    showNotification('success', 'Содержимое из буфера обмена загружено в редактор');
                }
            } else {
                showNotification('warning', 'Буфер обмена пуст');
            }
        } catch (error) {
            showNotification('error', 'Не удалось получить доступ к буферу обмена');
            log('error', 'Ошибка доступа к буферу обмена:', error);
        }
    }

    /**
     * Копирование в буфер обмена
     */
    async function copyToClipboard(editorId) {
        const textarea = document.getElementById(editorId + '-textarea');
        if (textarea) {
            try {
                await navigator.clipboard.writeText(textarea.value);
                showNotification('success', 'Содержимое скопировано в буфер обмена');
            } catch (error) {
                // Fallback для старых браузеров
                textarea.select();
                document.execCommand('copy');
                showNotification('success', 'Содержимое скопировано в буфер обмена');
            }
        }
    }

    /**
     * Скачивание кода
     */
    function downloadCode(editorId) {
        const textarea = document.getElementById(editorId + '-textarea');
        if (textarea) {
            const blob = new Blob([textarea.value], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'python_code.py';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showNotification('success', 'Файл скачан');
        }
    }

    /**
     * Копирование результатов выполнения в буфер обмена
     */
    async function copyOutputToClipboard(editorId) {
        const outputContent = document.getElementById(editorId + '-output-content');
        if (outputContent) {
            try {
                // Получаем текстовое содержимое без HTML тегов
                const textContent = outputContent.textContent || outputContent.innerText || '';
                await navigator.clipboard.writeText(textContent);
                showNotification('success', 'Результаты скопированы в буфер обмена');
            } catch (error) {
                showNotification('error', 'Не удалось скопировать результаты в буфер обмена');
                log('error', 'Ошибка копирования результатов:', error);
            }
        } else {
            showNotification('warning', 'Нет результатов для копирования');
        }
    }

    /**
     * Скачивание результатов выполнения (текст + изображения matplotlib)
     */
    async function downloadOutput(editorId) {
        const outputContent = document.getElementById(editorId + '-output-content');
        if (!outputContent) {
            showNotification('warning', 'Нет результатов для сохранения');
            return;
        }

        // Получаем текстовое содержимое без HTML тегов
        const textContent = outputContent.textContent || outputContent.innerText || '';
        
        // Ищем изображения matplotlib в результатах (несколько вариантов селекторов)
        let matplotlibImages = outputContent.querySelectorAll('.matplotlib-plot-image img[id^="plot_"]');
        
        // Если не найдены в контейнере, ищем любые изображения с ID plot_
        if (matplotlibImages.length === 0) {
            matplotlibImages = outputContent.querySelectorAll('img[id^="plot_"]');
        }
        
        // Если все еще не найдены, ищем любые base64 изображения
        if (matplotlibImages.length === 0) {
            matplotlibImages = outputContent.querySelectorAll('img[src^="data:image/png;base64,"]');
        }
        
        log('debug', `Найдено изображений matplotlib: ${matplotlibImages.length}`);
        log('debug', `Длина текстового содержимого: ${textContent.trim().length}`);
        
        // Дополнительная отладочная информация
        if (matplotlibImages.length > 0) {
            log('debug', 'ID найденных изображений:', Array.from(matplotlibImages).map(img => img.id || 'no-id'));
        }
        
        if (!textContent.trim() && matplotlibImages.length === 0) {
            showNotification('warning', 'Нет результатов для сохранения');
            return;
        }

        let downloadCount = 0;
        const totalFiles = (textContent.trim() ? 1 : 0) + matplotlibImages.length;
        
        showNotification('info', `Начинаю скачивание ${totalFiles} файл(ов)...`);

        try {
            // Скачиваем текстовый файл с результатами консоли
            if (textContent.trim()) {
                await downloadTextFile(textContent, 'python_output.txt');
                downloadCount++;
                
                if (matplotlibImages.length > 0) {
                    // Небольшая задержка перед скачиванием изображений
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            // Скачиваем изображения matplotlib по очереди с интервалами
            for (let i = 0; i < matplotlibImages.length; i++) {
                const img = matplotlibImages[i];
                const plotId = img.id || `image_${i}`;
                const filename = `matplotlib_plot_${i + 1}.png`;
                
                log('debug', `Попытка скачать изображение ${i + 1} из ${matplotlibImages.length}: ${filename}`);
                
                try {
                    await downloadImageFromElement(img, filename);
                    downloadCount++;
                    log('debug', `Изображение ${filename} успешно скачано`);
                } catch (imageError) {
                    log('error', `Ошибка скачивания изображения ${filename}:`, imageError);
                    // Продолжаем со следующим изображением, но не увеличиваем счетчик
                }
                
                // Интервал между скачиваниями изображений (кроме последнего)
                if (i < matplotlibImages.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }

            showNotification('success', `Успешно скачано ${downloadCount} файл(ов)`);
            
        } catch (error) {
            log('error', 'Ошибка при скачивании результатов:', error);
            showNotification('error', `Ошибка при скачивании файлов. Скачано: ${downloadCount} из ${totalFiles}`);
        }
    }

    /**
     * Скачивание текстового файла
     */
    async function downloadTextFile(content, filename) {
        return new Promise((resolve, reject) => {
            try {
                const blob = new Blob([content], { type: 'text/plain; charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Скачивание изображения из HTML элемента
     */
    async function downloadImageFromElement(imgElement, filename) {
        return new Promise((resolve, reject) => {
            try {
                log('debug', `Начинаю скачивание изображения: ${filename}`);
                log('debug', `Источник изображения: ${imgElement.src ? imgElement.src.substring(0, 100) + '...' : 'нет src'}`);
                
                // Проверяем, что элемент изображения валиден
                if (!imgElement || !imgElement.src) {
                    reject(new Error('Неверный элемент изображения или отсутствует src'));
                    return;
                }
                
                // Создаем canvas для конвертации изображения
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const img = new Image();
                
                img.onload = function() {
                    try {
                        log('debug', `Изображение загружено, размер: ${img.width}x${img.height}`);
                        canvas.width = img.width;
                        canvas.height = img.height;
                        ctx.drawImage(img, 0, 0);
                        
                        canvas.toBlob(function(blob) {
                            if (blob) {
                                log('debug', `Blob создан, размер: ${blob.size} байт`);
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = filename;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                                log('debug', `Изображение ${filename} успешно скачано`);
                                resolve();
                            } else {
                                log('error', 'Не удалось создать blob из изображения');
                                reject(new Error('Не удалось создать blob из изображения'));
                            }
                        }, 'image/png');
                    } catch (canvasError) {
                        log('error', 'Ошибка при работе с canvas:', canvasError);
                        reject(canvasError);
                    }
                };
                
                img.onerror = function(event) {
                    log('error', 'Ошибка загрузки изображения:', event);
                    reject(new Error('Не удалось загрузить изображение'));
                };
                
                // Устанавливаем crossOrigin для работы с base64 изображениями
                img.crossOrigin = 'anonymous';
                img.src = imgElement.src;
                
            } catch (error) {
                log('error', 'Общая ошибка при скачивании изображения:', error);
                reject(error);
            }
        });
    }

    /**
     * Показ справки
     */
    function showHelp(editorId) {
        // Создаем модальное окно с помощью Bootstrap
        const modalHtml = `
            <div class="modal fade" id="pyodide-help-modal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Помощь по работе с блоком Python</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p>Содержимое разрабатывается</p>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Закрыть</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Удаляем предыдущее модальное окно если есть
        const existingModal = document.getElementById('pyodide-help-modal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Добавляем новое модальное окно
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Показываем модальное окно
        const modal = new bootstrap.Modal(document.getElementById('pyodide-help-modal'));
        modal.show();
    }

    /**
     * Рендеринг всех Python редакторов на странице
     */
    function renderEditors() {
        if (!pluginState.pyodideReady) {
            // Если Pyodide не готов, запускаем инициализацию только один раз
            if (!pluginState.loadingPromise) {
                initializePyodide();
            }
            return;
        }

        // Ищем ТОЛЬКО блоки кода Python с правильными классами
        const codeBlocks = document.querySelectorAll('pre code.language-python, pre code[class*="language-python"]');
        log('debug', `Найдено ${codeBlocks.length} блоков Python кода для преобразования в редакторы`);
        
        codeBlocks.forEach(codeBlock => {
            const preElement = codeBlock.parentElement;
            if (!preElement || preElement.tagName !== 'PRE') return;
            
            // Проверяем, не был ли уже создан редактор для этого блока
            if (preElement.hasAttribute('data-converted') || preElement.classList.contains('pyodide-converted')) {
                log('debug', `Блок кода уже преобразован, пропускаем`);
                return;
            }
            
            // Извлекаем содержимое Python кода
            const pythonContent = codeBlock.textContent || '';
            
            // Проверяем, что содержимое не пустое
            if (!pythonContent.trim()) {
                return;
            }
            
            // Дополнительная проверка: это должен быть именно Python код
            const className = codeBlock.className || '';
            if (!className.includes('python')) {
                log('debug', `Пропуск не-Python блока кода с классом: ${className}`);
                return;
            }
            
            // Проверяем, что это блок кода из markdown (имеет правильную структуру)
            if (!className.includes('language-')) {
                log('debug', `Пропуск блока кода без префикса language-: ${className}`);
                return;
            }
            
            // Создаем стабильный ID на основе содержимого и позиции (как в createPythonEditor)
            let hash = 0;
            for (let i = 0; i < pythonContent.length; i++) {
                const char = pythonContent.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Преобразуем в 32-битное число
            }
            const contentHash = Math.abs(hash).toString(36).substring(0, 8);
            const editorId = `pyodide-editor-${contentHash}-render`;
            
            // Проверяем, не существует ли уже редактор с таким ID
            const existingEditor = document.getElementById(editorId);
            if (existingEditor) {
                log('debug', `Редактор ${editorId} уже существует, пропускаем создание`);
                return;
            }
            
            log('debug', `Преобразование блока Python кода в редактор: ${editorId}`);
            
            // Помечаем как конвертированный
            preElement.setAttribute('data-converted', 'true');
            preElement.classList.add('pyodide-converted');
            
            // Создаем полный интерфейс редактора
            const editorHtml = createPythonEditor(editorId, pythonContent);
            preElement.outerHTML = editorHtml;
            
            // Настраиваем новый редактор
            setTimeout(() => {
                setupEditor(editorId);
                // Обрабатываем магические команды если это первый рендер
                // Если библиотеки готовы - выполняем сразу, иначе - будет выполнено после загрузки
                log('debug', `Настройка редактора ${editorId}, библиотеки готовы: ${pluginState.librariesReady}`);
                if (pluginState.librariesReady) {
                    log('debug', `Вызов processMagicCommandsForEditor для ${editorId}`);
                    processMagicCommandsForEditor(editorId);
                } else {
                    // Если библиотеки еще не готовы, команды будут обработаны в processMagicCommandsOnFirstRender
                    log('debug', `Библиотеки еще не готовы для ${editorId}, команды будут обработаны позже`);
                }
            }, 100);
        });

        // Также обрабатываем старые placeholder'ы для совместимости
        const placeholders = document.querySelectorAll('.pyodide-editor-placeholder');
        log('debug', `Найдено ${placeholders.length} заглушек для рендеринга`);
        
        placeholders.forEach(placeholder => {
            const editorId = placeholder.id;
            const pythonContent = placeholder.getAttribute('data-python-content') || '';
            
            // Проверяем, не был ли уже создан полный редактор с таким ID
            const existingEditor = document.querySelector(`.pyodide-editor-container[id="${editorId}"]`);
            if (existingEditor && !existingEditor.querySelector('.pyodide-editor-placeholder')) {
                log('debug', `Редактор ${editorId} уже существует как полный редактор, пропускаем`);
                return;
            }
            
            // Создаем полный интерфейс редактора
            const editorHtml = createPythonEditor(editorId, pythonContent);
            placeholder.outerHTML = editorHtml;
            
            // Настраиваем новый редактор
            setTimeout(() => {
                setupEditor(editorId);
                // Обрабатываем магические команды если это первый рендер
                // Если библиотеки готовы - выполняем сразу, иначе - будет выполнено после загрузки
                if (pluginState.librariesReady) {
                    processMagicCommandsForEditor(editorId);
                } else {
                    // Если библиотеки еще не готовы, команды будут обработаны в processMagicCommandsOnFirstRender
                    log('debug', `Библиотеки еще не готовы для ${editorId}, команды будут обработаны позже`);
                }
            }, 100);
        });

        log('debug', 'Python редакторы отрендерены');
    }

    /**
     * Проверка наличия Python блоков в тексте
     */
    function hasContent(content) {
        return content && content.includes('```python');
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
     * Экранирование HTML для textarea (только критичные символы)
     */
    function escapeHtmlForTextarea(text) {
        if (typeof text !== 'string') {
            return '';
        }
        // Экранируем только критичные символы для HTML, но сохраняем переносы строк
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /**
     * Показ уведомлений
     */
    function showNotification(type, message) {
        if (window.eventBus) {
            window.eventBus.emit(`notification.show.${type}`, {
                message: message,
                moduleId: 'pyodide-plugin',
                duration: 5000
            });
        } else {
            // Fallback для случая отсутствия EventBus
            console.log(`[pyodide-plugin] ${type.toUpperCase()}: ${message}`);
        }
    }

    /**
     * Получение статистики плагина
     */
    function getStats() {
        const editors = document.querySelectorAll('.pyodide-editor-container').length;
        const placeholders = document.querySelectorAll('.pyodide-editor-placeholder').length;
        
        return {
            initialized: pluginState.initialized,
            pyodideReady: pluginState.pyodideReady,
            editorsCount: editors,
            placeholdersCount: placeholders,
            packagesLoaded: { ...pluginState.packagesLoaded }
        };
    }

    // Инициализация при загрузке DOM
    document.addEventListener('DOMContentLoaded', function() {
        log('debug', 'DOM загружен, инициализация плагина Pyodide');
        
        // Регистрация плагина в ядре markdown-it
        if (window.markdownCore) {
            window.markdownCore.registerPlugin('pyodide', pyodidePlugin);
            log('debug', 'Плагин Pyodide зарегистрирован в ядре markdown');
        } else {
            log('warn', 'Ядро Markdown недоступно, плагин будет зарегистрирован позже');
            // Ждем готовности ядра
            if (window.eventBus) {
                window.eventBus.on('module.markdown-core.ready', () => {
                    if (window.markdownCore) {
                        window.markdownCore.registerPlugin('pyodide', pyodidePlugin);
                        log('debug', 'Плагин Pyodide зарегистрирован в ядре markdown (отложенно)');
                    }
                });
            }
        }

        // Расширенный наблюдатель за изменениями DOM для переинициализации редакторов
        const observer = new MutationObserver(function(mutations) {
            let shouldReinitialize = false;
            
            mutations.forEach(function(mutation) {
                // Отслеживаем изменения атрибута data-mode
                if (mutation.type === 'attributes' && mutation.attributeName === 'data-mode') {
                    const target = mutation.target;
                    const newMode = target.getAttribute('data-mode');
                    
                    // ВАЖНО: Срабатываем только при переходе В режим "rendered", а не ИЗ него
                    // Это предотвращает срабатывание во время стрима (когда режим "markdown")
                    if (newMode === 'rendered') {
                        log('debug', `Переинициализация редакторов после смены режима на "rendered"`);
                        shouldReinitialize = true;
                    } else {
                        log('debug', `Пропуск переинициализации для режима "${newMode}" (ожидаем "rendered")`);
                    }
                }
                
                // Отслеживаем добавление/удаление узлов (например, при переходе в режим редактирования)
                if (mutation.type === 'childList') {
                    // Проверяем, есть ли среди добавленных узлов редакторы Python
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const hasEditors = node.querySelector && (
                                node.querySelector('.pyodide-editor-container') ||
                                node.classList.contains('pyodide-editor-container')
                            );
                            if (hasEditors) {
                                // Дополнительная проверка: убеждаемся, что родительский контейнер в режиме "rendered"
                                const messageContainer = node.closest('[data-mode]');
                                const containerMode = messageContainer ? messageContainer.getAttribute('data-mode') : null;
                                
                                if (containerMode === 'rendered') {
                                    log('debug', 'Обнаружены новые редакторы Python в режиме "rendered"');
                                    shouldReinitialize = true;
                                } else {
                                    log('debug', `Пропуск новых редакторов Python в режиме "${containerMode}" (ожидаем "rendered")`);
                                }
                            }
                        }
                    });
                    
                    // Проверяем, были ли удалены редакторы
                    mutation.removedNodes.forEach(function(node) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const hasEditors = node.querySelector && (
                                node.querySelector('.pyodide-editor-container') ||
                                node.classList.contains('pyodide-editor-container')
                            );
                            if (hasEditors) {
                                log('debug', 'Редакторы Python удалены из DOM');
                                shouldReinitialize = true;
                            }
                        }
                    });
                }
            });
            
            if (shouldReinitialize) {
                reinitializeEditorsOnModeChange();
            }
        });

        // Начинаем наблюдение за изменениями DOM
        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['data-mode', 'class'],
            childList: true,
            subtree: true
        });

        // Также слушаем события переключения режимов через EventBus если доступен
        if (window.eventBus) {
            window.eventBus.on('chat.mode.changed', () => {
                log('debug', 'Получено событие смены режима чата');
                reinitializeEditorsOnModeChange();
            });
            
            window.eventBus.on('message.mode.changed', () => {
                log('debug', 'Получено событие смены режима сообщения');
                reinitializeEditorsOnModeChange();
            });
            
            window.eventBus.on('message.edit.started', () => {
                log('debug', 'Получено событие начала редактирования сообщения');
                reinitializeEditorsOnModeChange();
            });
            
            window.eventBus.on('message.edit.finished', () => {
                log('debug', 'Получено событие завершения редактирования сообщения');
                reinitializeEditorsOnModeChange();
            });
        }

        // Дополнительно отслеживаем клики по кнопкам редактирования
        document.addEventListener('click', function(event) {
            const target = event.target;
            
            // Проверяем, была ли нажата кнопка редактирования сообщения
            if (target.matches('.edit-btn, .edit-btn *, [class*="edit"], [title*="редактир"], [title*="Edit"]')) {
                log('debug', 'Обнаружен клик по кнопке редактирования');
                setTimeout(() => {
                    reinitializeEditorsOnModeChange();
                }, 200);
            }
            
            // Проверяем кнопки сохранения/отмены редактирования
            if (target.matches('.save-btn, .cancel-btn, .save-btn *, .cancel-btn *, [class*="save"], [class*="cancel"]')) {
                log('debug', 'Обнаружен клик по кнопке сохранения/отмены');
                setTimeout(() => {
                    reinitializeEditorsOnModeChange();
                }, 200);
            }
        });

        pluginState.initialized = true;
        log('debug', 'Плагин Pyodide инициализирован');
    });

    // Публичный API
    window.pyodidePlugin = {
        // Основные функции
        plugin: pyodidePlugin,
        initialize: initializePyodide,
        renderEditors: renderEditors,
        
        // Функции редактора
        runCode: runCode,
        clearOutput: clearOutput,
        toggleCollapse: toggleCollapse,
        toggleResultsCollapse: toggleResultsCollapse,
        uploadFile: uploadFile,
        pasteFromClipboard: pasteFromClipboard,
        copyToClipboard: copyToClipboard,
        downloadCode: downloadCode,
        copyOutputToClipboard: copyOutputToClipboard,
        downloadOutput: downloadOutput,
        showHelp: showHelp,
        showFullOutput: showFullOutput,
        
        // Функции matplotlib тулбара
        downloadPlot: downloadPlot,
        copyPlotToClipboard: copyPlotToClipboard,
        
        // Утилиты
        hasContent: hasContent,
        setupEditor: setupEditor,
        reinitializeEditorsOnModeChange: reinitializeEditorsOnModeChange,
        
        // Информация о состоянии
        getStats: getStats,
        
        // Проверка готовности
        get isReady() {
            return pluginState.pyodideReady;
        },
        
        get isInitialized() {
            return pluginState.initialized;
        }
    };

    /**
     * Скачивание графика matplotlib в указанном формате
     */
    async function downloadPlot(plotId, format) {
        try {
            const imgElement = document.getElementById(plotId);
            if (!imgElement) {
                showNotification('error', 'График не найден');
                return;
            }

            // Получаем данные изображения
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = async function() {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                
                if (format === 'png') {
                    // PNG - используем canvas
                    canvas.toBlob(function(blob) {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `matplotlib_plot.${format}`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        showNotification('success', `График сохранен как ${format.toUpperCase()}`);
                    }, 'image/png');
                } else {
                    // Для SVG и PDF используем Pyodide для повторного рендеринга
                    if (!pluginState.pyodideReady) {
                        showNotification('error', 'Pyodide не готов для экспорта');
                        return;
                    }
                    
                    try {
                        const result = pluginState.pyodideInstance.runPython(`
import matplotlib.pyplot as plt
import io
import base64

# Получаем последнюю фигуру или создаем новую
if plt.get_fignums():
    fig = plt.gcf()
else:
    # Если нет активных фигур, создаем простую заглушку
    fig, ax = plt.subplots()
    ax.text(0.5, 0.5, 'График недоступен для экспорта',
            ha='center', va='center', transform=ax.transAxes)

buf = io.BytesIO()
fig.savefig(buf, format='${format}', bbox_inches='tight', dpi=300)
buf.seek(0)
file_data = base64.b64encode(buf.read()).decode('utf-8')
buf.close()
file_data
`);
                        
                        // Создаем blob и скачиваем
                        const binaryString = atob(result);
                        const bytes = new Uint8Array(binaryString.length);
                        for (let i = 0; i < binaryString.length; i++) {
                            bytes[i] = binaryString.charCodeAt(i);
                        }
                        
                        const mimeTypes = {
                            'svg': 'image/svg+xml',
                            'pdf': 'application/pdf'
                        };
                        
                        const blob = new Blob([bytes], { type: mimeTypes[format] });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `matplotlib_plot.${format}`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        showNotification('success', `График сохранен как ${format.toUpperCase()}`);
                        
                    } catch (error) {
                        log('error', 'Ошибка экспорта графика:', error);
                        showNotification('error', `Ошибка экспорта в ${format.toUpperCase()}: ${error.message}`);
                    }
                }
            };
            
            img.src = imgElement.src;
            
        } catch (error) {
            log('error', 'Ошибка скачивания графика:', error);
            showNotification('error', 'Ошибка при скачивании графика');
        }
    }

    /**
     * Копирование графика в буфер обмена
     */
    async function copyPlotToClipboard(plotId) {
        try {
            const imgElement = document.getElementById(plotId);
            if (!imgElement) {
                showNotification('error', 'График не найден');
                return;
            }

            // Создаем canvas и копируем изображение
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = async function() {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                
                canvas.toBlob(async function(blob) {
                    try {
                        await navigator.clipboard.write([
                            new ClipboardItem({ 'image/png': blob })
                        ]);
                        showNotification('success', 'График скопирован в буфер обмена');
                    } catch (error) {
                        log('error', 'Ошибка копирования в буфер обмена:', error);
                        showNotification('error', 'Не удалось скопировать график в буфер обмена');
                    }
                }, 'image/png');
            };
            
            img.src = imgElement.src;
            
        } catch (error) {
            log('error', 'Ошибка копирования графика в буфер обмена:', error);
            showNotification('error', 'Ошибка при копировании графика');
        }
    }

    log('debug', 'Модуль плагина Pyodide загружен');

})();