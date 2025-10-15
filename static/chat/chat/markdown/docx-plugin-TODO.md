# DOCX Plugin - Проблемы и TODO

## Проблема: Автоинициализация Pyodide при использовании только DOCX плагина

### Описание проблемы
При запуске только DOCX плагина (`docx-plugin.js`) начинают автоматически загружаться библиотеки Pyodide (certifi, charset_normalizer, idna, urllib3, requests, numpy, pandas, matplotlib), хотя для DOCX плагина нужны только библиотеки для работы с DOCX документами (pizzip, docxtemplater, mammoth, filesaver).

### Причина проблемы
1. В HTML файле `static/chat/chat.html` загружаются оба плагина одновременно:
   - `pyodide-plugin.js` (строка 243)
   - `docx-plugin.js` (строка 244)

2. Pyodide плагин автоматически инициализируется при загрузке DOM и вызывает функцию `renderEditors()`, которая в свою очередь вызывает `initializePyodide()` даже если на странице нет Python блоков кода.

3. Логика в `pyodide-plugin.js` (строки 2012-2017):
   ```javascript
   function renderEditors() {
       if (!pluginState.pyodideReady) {
           // Если Pyodide не готов, запускаем инициализацию только один раз
           if (!pluginState.loadingPromise) {
               initializePyodide(); // ← Вызывается ДО проверки наличия Python блоков
           }
           return;
       }
       // Проверка Python блоков происходит только ПОСЛЕ инициализации
   ```

### Предлагаемые пути решения

#### Вариант 1: Изменение логики в pyodide-plugin.js (НЕ рекомендуется)
Изменить порядок проверок в функции `renderEditors()` - сначала проверять наличие Python блоков, потом инициализировать Pyodide.

**Минусы:** Требует изменения pyodide-plugin.js, что может повлиять на другие части системы.

#### Вариант 2: Блокировка автоинициализации из docx-plugin.js
Добавить в `docx-plugin.js` код, который будет переопределять функции pyodide плагина, если на странице есть только DOCX блоки.

**Реализация:**
```javascript
function preventPyodideAutoInitialization() {
    const pythonBlocks = document.querySelectorAll('pre code.language-python, pre code[class*="language-python"]');
    const docxBlocks = document.querySelectorAll('pre code.language-docx, pre code[class*="language-docx"]');
    
    if (docxBlocks.length > 0 && pythonBlocks.length === 0) {
        // Переопределить window.pyodidePlugin.renderEditors и window.pyodidePlugin.initialize
        // чтобы они не инициализировали Pyodide при отсутствии Python блоков
    }
}
```

#### Вариант 3: Условная загрузка плагинов в HTML (Рекомендуется)
Изменить `static/chat/chat.html` для условной загрузки плагинов в зависимости от содержимого страницы.

#### Вариант 4: Ленивая инициализация
Добавить в оба плагина проверку содержимого страницы перед инициализацией тяжелых библиотек.

### Текущий статус
- ✅ Исправлены названия переменных состояния в docx-plugin.js (pyodideReady → docxReady)
- ✅ Обновлены ссылки на состояние плагина
- ⏸️ Блокировка автоинициализации Pyodide отложена
- ⏳ Требуется исправление отслеживания пакетов

### Следующие шаги
1. Завершить исправление отслеживания пакетов в docx-plugin.js
2. Протестировать работу DOCX плагина
3. Выбрать и реализовать один из вариантов решения проблемы автоинициализации Pyodide

### Лог ошибки
```
pyodide.asm.js:8 Loading certifi
pyodide.asm.js:8 Loaded certifi
pyodide.asm.js:8 Loading charset_normalizer
docx-plugin.js:427 [docx-plugin] Загрузка DOCX шаблона с URL: http://localhost:3021/static/template/docx/test-new.docx
pyodide.asm.js:8 Loaded charset_normalizer
pyodide.asm.js:8 Loading idna
docx-plugin.js:443 [docx-plugin] DOCX шаблон успешно загружен и сохранен: http://localhost:3021/static/template/docx/test-new.docx (16 KB)
pyodide.asm.js:8 Loaded idna
pyodide.asm.js:8 Loading urllib3
pyodide.asm.js:8 Loaded urllib3
pyodide.asm.js:8 Loading requests
pyodide.asm.js:8 Loading numpy
pyodide.asm.js:8 Loaded numpy
pyodide.asm.js:8 numpy already loaded from default channel
pyodide.asm.js:8 Loading pandas, python-dateutil, pytz, six