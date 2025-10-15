
import matplotlib.pyplot as plt
import numpy as np

# График 2. Качество по категориям
categories = [
    "Планирование", "Анализ", "Проектирование", "Инфраструктура", "Разработка", 
    "Интеграция", "Исправления", "Тестирование", "Документация", "Обучение", "Внедрение"
]
means = [95, 88, 92, 90, 90.2, 85, 88, 89.5, 92, 94, 88]  # вручную/средние

colors = []
for score in means:
    if score >= 90:
        colors.append("#4CAF50")
    elif score >= 80:
        colors.append("#FFA500")
    else:
        colors.append("#F44336")

plt.figure(figsize=(8,4))
plt.bar(categories, means, color=colors)
plt.title("Среднее качество по категориям проекта")
plt.ylabel("Качество")
plt.ylim(80, 100)
plt.xticks(rotation=30)
plt.grid(axis='y', alpha=0.3)
plt.tight_layout()
plt.show()

#%copy_console="Проанализируй данные ниже и сделай краткие выводы"
# #%send_console="Проанализируй данные ниже и сделай краткие выводы"
# Вывод данных в консоль для анализа
print("=== ДАННЫЕ ДЛЯ АНАЛИЗА ГРАФИКА ===")
print("Передаются данные о качестве работ по категориям проекта для подготовки аналитических выводов:")
print()

for i, (category, score) in enumerate(zip(categories, means)):
    status = "🟢 Отлично" if score >= 90 else "🟡 Хорошо" if score >= 80 else "🔴 Требует внимания"
    print(f"{i+1:2d}. {category:<15}: {score:5.1f} - {status}")

print()
print(f"Общая статистика:")
print(f"- Средний балл: {np.mean(means):.1f}")
print(f"- Максимум: {max(means):.1f} ({categories[means.index(max(means))]})")
print(f"- Минимум: {min(means):.1f} ({categories[means.index(min(means))]})")
print(f"- Категорий с оценкой ≥90: {sum(1 for x in means if x >= 90)}")
print(f"- Категорий требующих внимания (<80): {sum(1 for x in means if x < 80)}")