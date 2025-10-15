
//  Плагин FormIO для markdown-it
//  Обеспечивает рендеринг форм FormIO.js в markdown контенте
//  
//  ПРОМПТ для агента ЛЛМ чтобы он мог понимать как использовать этот плагин как инструмент взаимодействия с пользователем:

// У тебя есть инструмент formio-plugin для предоставления пользователю интерактивных форм на базе схемы formio.js с предзаполненными данными из json. 
// Для создания формы оберни код с ссылкой на шаблон схемы формы и данными предзаполнения в блок кода ```formio и ```, например,
// ```formio
// #%load="/static/formio-template/contract_schema.json"
// json_data_for_template = {
//     "name": "Иван Петров",
//     "company": "ООО Рога и Копыта", 
//     "date": "02.09.2025"
// }
// ```
// После этого пользователь получает готовую форму для редактирования, отправки в ИС, формирования документов или передачи данных в контекст диалога.
// Если в процессе диалога с пользователем появилась необходимость предоставить пользователю для заполнения любую из форм,
// то в блок кода добавь ссылку на шаблон и вставь данные или часть данных из диалога с пользователем для предзаполнения полей формы.
// При наполнении "json_data_for_template{}" имеющимися данными, нельзя добавлять теги с пустыми значениями "".

// Доступные шаблоны форм:
// 1) Форма контрольной точки проекта (`/static/template/formio/checkpoint_card_form_schema.json`)
// Предназначена для создания и управления контрольными точками проектов с полным набором проектных метрик.
// Поля формы:
// - `id` - уникальный числовой идентификатор контрольной точки
// - `category` - категория работ (Планирование, Анализ, Проектирование, Разработка, Тестирование, Внедрение, Интеграция, Инфраструктура, Документация, Обучение, Исправления)
// - `name` - название контрольной точки (5-200 символов)
// - `plannedStart` - плановая дата начала работ
// - `actualStart` - фактическая дата начала работ
// - `plannedEnd` - плановая дата завершения работ
// - `actualEnd` - фактическая дата завершения работ
// - `forecastEnd` - прогнозируемая дата завершения
// - `plannedBudget` - плановый бюджет в рублях
// - `actualCost` - фактические затраты в рублях
// - `forecastCost` - прогнозируемая стоимость в рублях
// - `plannedEffortHours` - плановые трудозатраты в часах
// - `actualEffortHours` - фактические трудозатраты в часах
// - `forecastEffortHours` - прогнозируемые трудозатраты в часах
// - `status` - текущий статус (Не начат, В процессе, Завершен, Приостановлен, Отменен)
// - `completionPercentage` - процент выполнения (0-100)
// - `qualityScore` - оценка качества выполнения (0-100 баллов)
// - `riskLevel` - уровень риска (Низкий, Средний, Высокий, Критический)
// - `description` - дополнительное описание и комментарии (до 2000 символов)

// 2) Форма регистрации пользователя (`/static/template/formio/formio_user_form_schema.json`)
// Собирает базовую контактную информацию для регистрации и связи с пользователями.
// Поля формы:
// - `fullName` - полное ФИО пользователя (только русские буквы, 3-100 символов)
// - `email` - адрес электронной почты в стандартном формате
// - `phone` - номер телефона в международном формате (+7 (999) 123-45-67)

// 3) Форма устава проекта (`/static/template/formio/project_charter_form_schema.json`)
// Стандартизированная форма инициации проектов согласно методологии PMI для структурированного сбора ключевых параметров проекта.
// Поля формы:
// - `projectTitle` - официальное название проекта (5-100 символов)
// - `businessCase` - деловое обоснование и описание бизнес-потребности (50-1000 символов)
// - `projectObjectives` - измеримые цели и конкретные задачи проекта (30-2000 символов)
// - `projectSponsor` - ФИО и должность спонсора проекта (5-150 символов)
// - `projectDuration` - предполагаемая длительность (до 1 месяца, 1-3 месяца, 3-6 месяцев, 6-12 месяцев, 12-24 месяца, свыше 24 месяцев)
// - `projectBudget` - предварительный бюджет проекта (до 500 тыс. руб., 500 тыс.-1 млн руб., 1-5 млн руб., 5-10 млн руб., 10-50 млн руб., свыше 50 млн руб., требуется детальная оценка)
// - `projectRisks` - ключевые риски и ограничения проекта (10-1500 символов)


