/**
 * Модуль автоматического сканирования и загрузки тем
 */
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
            console[level](message, ...args);
        }
    }

    const THEMES_BASE_PATH = './themes/';
    const REGISTRY_FILE = 'themes-registry.json';
    
    // Кэш тем
    const themesCache = new Map();
    let themesRegistry = null;

    // Встроенные темы Bootstrap
    const BUILTIN_THEMES = {
        light: {
            id: 'light',
            name: 'Светлая',
            description: 'Стандартная светлая тема Bootstrap',
            version: '1.0.0',
            author: 'Bootstrap',
            license: 'MIT',
            category: 'builtin',
            tags: ['light', 'default', 'bootstrap'],
            bootstrap_version: '5.3.0',
            preview_image: null,
            icon: 'bi-sun-fill',
            files: { css: null, js: null },
            color_modes: ['light'],
            features: ['Стандартная светлая тема', 'Высокая читаемость', 'Классический дизайн'],
            installation_date: new Date().toISOString(),
            last_updated: new Date().toISOString()
        },
        dark: {
            id: 'dark',
            name: 'Темная',
            description: 'Стандартная темная тема Bootstrap',
            version: '1.0.0',
            author: 'Bootstrap',
            license: 'MIT',
            category: 'builtin',
            tags: ['dark', 'default', 'bootstrap'],
            bootstrap_version: '5.3.0',
            preview_image: null,
            icon: 'bi-moon-fill',
            files: { css: null, js: null },
            color_modes: ['dark'],
            features: ['Стандартная темная тема', 'Снижение нагрузки на глаза', 'Современный дизайн'],
            installation_date: new Date().toISOString(),
            last_updated: new Date().toISOString()
        }
    };

    /**
     * Сканирование папок с темами
     */
    async function scanThemeFolders() {
        const themes = new Map();
        
        try {
            // Добавляем встроенные темы Bootstrap
            Object.values(BUILTIN_THEMES).forEach(theme => {
                // Проверяем статус enabled для встроенных тем в реестре
                const registryTheme = themesRegistry?.themes?.find(t => t.id === theme.id);
                const enabled = registryTheme ? registryTheme.enabled !== false : true;
                
                themes.set(theme.id, {
                    ...theme,
                    enabled: enabled
                });
            });

            // Загружаем реестр тем
            try {
                const registryResponse = await fetch(`${THEMES_BASE_PATH}${REGISTRY_FILE}`);
                if (registryResponse.ok) {
                    const registryText = await registryResponse.text();
                    if (registryText.trim()) {
                        themesRegistry = JSON.parse(registryText);
                    } else {
                        themesRegistry = { themes: [], last_scan: null };
                    }
                } else {
                    themesRegistry = { themes: [], last_scan: null };
                }
            } catch (error) {
                log('warn', 'Не удалось загрузить реестр тем:', error);
                themesRegistry = { themes: [], last_scan: null };
            }

            // Сканируем папки с темами
            const themeFolders = await getThemeFoldersFromRegistry();
            
            for (const themeFolder of themeFolders) {
                const themePath = `${THEMES_BASE_PATH}${themeFolder}/`;
                const themeData = await loadThemeMetadata(themePath);
                
                if (themeData) {
                    // Получаем информацию о включении/отключении из реестра
                    const registryTheme = themesRegistry.themes.find(t => t.id === themeData.id);
                    const enabled = registryTheme ? registryTheme.enabled !== false : true;
                    
                    themes.set(themeData.id, {
                        ...themeData,
                        path: themePath,
                        category: themeData.category || 'external',
                        enabled: enabled
                    });
                }
            }

            // Обновляем реестр
            await updateThemesRegistry(themes);
            
            return themes;
            
        } catch (error) {
            log('error', 'Ошибка сканирования тем:', error);
            // Возвращаем хотя бы встроенные темы
            Object.values(BUILTIN_THEMES).forEach(theme => {
                themes.set(theme.id, theme);
            });
            return themes;
        }
    }

    /**
     * Получение списка папок тем из реестра
     */
    async function getThemeFoldersFromRegistry() {
        // Если есть реестр, используем только его
        if (themesRegistry && themesRegistry.themes) {
            const registryFolders = themesRegistry.themes
                .filter(theme => theme.category !== 'builtin')
                .map(theme => theme.id);
            
            return registryFolders;
        }
        
        // Если реестра нет, возвращаем пустой массив
        // Новые темы должны добавляться только через реестр
        log('warn', 'Реестр тем не найден. Внешние темы не будут загружены.');
        return [];
    }

    /**
     * Загрузка метаданных темы
     */
    async function loadThemeMetadata(themePath) {
        try {
            const metadataResponse = await fetch(`${themePath}theme.json`);
            if (!metadataResponse.ok) {
                log('warn', `Метаданные темы не найдены: ${themePath}theme.json`);
                return null;
            }
            
            const metadata = await metadataResponse.json();
            
            // Проверяем наличие CSS файла (если указан)
            if (metadata.files && metadata.files.css) {
                const cssResponse = await fetch(`${themePath}${metadata.files.css}`, { method: 'HEAD' });
                if (!cssResponse.ok) {
                    log('warn', `CSS файл не найден для темы ${metadata.id}: ${themePath}${metadata.files.css}`);
                    return null;
                }
            }
            
            return metadata;
            
        } catch (error) {
            log('warn', `Ошибка загрузки метаданных темы из ${themePath}:`, error);
            return null;
        }
    }

    /**
     * Обновление реестра тем
     */
    async function updateThemesRegistry(themes) {
        const registry = {
            themes: Array.from(themes.values()),
            last_scan: new Date().toISOString(),
            total_count: themes.size
        };

        try {
            // Сохраняем в localStorage как fallback
            localStorage.setItem('chatApp_themes_registry', JSON.stringify(registry));
            log('debug', 'Реестр тем обновлен в localStorage');
        } catch (error) {
            log('warn', 'Не удалось сохранить реестр тем в localStorage:', error);
        }
    }

    /**
     * Загрузка CSS темы
     */
    async function loadThemeCSS(themeId) {
        if (themesCache.has(themeId)) {
            return themesCache.get(themeId);
        }

        // Для встроенных тем Bootstrap CSS не нужен
        if (BUILTIN_THEMES[themeId]) {
            return null;
        }

        const themes = await scanThemeFolders();
        const theme = themes.get(themeId);
        
        if (!theme) {
            throw new Error(`Тема ${themeId} не найдена`);
        }

        // Если CSS файл не указан, возвращаем null
        if (!theme.files || !theme.files.css) {
            return null;
        }

        try {
            const cssResponse = await fetch(`${theme.path}${theme.files.css}`);
            if (!cssResponse.ok) {
                throw new Error(`Не удалось загрузить CSS для темы ${themeId}`);
            }
            
            const cssContent = await cssResponse.text();
            themesCache.set(themeId, cssContent);
            
            return cssContent;
            
        } catch (error) {
            log('error', `Ошибка загрузки темы ${themeId}:`, error);
            throw error;
        }
    }

    /**
     * Применение темы согласно официальной документации Bootstrap 5.3
     */
    async function applyTheme(themeId) {
        try {
            log('debug', `Применение темы: ${themeId}`);
            
            // Удаляем предыдущие внешние темы
            const existingTheme = document.getElementById('external-theme-css');
            if (existingTheme) {
                existingTheme.remove();
                log('debug', 'Удалена предыдущая внешняя тема');
            }

            // Для встроенных тем Bootstrap просто устанавливаем атрибут
            if (BUILTIN_THEMES[themeId]) {
                document.documentElement.setAttribute('data-bs-theme', themeId);
                log('debug', `Применена встроенная тема: ${themeId}`);
            } else {
                // Для внешних тем используем подход согласно документации Bootstrap
                // Загружаем CSS для внешней темы
                const cssContent = await loadThemeCSS(themeId);
                
                if (cssContent) {
                    // Создаем и добавляем стили БЕЗ модификации
                    // Bootstrap сам обеспечит правильную специфичность
                    const style = document.createElement('style');
                    style.id = 'external-theme-css';
                    style.textContent = cssContent;
                    
                    // Добавляем стили в head
                    document.head.appendChild(style);
                    log('debug', `CSS загружен для темы: ${themeId}`);
                }

                // Устанавливаем data-bs-theme атрибут с именем кастомной темы
                // Согласно документации Bootstrap 5.3
                document.documentElement.setAttribute('data-bs-theme', themeId);
                log('debug', `Установлен атрибут data-bs-theme: ${themeId}`);
            }
            
            // Сохраняем в localStorage
            localStorage.setItem('chatApp_theme', themeId);
            localStorage.setItem('chatApp_theme_type', BUILTIN_THEMES[themeId] ? 'builtin' : 'external');

            // Уведомляем через EventBus
            if (window.eventBus) {
                window.eventBus.emit('globalVars.bootstrapTheme.changed', themeId);
            }
            
            log('debug', `Тема ${themeId} успешно применена`);
            
        } catch (error) {
            log('error', 'Ошибка применения темы:', error);
            throw error;
        }
    }

    /**
     * Получение списка доступных тем
     */
    async function getAvailableThemes() {
        const themes = await scanThemeFolders();
        return Array.from(themes.values())
            .filter(theme => theme.enabled !== false) // Фильтруем отключенные темы
            .map(theme => ({
                id: theme.id,
                name: theme.name,
                description: theme.description,
                category: theme.category,
                preview_image: theme.preview_image ? `${theme.path || ''}${theme.preview_image}` : null,
                tags: theme.tags || [],
                license: theme.license,
                author: theme.author,
                version: theme.version,
                features: theme.features || [],
                enabled: theme.enabled !== false // Добавляем поле enabled в результат
            }));
    }

    /**
     * Получение информации о конкретной теме
     */
    async function getThemeInfo(themeId) {
        const themes = await scanThemeFolders();
        return themes.get(themeId) || null;
    }

    /**
     * Инициализация сканера тем
     */
    async function initialize() {
        try {
            // Сканируем темы при инициализации
            await scanThemeFolders();
            log('debug', 'Theme scanner initialized successfully');
            
            // Применяем сохраненную тему, если она не встроенная
            const savedTheme = localStorage.getItem('chatApp_theme');
            if (savedTheme && !BUILTIN_THEMES[savedTheme]) {
                log('debug', `Применяем сохраненную внешнюю тему: ${savedTheme}`);
                try {
                    await applyTheme(savedTheme);
                } catch (error) {
                    log('warn', `Не удалось применить сохраненную тему ${savedTheme}, переключаемся на темную:`, error);
                    await applyTheme('dark');
                }
            }
            
            // Уведомляем о готовности через EventBus
            if (window.eventBus) {
                window.eventBus.emit('module.theme-scanner.ready', {
                    timestamp: Date.now(),
                    moduleId: 'theme-scanner'
                });
            }
        } catch (error) {
            log('error', 'Error initializing theme scanner:', error);
        }
    }

    // Экспорт модуля
    window.themeScanner = {
        scanThemeFolders,
        loadThemeCSS,
        applyTheme,
        getAvailableThemes,
        getThemeInfo,
        initialize,
        BUILTIN_THEMES
    };

    // Автоматическая инициализация при загрузке
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})();