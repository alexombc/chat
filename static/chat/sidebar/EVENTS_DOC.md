# Документация событий EventBus для модульной архитектуры сайдбара

## Обзор

Модульная архитектура сайдбара использует EventBus для взаимодействия между компонентами. Все события следуют стандарту именования `<scope>.<entity>.<action>`.

## События готовности модулей

### `module.<module-name>.ready`
Отправляется каждым модулем при завершении инициализации.

**Модули:**
- `module.sidebar-header.ready` - заголовок сайдбара готов
- `module.sidebar-footer.ready` - подвал сайдбара готов  
- `module.sidebar-breadcrumbs.ready` - хлебные крошки готовы
- `module.sidebar-chats.ready` - модуль чатов готов
- `module.sidebar-context.ready` - модуль контекста готов
- `module.sidebar-resize.ready` - модуль изменения размера готов
- `module.sidebar-coordinator.ready` - координатор готов

**Структура данных:**
```javascript
{
    timestamp: Date.now(),
    moduleId: 'module-name'
}
```

## События управления сайдбаром

### `sidebar.ready`
Отправляется координатором когда все модули готовы.

**Структура данных:**
```javascript
{
    timestamp: Date.now(),
    readyModules: ['sidebar-header', 'sidebar-footer', ...]
}
```

### `sidebar.module.load`
Команда загрузки модуля в sidebar-body.

**Структура данных:**
```javascript
{
    module: 'chats' | 'context',
    timestamp: Date.now()
}
```

## События навигации

### `sidebar.tab.<tab-name>.activate`
Команды активации закладок.

**События:**
- `sidebar.tab.chats.activate` - активировать закладку "Чаты"
- `sidebar.tab.context.activate` - активировать закладку "Контекст"

### `sidebar.tab.update`
Обновление активной закладки.

**Структура данных:**
```javascript
{
    tab: 'chats' | 'context'
}
```

## События хлебных крошек

### `sidebar.breadcrumbs.update`
Обновление хлебных крошек.

**Структура данных:**
```javascript
{
    breadcrumbs: [
        {
            text: 'Главная',
            icon: 'bi-house',
            action: 'sidebar.tab.chats.activate', // опционально
            data: {} // опционально
        }
    ]
}
```

### `sidebar.breadcrumbs.show`
Показать хлебные крошки с данными.

### `sidebar.breadcrumbs.hide`
Скрыть хлебные крошки.

### `sidebar.breadcrumbs.clear`
Очистить хлебные крошки.

### `sidebar.breadcrumbs.click`
Клик по хлебной крошке.

**Структура данных:**
```javascript
{
    index: 0,
    crumb: {
        text: 'Главная',
        icon: 'bi-house',
        action: 'sidebar.tab.chats.activate'
    },
    timestamp: Date.now()
}
```

## События изменения размера

### `sidebar.resize.start`
Начало изменения размера.

**Структура данных:**
```javascript
{
    startWidth: 300,
    timestamp: Date.now()
}
```

### `sidebar.resize.update`
Обновление размера в процессе.

**Структура данных:**
```javascript
{
    width: 350,
    widthPercent: 30,
    timestamp: Date.now()
}
```

### `sidebar.resize.end`
Завершение изменения размера.

**Структура данных:**
```javascript
{
    finalWidth: 350,
    finalWidthPercent: 30,
    timestamp: Date.now()
}
```

### `sidebar.resize.set`
Команда установки ширины сайдбара.

**Структура данных:**
```javascript
{
    width: 25 // в процентах
}
```

### `sidebar.resize.reset`
Команда сброса ширины к значению по умолчанию.

### `sidebar.resize.notify`
Уведомление модулей об изменении размера.

## События настроек UI

### `ui.settings.load`
Загрузка настроек UI.

### `ui.settings.save`
Сохранение настроек UI.

### `ui.settings.update`
Обновление настроек UI.

**Структура данных:**
```javascript
{
    settings: {
        sidebarWidth: 25,
        // другие настройки UI
    },
    timestamp: Date.now()
}
```

## События управления чатами

### `chats.create.new`
Команда создания нового чата.

### `chats.delete`
Команда удаления чата.

**Структура данных:**
```javascript
{
    chatId: 'chat_1234567890'
}
```

### `chats.switch`
Команда переключения чата.

**Структура данных:**
```javascript
{
    chatId: 'chat_1234567890'
}
```

## События контекста

### `context.load.file`
Загрузка файла в контекст (заглушка).

**Структура данных:**
```javascript
{
    file: File
}
```