(function() {
    'use strict';

    // Уровень логирования модуля
    const LOG_LEVEL = 'warn';

    // Функция логирования с проверкой уровня
    function log(level, message, ...args) {
        const levels = { debug: 0, warn: 1, error: 2 };
        if (levels[level] >= levels[LOG_LEVEL]) {
            console[level](`[formio-plugin] ${message}`, ...args);
        }
    }

    // Состояние плагина
    const pluginState = {
        initialized: false,
        formioReady: false,
        formCounter: 0,
        loadedSchemas: new Map(), // Кэш загруженных схем
        createdForms: new Map(), // Отслеживание созданных экземпляров FormIO
        processedFormIds: new Set() // Глобальное отслеживание обработанных форм
    };

    /**
     * Плагин для markdown-it для обработки блоков ```formio
     */
    function formioPlugin(md) {
        const defaultRenderer = md.renderer.rules.fence || function(tokens, idx, options, env, renderer) {
            return renderer.renderToken(tokens, idx, options);
        };

        md.renderer.rules.fence = function(tokens, idx, options, env, renderer) {
            const token = tokens[idx];
            const info = token.info ? token.info.trim() : '';
            const langName = info ? info.split(/\s+/g)[0] : '';

            if (langName === 'formio') {
                const formId = 'formio-' + (++pluginState.formCounter) + '-' + Math.random().toString(36).substr(2, 9);
                const content = token.content.trim();
                
                log('debug', `Creating FormIO form with ID: ${formId}`);
                log('debug', `FormIO content: ${content}`);
                
                // Используем Base64 кодирование для безопасной передачи контента через HTML атрибут
                const encodedContent = btoa(unescape(encodeURIComponent(content)));
                return `<div class="formio-form" id="${formId}" data-formio-content="${encodedContent}"></div>\n`;
            }

            return defaultRenderer(tokens, idx, options, env, renderer);
        };
    }

    /**
     * Валидация URL
     */
    function validateUrl(url) {
        if (!url || typeof url !== 'string') {
            return { valid: false, error: 'URL не может быть пустым' };
        }

        const trimmedUrl = url.trim();
        
        // Проверка на URL с хостом (http/https)
        if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
            try {
                new URL(trimmedUrl);
                return { valid: true, type: 'absolute', url: trimmedUrl };
            } catch (e) {
                return { valid: false, error: 'Некорректный абсолютный URL' };
            }
        }
        
        // Проверка на относительный путь к JSON файлу
        if (trimmedUrl.endsWith('.json')) {
            // Удаляем параметры запроса и якоря для проверки пути
            const pathOnly = trimmedUrl.split('?')[0].split('#')[0];
            if (pathOnly.endsWith('.json')) {
                return { valid: true, type: 'relative', url: trimmedUrl };
            }
        }
        
        return { 
            valid: false, 
            error: 'URL не соответствует требованиям. Должен быть http/https URL или относительный путь к .json файлу' 
        };
    }

    /**
     * Валидация схемы FormIO
     */
    function validateFormioSchema(schema) {
        if (!schema || typeof schema !== 'object') {
            return { valid: false, error: 'Схема должна быть объектом JSON' };
        }

        if (!schema.components || !Array.isArray(schema.components)) {
            return { valid: false, error: 'Схема должна содержать поле "components" типа массив' };
        }

        return { valid: true };
    }

    /**
     * Парсинг контента блока formio для извлечения URL и данных
     */
    function parseFormioContent(content) {
        log('debug', 'Parsing formio content:', content);
        
        let templateUrl = null;
        let jsonData = null;
        
        // Ищем команду #%load используя тот же паттерн, что и в docx-plugin.js
        const loadPattern = /#%load\s*=\s*["']([^"']+)["']/;
        log('debug', 'Using load pattern:', loadPattern);
        
        const loadMatch = content.match(loadPattern);
        log('debug', 'Load match result:', loadMatch);
        
        if (loadMatch) {
            templateUrl = loadMatch[1];
            log('debug', 'Found template URL:', templateUrl);
        } else {
            log('warn', 'Template URL not found in content');
            // Дополнительная отладка - проверим каждую строку
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                log('debug', `Line ${i}: "${line}"`);
                if (line.includes('#%load')) {
                    log('debug', `Found #%load in line ${i}: "${line}"`);
                    // Попробуем более простое регулярное выражение
                    const simpleMatch = line.match(/#%load\s*=\s*"([^"]+)"/);
                    if (simpleMatch) {
                        templateUrl = simpleMatch[1];
                        log('debug', 'Found template URL with simple pattern:', templateUrl);
                        break;
                    }
                }
            }
        }
        
        // Ищем json_data_for_template используя тот же подход, что и в docx-plugin.js
        try {
            // Ищем начало паттерна json_data_for_template = {
            const startPattern = /json_data_for_template\s*=\s*\{/;
            const startMatch = content.match(startPattern);
            
            if (startMatch) {
                // Находим позицию начала JSON объекта
                const startIndex = startMatch.index + startMatch[0].lastIndexOf('{');
                
                // Используем счетчик скобок для правильного извлечения вложенного JSON
                let braceCount = 0;
                let endIndex = -1;
                
                for (let i = startIndex; i < content.length; i++) {
                    const char = content[i];
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
                
                if (endIndex !== -1) {
                    const jsonString = content.substring(startIndex, endIndex + 1);
                    log('debug', 'Found JSON data:', jsonString);
                    
                    // Валидируем JSON синтаксис
                    try {
                        jsonData = JSON.parse(jsonString);
                        log('debug', 'JSON data successfully parsed:', jsonData);
                    } catch (parseError) {
                        log('error', 'JSON parsing error:', parseError);
                    }
                }
            } else {
                // Если нет переменной json_data_for_template, ищем JSON объект после команды #%load
                const lines = content.split('\n');
                let foundLoadLine = false;
                let jsonLines = [];
                
                for (const line of lines) {
                    if (foundLoadLine) {
                        jsonLines.push(line);
                    } else if (line.trim().match(loadPattern)) {
                        foundLoadLine = true;
                    }
                }
                
                if (foundLoadLine && jsonLines.length > 0) {
                    const contentAfterLoad = jsonLines.join('\n').trim();
                    log('debug', 'Content after #%load line:', contentAfterLoad);
                    
                    if (contentAfterLoad.startsWith('{') && contentAfterLoad.endsWith('}')) {
                        try {
                            // Проверяем, что это валидный JSON
                            jsonData = JSON.parse(contentAfterLoad);
                            log('debug', 'Extracted JSON data from content after #%load:', jsonData);
                        } catch (error) {
                            log('warn', 'Failed to parse JSON content after #%load:', error);
                        }
                    }
                }
            }
        } catch (error) {
            log('error', 'Error extracting JSON data:', error);
        }
        
        return {
            templateUrl,
            jsonData,
            valid: !!templateUrl
        };
    }

    /**
     * Загрузка схемы формы
     */
    async function loadFormSchema(url) {
        // Проверяем кэш
        if (pluginState.loadedSchemas.has(url)) {
            log('debug', `Schema loaded from cache: ${url}`);
            return pluginState.loadedSchemas.get(url);
        }

        try {
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const schema = await response.json();
            
            // Валидируем схему
            const validation = validateFormioSchema(schema);
            if (!validation.valid) {
                throw new Error(`Некорректная схема FormIO: ${validation.error}`);
            }

            // Сохраняем в кэш
            pluginState.loadedSchemas.set(url, schema);
            log('debug', `Schema loaded and cached: ${url}`);
            
            return schema;
        } catch (error) {
            log('error', `Failed to load schema from ${url}:`, error);
            throw error;
        }
    }

    /**
     * Создание предупреждения Bootstrap
     */
    function createWarning(message) {
        return `
            <div class="alert alert-warning d-flex align-items-center" role="alert">
                <i class="bi bi-exclamation-triangle-fill me-2"></i>
                <div>${escapeHtml(message)}</div>
            </div>
        `;
    }

    /**
     * Инициализация библиотеки FormIO
     */
    function initializeFormIO() {
        if (!window.Formio) {
            log('error', 'FormIO library not found');
            return false;
        }

        if (pluginState.formioReady) {
            log('debug', 'FormIO already initialized');
            return true;
        }

        try {
            // FormIO.js не требует специальной инициализации
            pluginState.formioReady = true;
            log('debug', 'FormIO initialized successfully');

            // Уведомляем о готовности плагина
            if (window.eventBus) {
                window.eventBus.emit('module.formio-plugin.ready', {
                    timestamp: Date.now(),
                    moduleId: 'formio-plugin'
                });
            }

            return true;
        } catch (error) {
            log('error', 'Failed to initialize FormIO:', error);
            return false;
        }
    }

    /**
     * Рендеринг всех форм FormIO на странице
     */
    async function renderForms() {
        if (!window.Formio || !pluginState.formioReady) {
            log('warn', 'FormIO not ready, attempting to initialize');
            if (!initializeFormIO()) {
                return;
            }
        }
        
        const forms = document.querySelectorAll('.formio-form:not([data-processed])');
        log('debug', `Found ${forms.length} unprocessed FormIO forms`);

        for (const form of forms) {
            await renderSingleForm(form);
        }

        // Уведомляем о завершении рендеринга
        if (window.eventBus && forms.length > 0) {
            window.eventBus.emit('module.formio-plugin.content-rendered', {
                timestamp: Date.now(),
                moduleId: 'formio-plugin',
                elementsCount: forms.length
            });
        }
    }

    /**
     * Рендеринг одной формы
     */
    async function renderSingleForm(formElement) {
        if (!formElement) {
            return;
        }

        const formId = formElement.id;
        
        // ВАЖНО: Проверяем, не была ли форма уже обработана глобально
        if (pluginState.processedFormIds.has(formId)) {
            log('debug', `Form ${formId} already processed globally, skipping`);
            return;
        }

        // Проверяем, не существует ли уже экземпляр FormIO для этой формы
        if (pluginState.createdForms.has(formId)) {
            log('debug', `FormIO instance for ${formId} already exists, skipping recreation`);
            return;
        }

        // Дополнительная проверка атрибута data-processed
        if (formElement.hasAttribute('data-processed')) {
            log('debug', `Form ${formId} has data-processed attribute, skipping`);
            return;
        }

        // Получаем контент из data-атрибута и декодируем из Base64
        const encodedContent = formElement.getAttribute('data-formio-content');
        let rawContent = '';
        
        if (encodedContent) {
            try {
                rawContent = decodeURIComponent(escape(atob(encodedContent)));
            } catch (error) {
                log('error', 'Failed to decode Base64 content:', error);
                rawContent = formElement.textContent.trim();
            }
        } else {
            rawContent = formElement.textContent.trim();
        }
        
        log('debug', `Rendering form: ${formId} with content: ${rawContent}`);

        try {
            // Парсим контент блока formio
            const parsedContent = parseFormioContent(rawContent);
            
            if (!parsedContent.valid || !parsedContent.templateUrl) {
                throw new Error('Не найдена команда #%load с URL шаблона формы');
            }

            // Валидируем URL
            const urlValidation = validateUrl(parsedContent.templateUrl);
            if (!urlValidation.valid) {
                throw new Error(urlValidation.error);
            }

            // Формируем полный URL для относительных путей
            let fullUrl = urlValidation.url;
            if (urlValidation.type === 'relative') {
                fullUrl = new URL(urlValidation.url, window.location.origin).href;
            }

            // Загружаем схему
            const schema = await loadFormSchema(fullUrl);

            // Очищаем контейнер
            formElement.innerHTML = '';
            formElement.style.width = '100%';

            // Создаем форму FormIO
            const formInstance = await window.Formio.createForm(formElement, schema, {
                readOnly: false,
                noAlerts: true,
                buttonSettings: {
                    showCancel: false
                }
            });

            // ВАЖНО: Сохраняем экземпляр формы для предотвращения повторного создания
            pluginState.createdForms.set(formId, formInstance);

            // Предзаполняем форму данными, если они есть
            if (parsedContent.jsonData) {
                log('debug', 'Pre-filling form with data:', parsedContent.jsonData);
                formInstance.submission = {
                    data: parsedContent.jsonData
                };
            }

            // Обработчик отправки формы
            formInstance.on('submit', function(submission) {
                log('debug', 'Form submitted:', submission);
                
                // Уведомляем о отправке формы
                if (window.eventBus) {
                    window.eventBus.emit('module.formio-plugin.form-submitted', {
                        timestamp: Date.now(),
                        moduleId: 'formio-plugin',
                        formId: formId,
                        submission: submission
                    });
                }
            });

            // ВАЖНО: Помечаем форму как обработанную во всех системах отслеживания
            formElement.setAttribute('data-processed', 'true');
            pluginState.processedFormIds.add(formId);
            
            log('debug', `Form rendered successfully: ${formId}`);

            // Уведомляем о рендеринге формы
            if (window.eventBus) {
                window.eventBus.emit('module.formio-plugin.form-rendered', {
                    timestamp: Date.now(),
                    moduleId: 'formio-plugin',
                    formId: formId,
                    url: fullUrl,
                    prefilledData: parsedContent.jsonData
                });
            }

        } catch (error) {
            log('error', 'FormIO rendering error:', error);
            
            // Определяем тип ошибки для соответствующего сообщения
            let errorMessage = 'Ошибка загрузки формы';
            if (error.message.includes('Не найдена команда #%load')) {
                errorMessage = 'Не найдена команда #%load с URL шаблона формы';
            } else if (error.message.includes('URL не соответствует')) {
                errorMessage = error.message;
            } else if (error.message.includes('HTTP 404') || error.message.includes('Failed to fetch')) {
                errorMessage = 'Нет файла схемы по указанному URL';
            } else if (error.message.includes('Некорректная схема FormIO')) {
                errorMessage = 'Файл не соответствует формату FormIO.js';
            }
            
            // Показываем предупреждение пользователю
            formElement.innerHTML = createWarning(errorMessage);
            
            // ВАЖНО: Помечаем как обработанную даже при ошибке
            formElement.setAttribute('data-processed', 'true');
            pluginState.processedFormIds.add(formId);

            // Уведомляем об ошибке
            if (window.eventBus) {
                window.eventBus.emit('module.formio-plugin.error', {
                    timestamp: Date.now(),
                    moduleId: 'formio-plugin',
                    formId: formId,
                    error: error.message
                });
            }
        }
    }

    /**
     * Проверка наличия форм FormIO в тексте
     */
    function hasContent(content) {
        if (!content || !content.includes('```formio')) {
            return false;
        }
        
        // Дополнительная проверка на наличие команды #%load
        const formioBlocks = content.match(/```formio\s*([\s\S]*?)```/g);
        if (formioBlocks) {
            return formioBlocks.some(block => {
                const parsedContent = parseFormioContent(block.replace(/```formio|```/g, '').trim());
                return parsedContent.valid;
            });
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
     * Обновление темы для форм
     */
    function updateTheme(theme) {
        log('debug', `Updating FormIO theme to: ${theme}`);
        // FormIO.js автоматически адаптируется к Bootstrap темам
        // Дополнительная настройка не требуется
    }

    /**
     * Сброс состояния форм для повторного рендеринга
     */
    function resetForms() {
        // Уничтожаем все существующие экземпляры FormIO
        pluginState.createdForms.forEach((formInstance, formId) => {
            try {
                if (formInstance && typeof formInstance.destroy === 'function') {
                    formInstance.destroy();
                    log('debug', `FormIO instance destroyed: ${formId}`);
                }
            } catch (error) {
                log('warn', `Error destroying FormIO instance ${formId}:`, error);
            }
        });
        
        // Очищаем все состояния отслеживания
        pluginState.createdForms.clear();
        pluginState.processedFormIds.clear();
        
        // Удаляем атрибуты data-processed
        document.querySelectorAll('.formio-form[data-processed]').forEach(form => {
            form.removeAttribute('data-processed');
        });
        
        log('debug', 'Reset all form processing flags and cleared form instances');
    }

    /**
     * Очистка конкретной формы
     */
    function clearForm(formId) {
        // Уничтожаем экземпляр FormIO если существует
        const formInstance = pluginState.createdForms.get(formId);
        if (formInstance) {
            try {
                if (typeof formInstance.destroy === 'function') {
                    formInstance.destroy();
                    log('debug', `FormIO instance destroyed: ${formId}`);
                }
            } catch (error) {
                log('warn', `Error destroying FormIO instance ${formId}:`, error);
            }
            pluginState.createdForms.delete(formId);
        }
        
        // Удаляем из глобального отслеживания
        pluginState.processedFormIds.delete(formId);
        
        // Удаляем атрибут data-processed
        const formElement = document.getElementById(formId);
        if (formElement) {
            formElement.removeAttribute('data-processed');
        }
        
        log('debug', `Form ${formId} cleared from all tracking systems`);
    }

    /**
     * Получение статистики плагина
     */
    function getStats() {
        const totalForms = document.querySelectorAll('.formio-form').length;
        const processedForms = document.querySelectorAll('.formio-form[data-processed]').length;
        
        return {
            initialized: pluginState.initialized,
            formioReady: pluginState.formioReady,
            formCounter: pluginState.formCounter,
            totalForms: totalForms,
            processedForms: processedForms,
            pendingForms: totalForms - processedForms,
            cachedSchemas: pluginState.loadedSchemas.size,
            createdFormInstances: pluginState.createdForms.size,
            globallyProcessedForms: pluginState.processedFormIds.size
        };
    }

    // Инициализация при загрузке DOM
    document.addEventListener('DOMContentLoaded', function() {
        log('debug', 'DOM loaded, initializing FormIO plugin');
        
        // Инициализация FormIO
        setTimeout(initializeFormIO, 100);
        
        // Подписка на изменения темы
        if (window.eventBus) {
            window.eventBus.on('globalVars.bootstrapTheme.changed', (theme) => {
                updateTheme(theme);
            });
        }
        
        // Регистрация плагина в ядре markdown-it
        if (window.markdownCore) {
            window.markdownCore.registerPlugin('formio', formioPlugin);
            log('debug', 'FormIO plugin registered with markdown core');
        } else {
            log('warn', 'Markdown core not available, plugin will be registered later');
            // Ждем готовности ядра
            if (window.eventBus) {
                window.eventBus.on('module.markdown-core.ready', () => {
                    if (window.markdownCore) {
                        window.markdownCore.registerPlugin('formio', formioPlugin);
                        log('debug', 'FormIO plugin registered with markdown core (delayed)');
                    }
                });
            }
        }

        pluginState.initialized = true;
        log('debug', 'FormIO plugin initialized');
    });

    // Публичный API
    window.formioPlugin = {
        // Основные функции
        plugin: formioPlugin,
        initialize: initializeFormIO,
        renderForms: renderForms,
        renderSingleForm: renderSingleForm,
        
        // Утилиты
        hasContent: hasContent,
        updateTheme: updateTheme,
        resetForms: resetForms,
        clearForm: clearForm,
        validateUrl: validateUrl,
        validateFormioSchema: validateFormioSchema,
        parseFormioContent: parseFormioContent,
        
        // Информация о состоянии
        getStats: getStats,
        
        // Проверка готовности
        get isReady() {
            return pluginState.formioReady;
        }
    };

    log('debug', 'FormIO plugin module loaded');

})();