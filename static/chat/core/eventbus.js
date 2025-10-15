/**
 * EventBus с поддержкой буферизации и TTL
 * Реализация согласно стандарту EventBus
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

    class EventBus {
        constructor() {
            this.listeners = new Map();
            this.buffers = new Map();
            this.bufferConfigs = new Map();
        }

        /**
         * Подписка на событие
         * @param {string} eventName - Имя события
         * @param {function} handler - Обработчик события
         */
        on(eventName, handler) {
            if (!this.listeners.has(eventName)) {
                this.listeners.set(eventName, new Set());
            }
            this.listeners.get(eventName).add(handler);
        }

        /**
         * Отписка от события
         * @param {string} eventName - Имя события
         * @param {function} handler - Обработчик события
         */
        off(eventName, handler) {
            if (this.listeners.has(eventName)) {
                this.listeners.get(eventName).delete(handler);
                if (this.listeners.get(eventName).size === 0) {
                    this.listeners.delete(eventName);
                }
            }
        }

        /**
         * Отправка события
         * @param {string} eventName - Имя события
         * @param {*} data - Данные события
         */
        emit(eventName, data = null) {
            const timestamp = Date.now();
            
            // Буферизация события если настроена
            this._bufferEvent(eventName, data, timestamp);
            
            // Отправка подписчикам
            this._notifyListeners(eventName, data, { timestamp, fromBuffer: false });
        }

        /**
         * Подписка с получением истории из буфера
         * @param {string} eventName - Имя события
         * @param {function} handler - Обработчик события
         * @param {object} options - Опции подписки
         */
        onWithHistory(eventName, handler, options = {}) {
            // Сначала подписываемся на новые события
            this.on(eventName, handler);
            
            // Затем отправляем буферизованные события если нужно
            if (options.includeHistory !== false) {
                const bufferedEvents = this.getBufferedEvents(eventName, options.historyOptions);
                bufferedEvents.forEach(event => {
                    const meta = {
                        timestamp: event.timestamp,
                        fromBuffer: true,
                        age: Date.now() - event.timestamp
                    };
                    handler(event.data, meta);
                });
            }
        }

        /**
         * Настройка буферизации для события
         * @param {string} eventPattern - Паттерн события (поддерживает *)
         * @param {object} config - Конфигурация буфера
         */
        configureBuffer(eventPattern, config) {
            const defaultConfig = {
                ttl: 30000,      // 30 секунд по умолчанию
                maxSize: 100,    // 100 событий по умолчанию
                strategy: 'fifo' // FIFO по умолчанию
            };
            
            this.bufferConfigs.set(eventPattern, { ...defaultConfig, ...config });
        }

        /**
         * Получение буферизованных событий
         * @param {string} eventName - Имя события
         * @param {object} options - Опции фильтрации
         */
        getBufferedEvents(eventName, options = {}) {
            const now = Date.now();
            const since = options.since || 0;
            const limit = options.limit || Infinity;
            
            const results = [];
            
            for (const [pattern, buffer] of this.buffers) {
                if (this._matchesPattern(eventName, pattern)) {
                    const events = buffer.filter(event => 
                        event.timestamp >= since && 
                        (now - event.timestamp) <= this._getConfigForEvent(eventName).ttl
                    );
                    
                    results.push(...events);
                }
            }
            
            // Сортировка по времени и ограничение
            return results
                .sort((a, b) => a.timestamp - b.timestamp)
                .slice(0, limit);
        }

        /**
         * Очистка буфера
         * @param {string} eventName - Имя события
         */
        clearBuffer(eventName) {
            for (const [pattern] of this.buffers) {
                if (this._matchesPattern(eventName, pattern)) {
                    this.buffers.set(pattern, []);
                }
            }
        }

        /**
         * Отключение буферизации
         * @param {string} eventName - Имя события
         */
        disableBuffer(eventName) {
            for (const [pattern] of this.bufferConfigs) {
                if (this._matchesPattern(eventName, pattern)) {
                    this.bufferConfigs.delete(pattern);
                    this.buffers.delete(pattern);
                }
            }
        }

        /**
         * Получение статистики буфера
         * @param {string} eventPattern - Паттерн события
         */
        getBufferStats(eventPattern) {
            const config = this.bufferConfigs.get(eventPattern);
            const buffer = this.buffers.get(eventPattern) || [];
            
            if (!config) return null;
            
            const now = Date.now();
            const validEvents = buffer.filter(event => 
                (now - event.timestamp) <= config.ttl
            );
            
            return {
                eventName: eventPattern,
                enabled: true,
                ttl: config.ttl,
                maxSize: config.maxSize,
                strategy: config.strategy,
                currentSize: validEvents.length,
                oldestEvent: validEvents.length > 0 ? Math.min(...validEvents.map(e => e.timestamp)) : null,
                newestEvent: validEvents.length > 0 ? Math.max(...validEvents.map(e => e.timestamp)) : null
            };
        }

        /**
         * Получение всех конфигураций буферов
         */
        getAllBufferConfigs() {
            return Object.fromEntries(this.bufferConfigs);
        }

        /**
         * Получение статистики всех буферов
         */
        getAllBufferStats() {
            const stats = {};
            for (const pattern of this.bufferConfigs.keys()) {
                stats[pattern] = this.getBufferStats(pattern);
            }
            return stats;
        }

        // Приватные методы

        _bufferEvent(eventName, data, timestamp) {
            for (const [pattern, config] of this.bufferConfigs) {
                if (this._matchesPattern(eventName, pattern)) {
                    if (!this.buffers.has(pattern)) {
                        this.buffers.set(pattern, []);
                    }
                    
                    const buffer = this.buffers.get(pattern);
                    const event = { eventName, data, timestamp };
                    
                    // Добавление события в буфер
                    if (config.strategy === 'lifo') {
                        buffer.unshift(event);
                    } else {
                        buffer.push(event);
                    }
                    
                    // Очистка устаревших событий
                    this._cleanExpiredEvents(pattern, config.ttl);
                    
                    // Ограничение размера буфера
                    if (buffer.length > config.maxSize) {
                        if (config.strategy === 'lifo') {
                            buffer.splice(config.maxSize);
                        } else {
                            buffer.splice(0, buffer.length - config.maxSize);
                        }
                    }
                }
            }
        }

        _notifyListeners(eventName, data, meta) {
            // Точное совпадение
            if (this.listeners.has(eventName)) {
                this.listeners.get(eventName).forEach(handler => {
                    try {
                        handler(data, meta);
                    } catch (error) {
                        log('error', `Error in event handler for ${eventName}:`, error);
                        // Отправляем нотификацию об ошибке
                        this.emit('notification.show.error', {
                            message: `Ошибка в обработчике события ${eventName}: ${error.message}`,
                            duration: 7000,
                            moduleId: 'eventbus'
                        });
                    }
                });
            }
            
            // Паттерны с *
            for (const [pattern, handlers] of this.listeners) {
                if (pattern !== eventName && this._matchesPattern(eventName, pattern)) {
                    handlers.forEach(handler => {
                        try {
                            handler(data, meta);
                        } catch (error) {
                            log('error', `Error in pattern handler for ${pattern}:`, error);
                            // Отправляем нотификацию об ошибке
                            this.emit('notification.show.error', {
                                message: `Ошибка в обработчике паттерна ${pattern}: ${error.message}`,
                                duration: 7000,
                                moduleId: 'eventbus'
                            });
                        }
                    });
                }
            }
        }

        _matchesPattern(eventName, pattern) {
            if (pattern === eventName) return true;
            if (!pattern.includes('*')) return false;
            
            const regex = new RegExp('^' + pattern.replace(/\*/g, '[^.]*') + '$');
            return regex.test(eventName);
        }

        _getConfigForEvent(eventName) {
            for (const [pattern, config] of this.bufferConfigs) {
                if (this._matchesPattern(eventName, pattern)) {
                    return config;
                }
            }
            return { ttl: 30000, maxSize: 100, strategy: 'fifo' };
        }

        _cleanExpiredEvents(pattern, ttl) {
            const buffer = this.buffers.get(pattern);
            if (!buffer) return;
            
            const now = Date.now();
            const validEvents = buffer.filter(event => (now - event.timestamp) <= ttl);
            this.buffers.set(pattern, validEvents);
        }
    }

    // Создание глобального экземпляра EventBus
    window.eventBus = new EventBus();

    // Настройка стандартных буферов согласно документации
    window.eventBus.configureBuffer('module.*.ready', {
        ttl: 60000,      // 1 минута
        maxSize: 100,
        strategy: 'fifo'
    });

    window.eventBus.configureBuffer('*.config.loaded', {
        ttl: 30000,      // 30 секунд
        maxSize: 50,
        strategy: 'fifo'
    });

    window.eventBus.configureBuffer('user.action.*', {
        ttl: 300000,     // 5 минут
        maxSize: 500,
        strategy: 'fifo'
    });

    log('debug', 'EventBus initialized');
})();