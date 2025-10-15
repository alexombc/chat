/**
 * Модуль умного превью файлов для чата
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

    // Конфигурация поддерживаемых типов файлов
    const FILE_TYPES = {
        image: {
            extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'],
            mimeTypes: ['image/'],
            icon: 'bi-image',
            color: '#28a745'
        },
        audio: {
            extensions: ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac'],
            mimeTypes: ['audio/'],
            icon: 'bi-music-note',
            color: '#17a2b8'
        },
        video: {
            extensions: ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'],
            mimeTypes: ['video/'],
            icon: 'bi-camera-video',
            color: '#dc3545'
        },
        document: {
            extensions: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'md', 'markdown', 'rst', 'tex', 'log'],
            mimeTypes: ['application/pdf', 'application/msword', 'text/'],
            icon: 'bi-file-text',
            color: '#fd7e14'
        },
        spreadsheet: {
            extensions: ['xls', 'xlsx', 'csv', 'ods'],
            mimeTypes: ['application/vnd.ms-excel', 'text/csv'],
            icon: 'bi-table',
            color: '#20c997'
        },
        archive: {
            extensions: ['zip', 'rar', '7z', 'tar', 'gz'],
            mimeTypes: ['application/zip', 'application/x-rar'],
            icon: 'bi-archive',
            color: '#6f42c1'
        },
        code: {
            extensions: ['js', 'html', 'css', 'py', 'java', 'cpp', 'c', 'php', 'rb', 'go', 'rs', 'ts', 'jsx', 'vue', 'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'config', 'sh', 'bash', 'bat', 'ps1', 'sql', 'r', 'scala', 'kt', 'swift', 'dart', 'lua', 'perl', 'pl', 'asm', 's', 'h', 'hpp', 'cs', 'vb', 'fs', 'clj', 'elm', 'ex', 'exs', 'erl', 'hrl', 'hs', 'lhs', 'ml', 'mli', 'nim', 'pas', 'pp', 'proto', 'pyx', 'rkt', 'scm', 'ss', 'tcl', 'vhdl', 'v', 'sv', 'svh', 'dockerfile', 'makefile', 'cmake', 'gradle', 'sbt', 'pom'],
            mimeTypes: ['text/javascript', 'text/html', 'text/css', 'application/json', 'application/xml', 'text/xml', 'application/yaml', 'text/yaml', 'application/toml', 'text/plain'],
            icon: 'bi-code-slash',
            color: '#6610f2'
        },
        config: {
            extensions: ['env', 'properties', 'gitignore', 'gitattributes', 'editorconfig', 'eslintrc', 'prettierrc', 'babelrc', 'npmrc', 'yarnrc', 'dockerignore', 'htaccess', 'robots', 'sitemap'],
            mimeTypes: ['text/plain'],
            icon: 'bi-gear',
            color: '#ffc107'
        },
        other: {
            extensions: [],
            mimeTypes: [],
            icon: 'bi-file-earmark',
            color: '#6c757d'
        }
    };

    // Максимальные размеры для превью
    const PREVIEW_LIMITS = {
        image: 5 * 1024 * 1024, // 5MB
        audio: 10 * 1024 * 1024, // 10MB
        video: 50 * 1024 * 1024, // 50MB
        text: 1 * 1024 * 1024 // 1MB для текстовых файлов
    };

    /**
     * Определение типа файла
     */
    function determineFileType(file) {
        const fileName = file.name.toLowerCase();
        const fileExtension = fileName.split('.').pop();
        const mimeType = file.type.toLowerCase();

        for (const [type, config] of Object.entries(FILE_TYPES)) {
            if (type === 'other') continue;
            
            // Проверка по расширению
            if (config.extensions.includes(fileExtension)) {
                return type;
            }
            
            // Проверка по MIME типу
            if (config.mimeTypes.some(mime => mimeType.startsWith(mime))) {
                return type;
            }
        }
        
        return 'other';
    }

    /**
     * Проверка, является ли файл текстовым
     */
    function isTextFile(file) {
        const fileName = file.name.toLowerCase();
        const fileExtension = fileName.split('.').pop();
        
        // Текстовые расширения
        const textExtensions = [
            // Документы и разметка
            'txt', 'md', 'markdown', 'rst', 'tex', 'log', 'readme',
            // Код
            'js', 'ts', 'jsx', 'tsx', 'html', 'htm', 'css', 'scss', 'sass', 'less',
            'py', 'pyw', 'java', 'cpp', 'cxx', 'cc', 'c', 'h', 'hpp', 'hxx',
            'php', 'rb', 'go', 'rs', 'cs', 'vb', 'fs', 'swift', 'kt', 'scala',
            'dart', 'lua', 'perl', 'pl', 'r', 'sql', 'sh', 'bash', 'zsh', 'fish',
            'bat', 'cmd', 'ps1', 'asm', 's', 'clj', 'elm', 'ex', 'exs', 'erl',
            'hrl', 'hs', 'lhs', 'ml', 'mli', 'nim', 'pas', 'pp', 'pyx', 'rkt',
            'scm', 'ss', 'tcl', 'vhdl', 'v', 'sv', 'svh', 'vue', 'svelte',
            // Конфигурационные файлы
            'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'config',
            'env', 'properties', 'gitignore', 'gitattributes', 'editorconfig',
            'eslintrc', 'prettierrc', 'babelrc', 'npmrc', 'yarnrc', 'dockerignore',
            'htaccess', 'robots', 'sitemap', 'dockerfile', 'makefile', 'cmake',
            'gradle', 'sbt', 'pom', 'lock', 'sum', 'mod'
        ];
        
        // Проверка по расширению
        if (textExtensions.includes(fileExtension)) {
            return true;
        }
        
        // Проверка по MIME типу
        if (file.type.startsWith('text/') ||
            file.type === 'application/json' ||
            file.type === 'application/xml' ||
            file.type === 'application/yaml' ||
            file.type === 'application/toml') {
            return true;
        }
        
        // Проверка файлов без расширения (часто конфигурационные)
        const noExtensionTextFiles = [
            'dockerfile', 'makefile', 'rakefile', 'gemfile', 'procfile',
            'vagrantfile', 'jenkinsfile', 'license', 'changelog', 'authors',
            'contributors', 'copying', 'install', 'news', 'todo', 'version'
        ];
        
        if (noExtensionTextFiles.includes(fileName)) {
            return true;
        }
        
        return false;
    }

    /**
     * Форматирование размера файла
     */
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Создание превью для изображений
     */
    function createImagePreview(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const img = document.createElement('img');
                img.src = e.target.result;
                img.style.maxWidth = '200px';
                img.style.maxHeight = '150px';
                img.style.objectFit = 'cover';
                img.style.borderRadius = '8px';
                img.className = 'border';
                
                resolve(img.outerHTML);
            };
            reader.readAsDataURL(file);
        });
    }

    /**
     * Создание превью для аудио
     */
    function createAudioPreview(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const audio = `
                    <audio controls style="width: 100%; max-width: 300px;">
                        <source src="${e.target.result}" type="${file.type}">
                        Ваш браузер не поддерживает аудио элемент.
                    </audio>
                `;
                resolve(audio);
            };
            reader.readAsDataURL(file);
        });
    }

    /**
     * Создание превью для видео
     */
    function createVideoPreview(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const video = `
                    <video controls style="width: 100%; max-width: 300px; max-height: 200px;">
                        <source src="${e.target.result}" type="${file.type}">
                        Ваш браузер не поддерживает видео элемент.
                    </video>
                `;
                resolve(video);
            };
            reader.readAsDataURL(file);
        });
    }

    /**
     * Создание превью для текстовых файлов
     */
    function createTextPreview(file) {
        return new Promise((resolve) => {
            if (file.size > PREVIEW_LIMITS.text) {
                resolve('<div class="text-muted">Файл слишком большой для превью</div>');
                return;
            }

            const reader = new FileReader();
            reader.onload = function(e) {
                const content = e.target.result;
                const preview = content.substring(0, 500);
                const truncated = content.length > 500 ? '...' : '';
                
                const textPreview = `
                    <div class="bg-body-tertiary p-2 rounded border" style="max-height: 150px; overflow-y: auto;">
                        <pre class="mb-0 text-body" style="white-space: pre-wrap; font-size: 0.8rem;">${preview}${truncated}</pre>
                    </div>
                `;
                resolve(textPreview);
            };
            reader.readAsText(file);
        });
    }

    /**
     * Создание базового превью с иконкой
     */
    function createBasicPreview(file, fileType) {
        const config = FILE_TYPES[fileType];
        return `
            <div class="d-flex align-items-center p-2 bg-body-secondary rounded border">
                <i class="${config.icon} fs-4 me-2" style="color: ${config.color};"></i>
                <div class="flex-grow-1 text-truncate">
                    <span class="fw-bold text-body me-2">${file.name}</span>
                    <span class="badge bg-secondary me-1">${fileType.toUpperCase()}</span>
                    <small class="text-muted">${formatFileSize(file.size)}</small>
                </div>
            </div>
        `;
    }

    /**
     * Главная функция создания превью
     */
    async function createFilePreview(file) {
        const fileType = determineFileType(file);
        const config = FILE_TYPES[fileType];
        
        let previewContent = '';
        
        try {
            switch (fileType) {
                case 'image':
                    if (file.size <= PREVIEW_LIMITS.image) {
                        previewContent = await createImagePreview(file);
                    } else {
                        previewContent = createBasicPreview(file, fileType);
                    }
                    break;
                    
                case 'audio':
                    if (file.size <= PREVIEW_LIMITS.audio) {
                        previewContent = await createAudioPreview(file);
                    } else {
                        previewContent = createBasicPreview(file, fileType);
                    }
                    break;
                    
                case 'video':
                    if (file.size <= PREVIEW_LIMITS.video) {
                        previewContent = await createVideoPreview(file);
                    } else {
                        previewContent = createBasicPreview(file, fileType);
                    }
                    break;
                    
                case 'document':
                case 'code':
                case 'config':
                    if (isTextFile(file)) {
                        previewContent = await createTextPreview(file);
                    } else {
                        previewContent = createBasicPreview(file, fileType);
                    }
                    break;
                    
                default:
                    previewContent = createBasicPreview(file, fileType);
            }
        } catch (error) {
            log('error', 'Ошибка создания превью:', error);
            // Отправляем нотификацию об ошибке
            if (window.eventBus) {
                window.eventBus.emit('notification.show.error', {
                    message: `Ошибка создания превью файла "${file.name}": ${error.message}`,
                    duration: 5000,
                    moduleId: 'file-preview'
                });
            }
            previewContent = createBasicPreview(file, fileType);
        }

        // Обертка для превью - компактная версия
        const fileTypeForDisplay = determineFileType(file);
        return `
            <div class="file-preview-container">
                <div class="d-flex align-items-center mb-2 p-2 bg-body-tertiary rounded border">
                    <i class="${config.icon} me-2" style="color: ${config.color};"></i>
                    <span class="fw-bold text-body me-2">${file.name}</span>
                    <span class="badge bg-secondary me-2">${fileTypeForDisplay.toUpperCase()}</span>
                    <small class="text-muted">${formatFileSize(file.size)}</small>
                </div>
                <div class="preview-content">
                    ${previewContent}
                </div>
            </div>
        `;
    }

    /**
     * Создание только содержимого превью без заголовка
     */
    async function createFilePreviewContent(file) {
        const fileType = determineFileType(file);
        
        try {
            switch (fileType) {
                case 'image':
                    if (file.size <= PREVIEW_LIMITS.image) {
                        return await createImagePreview(file);
                    } else {
                        return createBasicPreview(file, fileType);
                    }
                    
                case 'audio':
                    if (file.size <= PREVIEW_LIMITS.audio) {
                        return await createAudioPreview(file);
                    } else {
                        return createBasicPreview(file, fileType);
                    }
                    
                case 'video':
                    if (file.size <= PREVIEW_LIMITS.video) {
                        return await createVideoPreview(file);
                    } else {
                        return createBasicPreview(file, fileType);
                    }
                    
                case 'document':
                case 'code':
                case 'config':
                    if (isTextFile(file)) {
                        return await createTextPreview(file);
                    } else {
                        return createBasicPreview(file, fileType);
                    }
                    
                default:
                    return createBasicPreview(file, fileType);
            }
        } catch (error) {
            log('error', 'Ошибка создания превью:', error);
            // Отправляем нотификацию об ошибке
            if (window.eventBus) {
                window.eventBus.emit('notification.show.error', {
                    message: `Ошибка создания превью файла "${file.name}": ${error.message}`,
                    duration: 5000,
                    moduleId: 'file-preview'
                });
            }
            return createBasicPreview(file, fileType);
        }
    }

    /**
     * Обновление UI с превью файла
     */
    function updateFilePreviewUI(file) {
        createFilePreview(file).then(previewHTML => {
            const attachedFileInfo = document.getElementById('attachedFileInfo');
            if (attachedFileInfo) {
                attachedFileInfo.innerHTML = `
                    <div class="alert alert-info">
                        ${previewHTML}
                        <div class="d-flex justify-content-end mt-2">
                            <button type="button" class="btn btn-sm btn-outline-danger" id="removeFileBtn">
                                <i class="bi bi-x"></i> Удалить
                            </button>
                        </div>
                    </div>
                `;
                attachedFileInfo.classList.remove('d-none');
                
                // Переподключаем обработчик удаления файла
                const removeBtn = document.getElementById('removeFileBtn');
                if (removeBtn && window.chatModule && window.chatModule.removeAttachedFile) {
                    removeBtn.addEventListener('click', window.chatModule.removeAttachedFile);
                }
            }
        });
    }

    /**
     * Экспорт функций для использования в основном модуле
     */
    window.filePreview = {
        createFilePreview,
        createFilePreviewContent,
        updateFilePreviewUI,
        determineFileType,
        formatFileSize,
        isTextFile,
        FILE_TYPES
    };

    log('debug', 'File Preview module loaded');

})();