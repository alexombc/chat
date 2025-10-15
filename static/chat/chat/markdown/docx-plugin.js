/**
 * Плагин docx-plugin для markdown-it
 * Обеспечивает интерактивный интерфейс Генератора DOCX документов в браузере по заданному шаблону
 * 
 * ПРОМПТ для агента ЛЛМ чтобы он мог понимать как использовать этот плагин как инструмент взаимодействия с пользователем:
 */
// У тебя есть инструмент docx-generator для создания docx документа в браузере из шаблона docx и данных из файла json через библиотеку Docxtemplater.
// Оберни код с информацией о шаблоне docx и данных json в блок ```docx и ```. 
// И внутрь блока кода добавь ссылку на шаблон docx в следующем формате: 
// #%load="/static/template/docx/test-new.docx" 
// и далее код прямого создания словаря json
// json_data_for_template = {
//     "name": "Иван Петров",
//     "company": "ООО Рога и Копыта",
//     "date": "02.09.2025"
// }
// Пользователь видит эти данные в редакторе кода с возможностью их скорректировать и свернуть/развернуть 
// и отдельно в окне ниже пользователь видит результаты выполнения блока - отображение документа docx.

// ## У тебя есть возможность использовать в начале **МАГИЧЕСКИЕ КОМАНДЫ**.
// Магические команды срабатывают только при первом отображении блока кода, 
// После этого пользователь может свободно редактировать и перезапускать код.
// 1. Магическая команда `#%collapse` - автосворачивание редактора кода, чтобы код не отвлекал внимание пользователя от результатов вывода кода
// 2. Магическая команда `#%autorun` - автозапуск кода после загрузки библиотек docxtemplater и mammoth
// - Если по контексту диалога с пользователем данные для шаблона готовы и пользователю важно увидеть готовый документ docx, то применяй `#%autorun` + `#%collapse`
// - Если пользователю важно сначала посмотреть данные в json, возможно их подкорректировать, то магические команды `#%autorun` и `#%collapse` не используй

// 3. Магическая команда `#%load="url"` - загружает готовый шаблон docx из указанного URL
// Доступные шаблоны
// - Шаблон для создания типового договора или просто тестовый шаблон
//     - Команда:** `#%load="/static/template/docx/test-new.docx"`
//     - Когда использовать: если поьзователь попросит тестовый документ ворд или тестовый договор
//     - Структура json для шаблона следующая, с пояснением значения каждого тега:
//         {"name": "Иван Петров",
//          "company": "ООО Рога и Копыта",
//          "date": "02.09.2025"
//         }
//       где, "name" - ФИО директора
//            "company" - Название компании подрядчика
//            "date" - Дата подписания договора

