/**
 * Модуль чатов сайдбара (IIFE) с функциональностью управления чатами
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

    // Состояние модуля
    const chatsState = {
        initialized: false,
        chats: [],
        currentChatId: null,
        isActive: false
    };

    // Инициализация при загрузке DOM
    document.addEventListener('DOMContentLoaded', function() {
        setupEventBusListeners();
        
        // Уведомляем о готовности модуля
        window.eventBus.emit('module.sidebar-chats.ready', {
            timestamp: Date.now(),
            moduleId: 'sidebar-chats'
        });
        
        // Проверяем, нужно ли инициализировать модуль сразу
        // (если координатор еще не готов)
        setTimeout(() => {
            if (!chatsState.initialized && !chatsState.isActive) {
                // Если координатор не загрузил модуль, загружаем сами
                const sidebarBody = document.getElementById('sidebar-body');
                if (sidebarBody && sidebarBody.innerHTML.trim() === '') {
                    initializeChats();
                }
            }
        }, 100);
    });

    /**
     * Инициализация модуля чатов
     */
    function initializeChats() {
        const sidebarBody = document.getElementById('sidebar-body');
        if (!sidebarBody) {
            log('error', 'Контейнер sidebar-body не найден');
            return;
        }

        // Создаем HTML структуру модуля чатов
        sidebarBody.innerHTML = `
            <!-- Заголовок и кнопка нового чата -->
            <div class="p-3 border-bottom">
                <div class="d-flex justify-content-between align-items-center">
                    <h5 class="mb-0"></h5>
                    <button id="newChatBtn" class="btn btn-primary btn-sm">
                        <i class="bi bi-plus"></i> Новый чат
                    </button>
                </div>
            </div>
            
            <!-- Список чатов -->
            <div class="flex-grow-1 overflow-auto">
                <div id="chatsList" class="list-group list-group-flush">
                    <!-- Чаты будут добавляться динамически -->
                </div>
            </div>
        `;

        setupEventListeners();
        loadChatsFromStorage();
        renderChatsList();
        chatsState.initialized = true;
        chatsState.isActive = true;
        
        log('debug', 'Chats module initialized');
    }

    /**
     * Настройка обработчиков событий DOM
     */
    function setupEventListeners() {
        // Кнопка нового чата
        const newChatBtn = document.getElementById('newChatBtn');
        if (newChatBtn) {
            newChatBtn.addEventListener('click', createNewChat);
        }
    }

    /**
     * Настройка слушателей EventBus
     */
    function setupEventBusListeners() {
        // Слушаем команду загрузки модуля чатов
        window.eventBus.on('sidebar.module.load', (data) => {
            if (data.module === 'chats') {
                initializeChats();
            } else if (chatsState.isActive) {
                chatsState.isActive = false;
            }
        });

        // Слушаем события от главного модуля
        window.eventBus.on('user.action.newChat', (data) => {
            if (data.chatId && data.chatName) {
                addChatToList(data.chatId, data.chatName);
            }
        });

        window.eventBus.on('user.action.switchChat', (data) => {
            if (data.chatId) {
                setCurrentChat(data.chatId);
            }
        });

        // Слушаем команды создания нового чата
        window.eventBus.on('chats.create.new', () => {
            createNewChat();
        });

        // Слушаем команды удаления чата
        window.eventBus.on('chats.delete', (data) => {
            if (data.chatId) {
                deleteChat(data.chatId);
            }
        });

        // Слушаем команды переключения чата
        window.eventBus.on('chats.switch', (data) => {
            if (data.chatId) {
                switchToChat(data.chatId);
            }
        });
    }

    /**
     * Загрузка чатов из localStorage
     */
    function loadChatsFromStorage() {
        try {
            const savedChats = localStorage.getItem('chatApp_chats');
            if (savedChats) {
                chatsState.chats = JSON.parse(savedChats);
            }
            
            const savedCurrentChatId = localStorage.getItem('chatApp_currentChatId');
            if (savedCurrentChatId) {
                chatsState.currentChatId = savedCurrentChatId;
            }
        } catch (error) {
            log('error', 'Error loading chats from storage:', error);
            chatsState.chats = [];
        }
    }

    /**
     * Сохранение чатов в localStorage
     */
    function saveChatsToStorage() {
        try {
            localStorage.setItem('chatApp_chats', JSON.stringify(chatsState.chats));
            if (chatsState.currentChatId) {
                localStorage.setItem('chatApp_currentChatId', chatsState.currentChatId);
            }
        } catch (error) {
            log('error', 'Error saving chats to storage:', error);
        }
    }

    /**
     * Создание нового чата
     */
    function createNewChat() {
        const chatId = 'chat_' + Date.now();
        const chatName = `Чат ${chatsState.chats.length + 1}`;
        
        const newChat = {
            id: chatId,
            name: chatName,
            messages: [],
            createdAt: Date.now()
        };
        
        chatsState.chats.push(newChat);
        chatsState.currentChatId = chatId;
        
        saveChatsToStorage();
        renderChatsList();
        
        // Уведомляем модуль чата о новом чате
        window.eventBus.emit('user.action.newChat', {
            chatId: chatId,
            chatName: chatName
        });
        
        log('debug', 'New chat created:', chatId);
    }

    /**
     * Переключение на другой чат
     */
    function switchToChat(chatId) {
        if (chatsState.currentChatId === chatId) return;
        
        chatsState.currentChatId = chatId;
        saveChatsToStorage();
        renderChatsList();
        
        const chat = chatsState.chats.find(c => c.id === chatId);
        if (chat) {
            window.eventBus.emit('user.action.switchChat', {
                chatId: chatId,
                chatName: chat.name,
                messages: chat.messages
            });
        }
        
        log('debug', 'Switched to chat:', chatId);
    }

    /**
     * Отрисовка списка чатов
     */
    function renderChatsList() {
        const chatsList = document.getElementById('chatsList');
        if (!chatsList) return;
        
        chatsList.innerHTML = '';
        
        chatsState.chats.forEach(chat => {
            const chatItem = document.createElement('div');
            chatItem.className = `list-group-item list-group-item-action ${
                chat.id === chatsState.currentChatId ? 'active' : ''
            }`;
            chatItem.style.cursor = 'pointer';
            
            chatItem.innerHTML = `
                <div class="d-flex justify-content-between align-items-center">
                    <div class="flex-grow-1">
                        <h6 class="mb-1">${chat.name}</h6>
                        <small class="text-muted">${formatDate(chat.createdAt)}</small>
                    </div>
                    <button class="btn btn-sm btn-outline-danger delete-chat-btn" data-chat-id="${chat.id}">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            `;
            
            // Обработчик клика по чату
            chatItem.addEventListener('click', (e) => {
                if (!e.target.closest('.delete-chat-btn')) {
                    switchToChat(chat.id);
                }
            });
            
            // Обработчик удаления чата
            const deleteBtn = chatItem.querySelector('.delete-chat-btn');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteChat(chat.id);
            });
            
            chatsList.appendChild(chatItem);
        });
    }

    /**
     * Удаление чата
     */
    function deleteChat(chatId) {
        if (chatsState.chats.length <= 1) {
            window.eventBus.emit('notification.show.warning', {
                message: 'Нельзя удалить последний чат',
                duration: 3000,
                moduleId: 'sidebar-chats'
            });
            return;
        }
        
        chatsState.chats = chatsState.chats.filter(c => c.id !== chatId);
        
        if (chatsState.currentChatId === chatId) {
            chatsState.currentChatId = chatsState.chats[0].id;
            switchToChat(chatsState.currentChatId);
        }
        
        saveChatsToStorage();
        renderChatsList();
        
        window.eventBus.emit('notification.show.success', {
            message: 'Чат удален',
            duration: 3000,
            moduleId: 'sidebar-chats'
        });
        
        log('debug', 'Chat deleted:', chatId);
    }

    /**
     * Добавление чата в список (для синхронизации с главным модулем)
     */
    function addChatToList(chatId, chatName) {
        const existingChat = chatsState.chats.find(c => c.id === chatId);
        if (!existingChat) {
            const newChat = {
                id: chatId,
                name: chatName,
                messages: [],
                createdAt: Date.now()
            };
            chatsState.chats.push(newChat);
            saveChatsToStorage();
            renderChatsList();
        }
    }

    /**
     * Установка текущего чата
     */
    function setCurrentChat(chatId) {
        chatsState.currentChatId = chatId;
        saveChatsToStorage();
        renderChatsList();
    }

    /**
     * Форматирование даты
     */
    function formatDate(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'только что';
        if (diffMins < 60) return `${diffMins} мин назад`;
        if (diffHours < 24) return `${diffHours} ч назад`;
        if (diffDays < 7) return `${diffDays} дн назад`;
        
        return date.toLocaleDateString('ru-RU');
    }

    /**
     * Обновление сообщений чата
     */
    function updateChatMessages(chatId, messages) {
        const chat = chatsState.chats.find(c => c.id === chatId);
        if (chat) {
            chat.messages = messages;
            saveChatsToStorage();
            log('debug', `Chat messages updated for: ${chatId}`);
        }
    }

    // Экспорт функций для использования в других модулях
    window.sidebarChatsModule = {
        createNewChat: createNewChat,
        switchToChat: switchToChat,
        deleteChat: deleteChat,
        updateChatMessages: updateChatMessages,
        getCurrentChat: () => chatsState.chats.find(c => c.id === chatsState.currentChatId),
        getAllChats: () => [...chatsState.chats],
        getCurrentChatId: () => chatsState.currentChatId,
        isInitialized: () => chatsState.initialized,
        isActive: () => chatsState.isActive
    };

})();