### `context.clear`
Очистка контекста (заглушка).

## События нотификаций

### `notification.show.<type>`
Показ нотификаций разных типов.

**Типы:**
- `notification.show.success` - успешные операции
- `notification.show.error` - ошибки  
- `notification.show.warning` - предупреждения
- `notification.show.info` - информационные сообщения

**Структура данных:**
```javascript
{
    message: "Текст уведомления",
    duration: 5000, // миллисекунды
    moduleId: "sidebar-module-name"
}
```

## События глобальных переменных

### `globalVars.bootstrapTheme.changed`
Изменение темы Bootstrap.

**Данные:** `'dark' | 'light'`

## Примеры использования

### Активация закладки "Контекст"
```javascript
window.eventBus.emit('sidebar.tab.context.activate');
```

### Обновление хлебных крошек
```javascript
window.eventBus.emit('sidebar.breadcrumbs.show', {
    breadcrumbs: [
        { text: 'Главная', icon: 'bi-house', action: 'sidebar.tab.chats.activate' },
        { text: 'Настройки', icon: 'bi-gear' }
    ]
});
```

### Показ нотификации
```javascript
window.eventBus.emit('notification.show.success', {
    message: 'Операция выполнена успешно!',
    duration: 3000,
    moduleId: 'my-module'
});
```

### Установка ширины сайдбара
```javascript
window.eventBus.emit('sidebar.resize.set', {
    width: 30 // 30%
});
```

## Архитектурные принципы

1. **Слабая связанность** - модули взаимодействуют только через EventBus
2. **Единый стандарт** - все события следуют стандарту именования
3. **Типизированные данные** - каждое событие имеет четкую структуру данных
4. **Логирование** - все модули логируют свои действия
5. **Обработка ошибок** - модули корректно обрабатывают ошибки и отправляют нотификации

## Отладка

Для отладки событий можно использовать:

```javascript
// Логирование всех событий
window.eventBus.on('*', (eventName, data) => {
    console.log(`Event: ${eventName}`, data);
});

// Получение статуса координатора
console.log(window.sidebarCoordinatorModule.getStatus());

// Получение списка готовых модулей
console.log(window.sidebarCoordinatorModule.getReadyModules());
```

## Диаграмма последовательности инициализации модулей

```mermaid
sequenceDiagram
    participant DOM as DOM
    participant Coordinator as sidebar-coordinator
    participant Header as sidebar-header
    participant Footer as sidebar-footer
    participant Breadcrumbs as sidebar-breadcrumbs
    participant Chats as sidebar-chats
    participant Context as sidebar-context
    participant Resize as sidebar-resize
    participant EventBus as EventBus

    Note over DOM: DOMContentLoaded событие

    DOM->>Coordinator: DOMContentLoaded
    DOM->>Header: DOMContentLoaded
    DOM->>Footer: DOMContentLoaded
    DOM->>Breadcrumbs: DOMContentLoaded
    DOM->>Chats: DOMContentLoaded
    DOM->>Context: DOMContentLoaded
    DOM->>Resize: DOMContentLoaded

    Note over Coordinator,Resize: Каждый модуль инициализируется

    Header->>EventBus: module.sidebar-header.ready
    Footer->>EventBus: module.sidebar-footer.ready
    Breadcrumbs->>EventBus: module.sidebar-breadcrumbs.ready
    Chats->>EventBus: module.sidebar-chats.ready
    Context->>EventBus: module.sidebar-context.ready
    Resize->>EventBus: module.sidebar-resize.ready
    Coordinator->>EventBus: module.sidebar-coordinator.ready

    Note over EventBus: Координатор слушает все события готовности

    EventBus->>Coordinator: module.*.ready (все модули)
    
    Note over Coordinator: Проверяет готовность всех модулей

    Coordinator->>Coordinator: checkModulesReady()
    Coordinator->>Coordinator: initializeSidebar()

    Note over Coordinator: Активирует закладку "Чаты" по умолчанию

    Coordinator->>EventBus: sidebar.tab.chats.activate
    EventBus->>Header: sidebar.tab.chats.activate
    Header->>Header: activateTab('chats')
    Header->>EventBus: sidebar.module.load {module: 'chats'}
    EventBus->>Chats: sidebar.module.load
    Chats->>Chats: initializeChats()

    Note over Coordinator: Отправляет события готовности

    Coordinator->>EventBus: sidebar.ready
    Coordinator->>EventBus: notification.show.success

    Note over Coordinator,Chats: Сайдбар полностью инициализирован с открытой закладкой "Чаты"