(function() {
    'use strict';

    // Уровень логирования модуля
    // Доступные уровни: 'debug', 'warn', 'error'
    // debug - все сообщения, warn - предупреждения и ошибки, error - только ошибки
    const LOG_LEVEL = 'warn';

    // Функция логирования с проверкой уровня
    function log(level, message, ...args) {
        const levels = { debug: 0, warn: 1, error: 2 };
        if (levels[level] >= levels[LOG_LEVEL]) {
            console[level](`[docx-plugin] ${message}`, ...args);
        }
    }

    // Состояние плагина
    const pluginState = {
        initialized: false,
        docxReady: false,
        docxInstance: null,
        editorCounter: 0,
        loadingPromise: null,
        librariesLoading: false,
        librariesReady: false,
        theme: 'light', // Текущая тема (light/dark)
        packagesLoaded: {
            pizzip: false,
            docxtemplater: false,
            mammoth: false,
            filesaver: false
        }
    };

    // Состояние магических команд для каждого редактора
    const magicCommandsState = new Map();
    
    // Глобальное отслеживание уже обработанных магических команд (по ID редактора)
    const processedMagicCommands = new Set();
    
    // Отслеживание выполненных команд copy_console и send_console для каждого редактора
    const consoleCommandsExecuted = new Map();

    /**
     * Парсинг магических команд из DOCX кода
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
     * Извлечение JSON данных из кода редактора
     */
    function extractJsonData(code) {
        try {
            // Ищем начало паттерна json_data_for_template = {
            const startPattern = /json_data_for_template\s*=\s*\{/;
            const startMatch = code.match(startPattern);
            
            if (!startMatch) {
                log('debug', 'JSON данные не найдены в коде');
                return null;
            }
            
            // Находим позицию начала JSON объекта
            const startIndex = startMatch.index + startMatch[0].lastIndexOf('{');
            
            // Используем счетчик скобок для правильного извлечения вложенного JSON
            let braceCount = 0;
            let endIndex = -1;
            
            for (let i = startIndex; i < code.length; i++) {
                const char = code[i];
                if (char === '{') {
                    braceCount++;
                } else if (char === '}') {
                    braceCount--;
                    if (braceCount === 0) {
                        endIndex = i;
                        break;
                    }
                }
            }
            
            if (endIndex === -1) {
                throw new Error('Не найдена закрывающая скобка для JSON объекта');
            }
            
            const jsonString = code.substring(startIndex, endIndex + 1);
            log('debug', 'Найдены JSON данные:', jsonString);
            
            // Валидируем JSON синтаксис
            try {
                const jsonData = JSON.parse(jsonString);
                log('debug', 'JSON данные успешно распарсены:', jsonData);
                return jsonData;
            } catch (parseError) {
                log('error', 'Ошибка парсинга JSON:', parseError);
                throw new Error(`Синтаксическая ошибка в JSON данных: ${parseError.message}`);
            }
            
        } catch (error) {
            log('error', 'Ошибка извлечения JSON данных:', error);
            throw error;
        }
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
     * Загружает шаблон DOCX кода с указанного URL
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
                    log('warn', 'Неверный синтаксис команды #%load:', trimmedLine);
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
                    log('warn', 'Неверный URL в команде #%load:', url, error);
                    continue;
                }
                
                try {
                    // Загружаем DOCX шаблон как бинарные данные
                    log('debug', 'Загрузка DOCX шаблона с URL:', fullUrl);
                    const response = await fetch(fullUrl);
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    
                    // Сохраняем бинарные данные шаблона для последующего использования
                    const templateBuffer = await response.arrayBuffer();
                    
                    // Сохраняем шаблон в глобальном состоянии для использования при генерации
                    if (!window.docxTemplates) {
                        window.docxTemplates = new Map();
                    }
                    window.docxTemplates.set(fullUrl, templateBuffer);
                    
                    log('debug', `DOCX шаблон успешно загружен и сохранен: ${fullUrl} (${Math.round(templateBuffer.byteLength / 1024)} KB)`);
                    
                } catch (error) {
                    const errorComment = `# Команда не выполнена так как произошла ошибка загрузки: ${error.message}`;
                    lines[i] = line + '\n' + errorComment;
                    log('error', 'Ошибка загрузки шаблона:', error);
                }
            }
        }
        
        if (hasLoadCommand) {
            modifiedCode = lines.join('\n');
        }
        
        return modifiedCode;
    }

    /**
     * Плагин для markdown-it для обработки блоков ```docx
     */
    function docxPlugin(md) {
        const defaultRenderer = md.renderer.rules.fence || function(tokens, idx, options, env, renderer) {
            return renderer.renderToken(tokens, idx, options);
        };

        md.renderer.rules.fence = function(tokens, idx, options, env, renderer) {
            const token = tokens[idx];
            const info = token.info ? token.info.trim() : '';
            const langName = info ? info.split(/\s+/g)[0] : '';

            if (langName === 'docx') {
                // Проверяем, идет ли стриминг
                const isStreaming = env && env.isStreaming;
                
                if (isStreaming) {
                    // Во время стриминга НЕ обрабатываем блоки docx вообще
                    // Возвращаем обработку обратно к стандартному рендереру
                    log('debug', `Пропуск обработки блока DOCX во время стриминга`);
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
                const editorId = `docx-editor-${contentHash}-${idx}`;
                
                // Проверяем, существует ли уже редактор с таким ID
                const existingEditor = document.getElementById(editorId);
                if (existingEditor) {
                    log('debug', `Переиспользование существующего ID редактора: ${editorId}`);
                    // Возвращаем существующий HTML без изменений
                    return existingEditor.outerHTML;
                }
                
                log('debug', `Создание DOCX редактора с ID: ${editorId}`);
                
                // После завершения стриминга создаем полный интерфейс
                return createDocxEditor(editorId, content);
            }

            return defaultRenderer(tokens, idx, options, env, renderer);
        };
    }

    /**
     * Создание HTML интерфейса DOCX редактора
     */
    function createDocxEditor(editorId, initialCode) {
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
            <div class="docx-editor-container mb-4" id="${editorId}" data-docx-content="${escapeHtml(initialCode)}" data-first-render="true">
                <!-- Лоадер инициализации DOCX -->
                <div class="docx-loader" style="display: ${pluginState.docxReady ? 'none' : 'block'};">
                    <div class="card">
                        <div class="card-body text-center py-4">
                            <div class="progress mb-3">
                                <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" style="width: 0%" id="${editorId}-progress"></div>
                            </div>
                            <div class="spinner-border text-primary mb-2" role="status">
                                <span class="visually-hidden">Загрузка...</span>
                            </div>
                            <p class="mb-0 text-muted" id="${editorId}-status">Инициализация DOCX генератора...</p>
                        </div>
                    </div>
                </div>

                <!-- Основной интерфейс редактора -->
                <div class="docx-editor" style="display: ${pluginState.docxReady ? 'block' : 'none'};">
                    <div class="card">
                        <!-- Шапка редактора -->
                        <div class="card-header bg-secondary text-white" style="padding: 0.35rem 1rem;">
                            <div class="d-flex justify-content-between align-items-center">
                                <div class="d-flex align-items-center">
                                    <button class="btn btn-sm text-white p-0 me-2" id="${editorId}-collapse-btn" onclick="window.docxPlugin.toggleCollapse('${editorId}')" title="${collapseTitle}" style="border: none; background: none; font-size: 16px; margin-left: 4px;">
                                        <i class="bi ${collapseIcon}" id="${editorId}-collapse-icon"></i>
                                    </button>
                                    <div class="vr" style="margin: 0 16px; height: 29px;"></div>
                                    <h6 class="mb-0">
                                        <i class="bi bi-file-earmark-text"></i> Редактор DOCX генератора
                                    </h6>
                                </div>
                                <div class="btn-group btn-group-sm" role="group">
                                    <button class="btn btn-success btn-sm rounded-pill" id="${editorId}-run-btn" style="border: none;" onclick="window.docxPlugin.runCode('${editorId}')" title="${pluginState.librariesLoading ? 'Идет загрузка библиотек...' : 'Генерировать DOCX'}" ${pluginState.librariesLoading ? 'disabled' : ''}>
                                        <span id="${editorId}-run-btn-content" style="display: ${pluginState.librariesLoading ? 'none' : 'inline'};">
                                            <i class="bi bi-file-earmark-arrow-down"></i> Генерировать
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
                                    <button class="btn btn-outline-light btn-sm" style="border: none;" onclick="window.docxPlugin.uploadFile('${editorId}')" title="Загрузить файл в редактор с ПК">
                                        <i class="bi bi-upload"></i>
                                    </button>
                                    <button class="btn btn-outline-light btn-sm" style="border: none;" onclick="window.docxPlugin.pasteFromClipboard('${editorId}')" title="Заменить содержимое в редакторе из буфера обмена">
                                        <i class="bi bi-clipboard-plus"></i>
                                    </button>
                                    <button class="btn btn-outline-light btn-sm" style="border: none;" onclick="window.docxPlugin.copyToClipboard('${editorId}')" title="Скопировать содержимое из редактора в буфер обмена">
                                        <i class="bi bi-clipboard"></i>
                                    </button>
                                    <button class="btn btn-outline-light btn-sm" style="border: none;" onclick="window.docxPlugin.downloadCode('${editorId}')" title="Скачать содержимое из редактора в файл на ПК">
                                        <i class="bi bi-download"></i>
                                    </button>
                                    <button class="btn btn-outline-light btn-sm" style="border: none;" onclick="window.docxPlugin.showHelp('${editorId}')" title="Помощь по работе с блоком DOCX">
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
                                    <textarea class="editor-textarea" id="${editorId}-textarea" style="width: 100%; height: auto; min-height: 150px; max-height: 800px; resize: none; border: none; outline: none; font-family: 'Courier New', monospace; font-size: 14px; line-height: 1.5; padding: 15px; background: transparent; color: transparent; caret-color: var(--bs-body-color); position: absolute; top: 0; left: 0; z-index: 2; tab-size: 4; white-space: pre-wrap; word-break: break-all; overflow-wrap: break-word;" placeholder="# Введите код для генерации DOCX здесь...">${escapeHtmlForTextarea(initialCode)}</textarea>
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
                                    <span class="badge bg-primary me-1" style="background-color: rgba(var(--bs-primary-rgb), 0.3) !important;">DOCX Generator</span>
                                    <span class="badge bg-info me-1" style="background-color: rgba(var(--bs-info-rgb), 0.3) !important;">UTF-8</span>
                                    <span class="badge bg-success" style="background-color: rgba(var(--bs-success-rgb), 0.3) !important;">Готов</span>
                                </div>
                            </div>
                        </div>

                        <!-- Шапка результатов -->
                        <div class="card-header bg-secondary text-white" id="${editorId}-results-header" style="display: none;">
                            <div class="d-flex justify-content-between align-items-center">
                                <div class="d-flex align-items-center">
                                    <button class="btn btn-sm text-white p-0 me-2" id="${editorId}-results-collapse-btn" onclick="window.docxPlugin.toggleResultsCollapse('${editorId}')" title="Свернуть/развернуть результаты" style="border: none; background: none; font-size: 16px; margin-left: 4px;">
                                        <i class="bi bi-chevron-down" id="${editorId}-results-collapse-icon"></i>
                                    </button>
                                    <div class="vr" style="margin: 0 16px; height: 29px;"></div>
                                    <h6 class="mb-0">
                                        <i class="bi bi-file-earmark-check"></i> Результат генерации
                                    </h6>
                                </div>
                                <div class="btn-group btn-group-sm" role="group">
                                    <button class="btn btn-outline-light btn-sm rounded-pill" style="border: none;" onclick="window.docxPlugin.downloadOutput('${editorId}')" title="Скачать документ в формате DOCX">
                                        <i class="bi bi-download"></i> DOCX
                                    </button>
                                    <button class="btn btn-outline-light btn-sm rounded-pill" style="border: none;" onclick="window.docxPlugin.downloadHtmlOutput('${editorId}')" title="Скачать документ в формате HTML">
                                        <i class="bi bi-download"></i> HTML
                                    </button>
                                    <button class="btn btn-outline-light btn-sm rounded-pill" style="border: none;" onclick="window.docxPlugin.downloadMarkdownOutput('${editorId}')" title="Скачать документ в формате Markdown">
                                        <i class="bi bi-download"></i> Markdown
                                    </button>
                                    <div class="vr" style="margin: 0 16px;"></div>
                                    <button class="btn btn-dark btn-sm rounded-pill" style="border: none;" onclick="window.docxPlugin.clearOutput('${editorId}')" title="Очистить">
                                        <i class="bi bi-trash3"></i> Очистить
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- Область вывода -->
                        <div class="card-body" id="${editorId}-output" style="display: none;">
                            <div class="bg-body-secondary text-body rounded border" id="${editorId}-output-content" style="font-family: 'Courier New', monospace; font-size: 14px; min-height: 100px; max-height: 800px; overflow-y: auto; /* white-space: pre-wrap; */"></div>
                        </div>
                    </div>
                </div>

                <!-- Скрытый input для загрузки файлов -->
                <input type="file" id="${editorId}-file-input" accept=".docx-plugin" style="display: none;">
            </div>\n`;
    }

    /**
     * Инициализация DOCX генератора
     */
    async function initializeDocx() {
        if (pluginState.docxReady || pluginState.loadingPromise) {
            return pluginState.loadingPromise || Promise.resolve();
        }

        log('debug', 'Запуск инициализации DOCX генератора');

        pluginState.loadingPromise = (async () => {
            try {
                // Обновляем статус загрузки
                updateLoadingStatus('Загрузка библиотек DOCX...', 10);

                // Инициализируем DOCX генератор
                updateLoadingStatus('Инициализация DOCX генератора...', 30);
                
                // Здесь будет инициализация библиотек docxtemplater и mammoth
                // TODO: Добавить загрузку библиотек docxtemplater и mammoth
                
                updateLoadingStatus('DOCX генератор готов!', 50);
                log('debug', 'DOCX генератор успешно инициализирован');

                // Загружаем библиотеки в фоне
                loadLibrariesInBackground();

                updateLoadingStatus('Настройка окружения...', 90);

                updateLoadingStatus('Готово!', 100);

                pluginState.docxReady = true;
                log('debug', 'DOCX генератор успешно инициализирован');

                // Уведомляем о готовности плагина
                if (window.eventBus) {
                    window.eventBus.emit('module.docx-plugin.ready', {
                        timestamp: Date.now(),
                        moduleId: 'docx-plugin'
                    });
                }

            } catch (error) {
                log('error', 'Не удалось инициализировать DOCX генератор:', error);
                updateLoadingStatus('Ошибка загрузки DOCX генератора', 0);
                
                if (window.eventBus) {
                    window.eventBus.emit('module.docx-plugin.error', {
                        timestamp: Date.now(),
                        moduleId: 'docx-plugin',
                        error: error.message
                    });
                }
                throw error;
            }
        })();

        return pluginState.loadingPromise;
    }

    /**
     * Динамическая загрузка библиотек DOCX
     */
    async function loadDocxLibraries() {
        const libraries = [
            '/static/libs/pizzip/pizzip.min.js',
            '/static/libs/docxtemplater/docxtemplater.min.js',
            '/static/libs/mammoth/mammoth.browser.min.js',
            '/static/libs/file-saver/FileSaver.min.js'
        ];

        log('debug', 'Начинаем загрузку библиотек DOCX:', libraries);

        for (const libPath of libraries) {
            try {
                await loadScript(libPath);
                log('debug', `Библиотека загружена: ${libPath}`);
                
                // Отмечаем загруженные библиотеки
                if (libPath.includes('pizzip')) {
                    pluginState.packagesLoaded.pizzip = true;
                } else if (libPath.includes('docxtemplater')) {
                    pluginState.packagesLoaded.docxtemplater = true;
                } else if (libPath.includes('mammoth')) {
                    pluginState.packagesLoaded.mammoth = true;
                } else if (libPath.includes('FileSaver')) {
                    pluginState.packagesLoaded.filesaver = true;
                }
            } catch (error) {
                log('error', `Ошибка загрузки библиотеки ${libPath}:`, error);
                throw new Error(`Не удалось загрузить библиотеку: ${libPath}`);
            }
        }

        // Проверяем, что все библиотеки загружены
        if (typeof PizZip === 'undefined' && typeof window.PizZip === 'undefined') {
            throw new Error('Библиотека PizZip не загружена');
        }
        if (typeof Docxtemplater === 'undefined' && typeof window.Docxtemplater === 'undefined' && typeof window.docxtemplater === 'undefined') {
            throw new Error('Библиотека Docxtemplater не загружена');
        }
        if (typeof mammoth === 'undefined' && typeof window.mammoth === 'undefined') {
            throw new Error('Библиотека mammoth не загружена');
        }
        if (typeof saveAs === 'undefined' && typeof window.saveAs === 'undefined') {
            throw new Error('Библиотека FileSaver не загружена');
        }

        // Устанавливаем глобальные ссылки для удобства
        if (typeof PizZip === 'undefined' && typeof window.PizZip !== 'undefined') {
            window.PizZip = window.PizZip;
        }
        if (typeof Docxtemplater === 'undefined') {
            if (typeof window.Docxtemplater !== 'undefined') {
                window.Docxtemplater = window.Docxtemplater;
            } else if (typeof window.docxtemplater !== 'undefined') {
                window.Docxtemplater = window.docxtemplater;
            }
        }
        if (typeof mammoth === 'undefined' && typeof window.mammoth !== 'undefined') {
            window.mammoth = window.mammoth;
        }
        if (typeof saveAs === 'undefined' && typeof window.saveAs !== 'undefined') {
            window.saveAs = window.saveAs;
        }

        log('debug', 'Все библиотеки DOCX успешно загружены');
    }

    /**
     * Загрузка одного скрипта
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
            script.onerror = () => reject(new Error(`Не удалось загрузить скрипт: ${src}`));
            document.head.appendChild(script);
        });
    }

    /**
     * Загрузка DOCX библиотек в фоновом режиме
     */
    async function loadLibrariesInBackground() {
        try {
            log('debug', 'Загрузка DOCX библиотек в фоновом режиме...');
            
            // Устанавливаем состояние загрузки библиотек
            pluginState.librariesLoading = true;
            pluginState.librariesReady = false;
            
            // Обновляем состояние кнопок - показываем лоадер
            setRunButtonsLoading();
            
            // Загружаем библиотеки DOCX
            await loadDocxLibraries();
            
            log('debug', 'Загрузка DOCX библиотек завершена');
            
            // Устанавливаем состояние готовности библиотек
            pluginState.librariesLoading = false;
            pluginState.librariesReady = true;
            
            // Обновляем состояние кнопок - скрываем лоадер
            setRunButtonsReady();
            
            // Скрываем лоадеры после завершения загрузки библиотек
            setTimeout(() => {
                document.querySelectorAll('.docx-loader').forEach(loader => {
                    loader.style.display = 'none';
                });
                document.querySelectorAll('.docx-editor').forEach(editor => {
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
        document.querySelectorAll('.docx-editor-container').forEach(container => {
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
            const containers = document.querySelectorAll('.docx-editor-container');
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
            
            // Также обрабатываем блоки кода DOCX, которые могли появиться заново
            if (pluginState.docxReady) {
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
                    const highlighted = window.hljs.highlight(code, {language: 'javascript'});
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
     * Генерация DOCX документа
     */
    async function runCode(editorId) {
        if (!pluginState.docxReady) {
            showNotification('warning', 'DOCX генератор еще не готов. Дождитесь завершения инициализации.');
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
            showNotification('warning', 'Введите код для генерации DOCX');
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
            // Проверяем, что библиотеки загружены
            const pizzipAvailable = typeof PizZip !== 'undefined' || typeof window.PizZip !== 'undefined';
            const docxtemplaterAvailable = typeof Docxtemplater !== 'undefined' || typeof window.Docxtemplater !== 'undefined' || typeof window.docxtemplater !== 'undefined';
            const mammothAvailable = typeof mammoth !== 'undefined' || typeof window.mammoth !== 'undefined';
            
            if (!pizzipAvailable || !docxtemplaterAvailable || !mammothAvailable) {
                throw new Error('Библиотеки DOCX не загружены. Дождитесь завершения инициализации.');
            }

            // Получаем ссылки на библиотеки
            const PizZipLib = typeof PizZip !== 'undefined' ? PizZip : window.PizZip;
            const DocxtemplaterLib = typeof Docxtemplater !== 'undefined' ? Docxtemplater :
                                   (typeof window.Docxtemplater !== 'undefined' ? window.Docxtemplater : window.docxtemplater);
            const mammothLib = typeof mammoth !== 'undefined' ? mammoth : window.mammoth;

            // Извлекаем путь к шаблону DOCX
            const templatePath = extractLoadPath(code);
            if (!templatePath) {
                const errorMsg = 'Отсутствует обязательная команда #%load с путем к DOCX шаблону.\n\nПример использования:\n#%load="/static/template/docx/test-new.docx"';
                outputContent.innerHTML = `<div class="alert alert-warning">${errorMsg.replace(/\n/g, '<br>')}</div>`;
                showNotification('warning', 'Отсутствует команда #%load');
                setRunButtonReady(editorId);
                return;
            }

            // Извлекаем JSON данные
            const jsonData = extractJsonData(code);
            if (!jsonData) {
                const errorMsg = 'Отсутствуют обязательные данные json_data_for_template.\n\nПример использования:\njson_data_for_template = {\n    "name": "Иван Петров",\n    "company": "ООО Рога и Копыта",\n    "date": "02.09.2025"\n}';
                outputContent.innerHTML = `<div class="alert alert-warning"><pre>${errorMsg}</pre></div>`;
                showNotification('warning', 'Отсутствуют JSON данные');
                setRunButtonReady(editorId);
                return;
            }

            // Получаем загруженный шаблон
            const fullTemplateUrl = templatePath.startsWith('/') ?
                window.location.origin + templatePath :
                templatePath;
            
            const templateBuffer = window.docxTemplates?.get(fullTemplateUrl);
            if (!templateBuffer) {
                throw new Error(`DOCX шаблон не найден: ${templatePath}. Убедитесь, что команда #%load выполнена корректно.`);
            }

            // Настройка простого парсера для поддержки вложенных объектов
            const customParser = function(tag) {
                return {
                    get: function(scope, context) {
                        try {
                            // Обработка {.} для текущего элемента в цикле
                            if (tag === '.') {
                                return scope;
                            }
                            
                            // Обработка точечной нотации (например, user.name)
                            if (tag.includes('.')) {
                                const parts = tag.split('.');
                                let result = scope;
                                for (const part of parts) {
                                    if (result && typeof result === 'object' && part in result) {
                                        result = result[part];
                                    } else {
                                        return ''; // Возвращаем пустую строку вместо undefined
                                    }
                                }
                                return result !== null && result !== undefined ? result : '';
                            }
                            
                            // Обычное свойство
                            const value = scope[tag];
                            return value !== null && value !== undefined ? value : '';
                        } catch (error) {
                            log('warn', 'Error parsing tag:', tag, error);
                            return '';
                        }
                    }
                };
            };

            // Генерируем DOCX документ с помощью docxtemplater
            const zip = new PizZipLib(templateBuffer);
            const doc = new DocxtemplaterLib(zip, {
                paragraphLoop: true,
                linebreaks: true,
                parser: customParser,
                nullGetter: function() {
                    return ''; // Возвращаем пустую строку для null/undefined значений
                }
            });

            // Заполняем шаблон данными
            doc.render(jsonData);

            // Получаем результирующий DOCX
            const resultBuffer = doc.getZip().generate({
                type: "arraybuffer",
                mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            });

            // Сохраняем результат для скачивания
            if (!window.docxResults) {
                window.docxResults = new Map();
            }
            window.docxResults.set(editorId, resultBuffer);

            // Конвертируем DOCX в HTML для отображения с помощью mammoth
            const htmlResult = await mammothLib.convertToHtml({
                arrayBuffer: resultBuffer,
                styleMap: [
                    "p[style-name='Heading 1'] => h1:fresh",
                    "p[style-name='Heading 2'] => h2:fresh",
                    "p[style-name='Heading 3'] => h3:fresh",
                    "p[style-name='Title'] => h1.title:fresh",
                    "r[style-name='Strong'] => strong",
                    "table => table.table.table-bordered"
                ]
            });
            
            const htmlContent = htmlResult.value;
            const messages = htmlResult.messages || [];

            const endTime = performance.now();
            const executionTime = Math.round(endTime - startTime);

            // Подсчитываем статистику
            const textContent = htmlContent.replace(/<[^>]*>/g, '');
            const wordCount = textContent.trim() ? textContent.trim().split(/\s+/).length : 0;
            const charCount = textContent.length;

            // Отображаем HTML представление документа просто как HTML контент
            const result = htmlContent;

            // Функция извлечения пути к шаблону (локальная для runCode)
            function extractLoadPath(code) {
                const loadPattern = /#%load\s*=\s*["']([^"']+)["']/;
                const match = code.match(loadPattern);
                return match ? match[1] : null;
            }

            // Отображаем HTML контент документа с поддержкой тем
            displayDocumentResult(outputContent, result);

            showNotification('success', `DOCX документ сгенерирован за ${executionTime}мс`);

            // Выполняем магические команды copy_console и send_console после успешного выполнения
            executeConsoleCommands(editorId, outputContent);

            // Сбрасываем состояние кнопки после успешного выполнения
            setRunButtonReady(editorId);

            // Уведомляем о выполнении кода
            if (window.eventBus) {
                window.eventBus.emit('module.docx-plugin.code-executed', {
                    timestamp: Date.now(),
                    moduleId: 'docx-plugin',
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
            
            log('error', 'Ошибка генерации DOCX:', error);
            log('error', 'Стек ошибки:', error.stack);
        }
    }

    /**
     * Отображение результата документа с поддержкой тем
     */
    function displayDocumentResult(outputContent, htmlResult) {
        const themeStyles = getDocumentThemeStyles();
        
        outputContent.innerHTML = `
            <div class="docx-document-container bg-body border rounded p-3" style="
                max-height: 600px;
                overflow-y: auto;
                line-height: 1.6;
                font-family: 'Times New Roman', serif;
                margin: 0;
            ">
                <div class="html-result">
                    ${htmlResult}
                </div>
            </div>
            <style>
                ${themeStyles}
            </style>
        `;
    }

    /**
     * Получение стилей для документа в зависимости от темы
     */
    function getDocumentThemeStyles() {
        const isDark = pluginState.theme === 'dark';
        
        return `
            .docx-document-container .html-result h1,
            .docx-document-container .html-result h2,
            .docx-document-container .html-result h3,
            .docx-document-container .html-result h4,
            .docx-document-container .html-result h5,
            .docx-document-container .html-result h6 {
                margin: 20px 0 15px 0;
                color: ${isDark ? 'var(--bs-light)' : 'var(--bs-dark)'} !important;
                font-weight: 600;
            }
            
            .docx-document-container .html-result p {
                margin-bottom: 15px;
                color: var(--bs-body-color) !important;
            }
            
            .docx-document-container .html-result ul,
            .docx-document-container .html-result ol {
                margin: 15px 0 15px 30px;
                color: var(--bs-body-color) !important;
            }
            
            .docx-document-container .html-result li {
                color: var(--bs-body-color) !important;
                margin-bottom: 5px;
            }
            
            .docx-document-container .html-result table {
                width: 100%;
                border-collapse: collapse;
                margin: 20px 0;
            }
            
            .docx-document-container .html-result table th,
            .docx-document-container .html-result table td {
                border: 1px solid var(--bs-border-color);
                padding: 8px 12px;
                text-align: left;
                color: var(--bs-body-color) !important;
            }
            
            .docx-document-container .html-result table th {
                background-color: var(--bs-secondary-bg);
                font-weight: 600;
            }
            
            .docx-document-container .html-result strong {
                color: var(--bs-body-color) !important;
                font-weight: 600;
            }
            
            .docx-document-container .html-result em {
                color: var(--bs-body-color) !important;
            }
            
            .docx-document-container .html-result * {
                color: var(--bs-body-color) !important;
            }
        `;
    }

    /**
     * Обновление темы для всех документов
     */
    function updateTheme(theme) {
        const newTheme = theme === 'dark' ? 'dark' : 'light';
        
        if (pluginState.theme === newTheme) {
            return;
        }

        pluginState.theme = newTheme;
        log('debug', `Updating DOCX theme to: ${newTheme}`);

        // Обновляем все отображенные документы
        document.querySelectorAll('.docx-document-container').forEach(container => {
            const htmlResult = container.querySelector('.html-result');
            if (htmlResult) {
                // Находим родительский элемент со стилями
                const parentWithStyles = container.parentElement;
                const styleElement = parentWithStyles?.querySelector('style');
                if (styleElement) {
                    // Обновляем стили
                    styleElement.textContent = getDocumentThemeStyles();
                }
            }
        });

        // Обновляем контейнеры вывода результатов (они уже используют Bootstrap классы, которые автоматически адаптируются)
        // Но на всякий случай принудительно обновим их классы
        document.querySelectorAll('[id$="-output-content"]').forEach(outputContent => {
            // Проверяем, что это контейнер DOCX плагина
            if (outputContent.id.includes('docx-editor-')) {
                // Bootstrap классы автоматически адаптируются к теме, но можем добавить дополнительную логику если нужно
                log('debug', `Output container ${outputContent.id} theme updated automatically via Bootstrap classes`);
            }
        });
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
        const editorCard = container.querySelector('.docx-editor .card');
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
            // Создаем имя файла в формате "гггг-мм-дд_чч-мм_docx_template.docx-plugin"
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const filename = `${year}-${month}-${day}_${hours}-${minutes}_docx_template.docx-plugin`;
            
            const blob = new Blob([textarea.value], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
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
     * Генерация имени файла в формате "гггг-мм-дд_чч-мм_generated_document.{расширение}"
     */
    function generateFileName(extension) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}_${hours}-${minutes}_generated_document.${extension}`;
    }

    /**
     * Скачивание результатов выполнения (DOCX файл)
     */
    async function downloadOutput(editorId) {
        const outputContent = document.getElementById(editorId + '-output-content');
        if (!outputContent) {
            showNotification('warning', 'Нет результатов для сохранения');
            return;
        }

        // Проверяем, есть ли сгенерированный DOCX файл
        const docxBuffer = window.docxResults?.get(editorId);
        if (docxBuffer) {
            try {
                // Скачиваем DOCX файл
                const blob = new Blob([docxBuffer], {
                    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                });
                saveAs(blob, generateFileName('docx'));
                showNotification('success', 'DOCX файл успешно скачан');
                return;
            } catch (error) {
                log('error', 'Ошибка скачивания DOCX файла:', error);
                showNotification('error', 'Ошибка при скачивании DOCX файла');
                return;
            }
        }

        // Если DOCX файла нет, скачиваем текстовое содержимое как fallback
        const textContent = outputContent.textContent || outputContent.innerText || '';
        
        if (!textContent.trim()) {
            showNotification('warning', 'Нет результатов для сохранения');
            return;
        }

        try {
            await downloadTextFile(textContent, 'docx_output.txt');
            showNotification('success', 'Результаты сохранены в текстовый файл');
        } catch (error) {
            log('error', 'Ошибка при скачивании результатов:', error);
            showNotification('error', 'Ошибка при скачивании файлов');
        }
    }

    /**
     * Скачивание результатов выполнения (старая версия для совместимости)
     */
    async function downloadOutputOld(editorId) {
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
                await downloadTextFile(textContent, 'docx_output.txt');
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
     * Скачивание результатов выполнения в формате HTML
     */
    async function downloadHtmlOutput(editorId) {
        const outputContent = document.getElementById(editorId + '-output-content');
        if (!outputContent) {
            showNotification('warning', 'Нет результатов для сохранения');
            return;
        }

        // Получаем HTML содержимое документа
        const htmlResultContainer = outputContent.querySelector('.html-result');
        if (!htmlResultContainer) {
            showNotification('warning', 'HTML документ не найден для сохранения');
            return;
        }

        try {
            // Создаем полный HTML документ с базовыми стилями
            const htmlContent = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Сгенерированный документ</title>
    <style>
        body {
            font-family: 'Times New Roman', serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
        }
        h1, h2, h3, h4, h5, h6 {
            margin: 20px 0 15px 0;
            font-weight: 600;
        }
        p {
            margin-bottom: 15px;
        }
        ul, ol {
            margin: 15px 0 15px 30px;
        }
        li {
            margin-bottom: 5px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        table th, table td {
            border: 1px solid #ddd;
            padding: 8px 12px;
            text-align: left;
        }
        table th {
            background-color: #f5f5f5;
            font-weight: 600;
        }
        strong {
            font-weight: 600;
        }
    </style>
</head>
<body>
    ${htmlResultContainer.innerHTML}
</body>
</html>`;

            // Создаем и скачиваем HTML файл
            const blob = new Blob([htmlContent], { type: 'text/html; charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = generateFileName('html');
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showNotification('success', 'HTML документ успешно скачан');
            
        } catch (error) {
            log('error', 'Ошибка при скачивании HTML документа:', error);
            showNotification('error', 'Ошибка при скачивании HTML документа');
        }
    }

    /**
     * Скачивание результатов в формате Markdown
     */
    async function downloadMarkdownOutput(editorId) {
        const outputContent = document.getElementById(editorId + '-output-content');
        if (!outputContent) {
            showNotification('warning', 'Нет результатов для сохранения');
            return;
        }

        // Проверяем, есть ли сгенерированный DOCX файл
        const docxBuffer = window.docxResults?.get(editorId);
        if (!docxBuffer) {
            showNotification('warning', 'DOCX документ не найден для конвертации в Markdown');
            return;
        }

        try {
            // Получаем библиотеку mammoth
            const mammothLib = typeof mammoth !== 'undefined' ? mammoth : window.mammoth;
            if (!mammothLib) {
                throw new Error('Библиотека mammoth не загружена');
            }

            // Конвертируем DOCX в Markdown с помощью mammoth
            const markdownResult = await mammothLib.convertToMarkdown({
                arrayBuffer: docxBuffer,
                options: {
                    styleMap: [
                        "p[style-name='Heading 1'] => # :fresh",
                        "p[style-name='Heading 2'] => ## :fresh",
                        "p[style-name='Heading 3'] => ### :fresh",
                        "p[style-name='Heading 4'] => #### :fresh",
                        "p[style-name='Heading 5'] => ##### :fresh",
                        "p[style-name='Heading 6'] => ###### :fresh"
                    ]
                }
            });

            let markdownContent = markdownResult.value;
            
            // Обработка предупреждений mammoth
            if (markdownResult.messages && markdownResult.messages.length > 0) {
                log('warn', 'Предупреждения при конвертации в Markdown:', markdownResult.messages);
            }

            // Создаем и скачиваем Markdown файл
            const blob = new Blob([markdownContent], { type: 'text/markdown; charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = generateFileName('md');
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showNotification('success', 'Markdown документ успешно скачан');
            
        } catch (error) {
            log('error', 'Ошибка при скачивании Markdown документа:', error);
            showNotification('error', 'Ошибка при скачивании Markdown документа: ' + error.message);
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
            <div class="modal fade" id="docx-help-modal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Помощь по работе с блоком DOCX</h5>
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
        const existingModal = document.getElementById('docx-help-modal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Добавляем новое модальное окно
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Показываем модальное окно
        const modal = new bootstrap.Modal(document.getElementById('docx-help-modal'));
        modal.show();
    }

    /**
     * Рендеринг всех DOCX редакторов на странице
     */
    function renderEditors() {
        if (!pluginState.docxReady) {
            // Если DOCX генератор не готов, запускаем инициализацию только один раз
            if (!pluginState.loadingPromise) {
                initializeDocx();
            }
            return;
        }

        // Ищем ТОЛЬКО блоки кода DOCX с правильными классами
        const codeBlocks = document.querySelectorAll('pre code.language-docx, pre code[class*="language-docx"]');
        log('debug', `Найдено ${codeBlocks.length} блоков DOCX кода для преобразования в редакторы`);
        
        codeBlocks.forEach(codeBlock => {
            const preElement = codeBlock.parentElement;
            if (!preElement || preElement.tagName !== 'PRE') return;
            
            // Проверяем, не был ли уже создан редактор для этого блока
            if (preElement.hasAttribute('data-converted') || preElement.classList.contains('docx-converted')) {
                log('debug', `Блок кода уже преобразован, пропускаем`);
                return;
            }
            
            // Извлекаем содержимое DOCX кода
            const docxContent = codeBlock.textContent || '';
            
            // Проверяем, что содержимое не пустое
            if (!docxContent.trim()) {
                return;
            }
            
            // Дополнительная проверка: это должен быть именно DOCX код
            const className = codeBlock.className || '';
            if (!className.includes('docx')) {
                log('debug', `Пропуск не-DOCX блока кода с классом: ${className}`);
                return;
            }
            
            // Проверяем, что это блок кода из markdown (имеет правильную структуру)
            if (!className.includes('language-')) {
                log('debug', `Пропуск блока кода без префикса language-: ${className}`);
                return;
            }
            
            // Создаем стабильный ID на основе содержимого и позиции (как в createDocxEditor)
            let hash = 0;
            for (let i = 0; i < docxContent.length; i++) {
                const char = docxContent.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Преобразуем в 32-битное число
            }
            const contentHash = Math.abs(hash).toString(36).substring(0, 8);
            const editorId = `docx-editor-${contentHash}-render`;
            
            // Проверяем, не существует ли уже редактор с таким ID
            const existingEditor = document.getElementById(editorId);
            if (existingEditor) {
                log('debug', `Редактор ${editorId} уже существует, пропускаем создание`);
                return;
            }
            
            log('debug', `Преобразование блока DOCX кода в редактор: ${editorId}`);
            
            // Помечаем как конвертированный
            preElement.setAttribute('data-converted', 'true');
            preElement.classList.add('docx-converted');
            
            // Создаем полный интерфейс редактора
            const editorHtml = createDocxEditor(editorId, docxContent);
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
        const placeholders = document.querySelectorAll('.docx-editor-placeholder');
        log('debug', `Найдено ${placeholders.length} заглушек для рендеринга`);
        
        placeholders.forEach(placeholder => {
            const editorId = placeholder.id;
            const docxContent = placeholder.getAttribute('data-docx-content') || '';
            
            // Проверяем, не был ли уже создан полный редактор с таким ID
            const existingEditor = document.querySelector(`.docx-editor-container[id="${editorId}"]`);
            if (existingEditor && !existingEditor.querySelector('.docx-editor-placeholder')) {
                log('debug', `Редактор ${editorId} уже существует как полный редактор, пропускаем`);
                return;
            }
            
            // Создаем полный интерфейс редактора
            const editorHtml = createDocxEditor(editorId, docxContent);
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

        log('debug', 'DOCX редакторы отрендерены');
    }

    /**
     * Проверка наличия DOCX блоков в тексте
     */
    function hasContent(content) {
        return content && content.includes('```docx');
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
                moduleId: 'docx-plugin',
                duration: 5000
            });
        } else {
            // Fallback для случая отсутствия EventBus
            log('debug', `${type.toUpperCase()}: ${message}`);
        }
    }

    /**
     * Получение статистики плагина
     */
    function getStats() {
        const editors = document.querySelectorAll('.docx-editor-container').length;
        const placeholders = document.querySelectorAll('.docx-editor-placeholder').length;
        
        return {
            initialized: pluginState.initialized,
            docxReady: pluginState.docxReady,
            editorsCount: editors,
            placeholdersCount: placeholders,
            packagesLoaded: { ...pluginState.packagesLoaded }
        };
    }

    // Инициализация при загрузке DOM
    document.addEventListener('DOMContentLoaded', function() {
        log('debug', 'DOM загружен, инициализация плагина DOCX');
        
        // Инициализация текущей темы
        if (document.documentElement.getAttribute('data-bs-theme') === 'dark') {
            pluginState.theme = 'dark';
        } else {
            pluginState.theme = 'light';
        }
        log('debug', `Инициализация темы DOCX плагина: ${pluginState.theme}`);

        // Регистрация плагина в ядре markdown-it
        if (window.markdownCore) {
            window.markdownCore.registerPlugin('docx', docxPlugin);
            log('debug', 'Плагин DOCX зарегистрирован в ядре markdown');
        } else {
            log('warn', 'Ядро Markdown недоступно, плагин будет зарегистрирован позже');
            // Ждем готовности ядра
            if (window.eventBus) {
                window.eventBus.on('module.markdown-core.ready', () => {
                    if (window.markdownCore) {
                        window.markdownCore.registerPlugin('docx', docxPlugin);
                        log('debug', 'Плагин DOCX зарегистрирован в ядре markdown (отложенно)');
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
                    // Проверяем, есть ли среди добавленных узлов редакторы DOCX
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const hasEditors = node.querySelector && (
                                node.querySelector('.docx-editor-container') ||
                                node.classList.contains('docx-editor-container')
                            );
                            if (hasEditors) {
                                // Дополнительная проверка: убеждаемся, что родительский контейнер в режиме "rendered"
                                const messageContainer = node.closest('[data-mode]');
                                const containerMode = messageContainer ? messageContainer.getAttribute('data-mode') : null;
                                
                                if (containerMode === 'rendered') {
                                    log('debug', 'Обнаружены новые редакторы DOCX в режиме "rendered"');
                                    shouldReinitialize = true;
                                } else {
                                    log('debug', `Пропуск новых редакторов DOCX в режиме "${containerMode}" (ожидаем "rendered")`);
                                }
                            }
                        }
                    });
                    
                    // Проверяем, были ли удалены редакторы
                    mutation.removedNodes.forEach(function(node) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const hasEditors = node.querySelector && (
                                node.querySelector('.docx-editor-container') ||
                                node.classList.contains('docx-editor-container')
                            );
                            if (hasEditors) {
                                log('debug', 'Редакторы DOCX удалены из DOM');
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

            // Подписываемся на изменения темы
            window.eventBus.on('globalVars.bootstrapTheme.changed', (theme) => {
                updateTheme(theme);
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
        log('debug', 'Плагин DOCX инициализирован');
    });

    // Публичный API
    window.docxPlugin = {
        // Основные функции
        plugin: docxPlugin,
        initialize: initializeDocx,
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
        downloadHtmlOutput: downloadHtmlOutput,
        downloadMarkdownOutput: downloadMarkdownOutput,
        showHelp: showHelp,
        showFullOutput: showFullOutput,
        
        // Функции matplotlib тулбара
        downloadPlot: downloadPlot,
        copyPlotToClipboard: copyPlotToClipboard,
        
        // Утилиты
        hasContent: hasContent,
        setupEditor: setupEditor,
        reinitializeEditorsOnModeChange: reinitializeEditorsOnModeChange,
        updateTheme: updateTheme,
        
        // Информация о состоянии
        getStats: getStats,
        
        // Проверка готовности
        get isReady() {
            return pluginState.docxReady;
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
                    // Для SVG и PDF используем DOCX генератор для повторного рендеринга
                    if (!pluginState.docxReady) {
                        showNotification('error', 'DOCX генератор не готов для экспорта');
                        return;
                    }
                    
                    try {
                        // TODO: Здесь будет код для экспорта DOCX в различные форматы
                        const result = 'export_placeholder_data';
                        
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

    log('debug', 'Модуль плагина DOCX загружен');

})();