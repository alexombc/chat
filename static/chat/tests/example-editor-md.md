<!-- Скрытый раздел, игнорируются markdown при рендеринге -->
<!-- title: Моя закладка -->

# Editor.md

![](https://pandao.github.io/editor.md/images/logos/editormd-logo-180x180.png)

![](https://img.shields.io/github/stars/pandao/editor.md.svg) ![](https://img.shields.io/github/forks/pandao/editor.md.svg) ![](https://img.shields.io/github/tag/pandao/editor.md.svg) ![](https://img.shields.io/github/release/pandao/editor.md.svg) ![](https://img.shields.io/github/issues/pandao/editor.md.svg) ![](https://img.shields.io/bower/v/editor.md.svg)

**Оглавление (Table of Contents)**

# Heading 1
## Heading 2               
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6
# Heading 1 link [Heading link](https://github.com/pandao/editor.md "Heading link")
## Heading 2 link [Heading link](https://github.com/pandao/editor.md "Heading link")
### Heading 3 link [Heading link](https://github.com/pandao/editor.md "Heading link")
#### Heading 4 link [Heading link](https://github.com/pandao/editor.md "Heading link") Heading link [Heading link](https://github.com/pandao/editor.md "Heading link")
##### Heading 5 link [Heading link](https://github.com/pandao/editor.md "Heading link")
###### Heading 6 link [Heading link](https://github.com/pandao/editor.md "Heading link")

#### Заголовок (с подчеркиванием) Heading (underline)

This is an H1
=============

This is an H2
-------------

### Эффекты символов и горизонтальная линия и другое
                
----

~~Зачеркнутый текст~~ <s>Зачеркнутый текст (при включении распознавания HTML-тегов)</s>
*Курсив*      _Курсив_
**Жирный**  __Жирный__
***Жирный курсив*** ___Жирный курсив___

Нижний индекс: X<sub>2</sub>, верхний индекс: O<sup>2</sup>

**Аббревиатура (как тег abbr в HTML)**

> Это сокращенная форма более длинного слова или фразы, работает при включенном распознавании HTML-тегов (по умолчанию включено)

The <abbr title="Hyper Text Markup Language">HTML</abbr> specification is maintained by the <abbr title="World Wide Web Consortium">W3C</abbr>.

### Цитаты Blockquotes

> Цитируемый текст Blockquotes

Встроенная цитата Blockquotes
                    
> Цитата: если нужно вставить пустую строку (т.е. тег `<br />`), введите два или более пробела и нажмите Enter, [Обычная ссылка](http://localhost/)。

### Якоря и ссылки Links

[Обычная ссылка](http://localhost/)

[Обычная ссылка с заголовком](http://localhost/ "Обычная ссылка с заголовком")

Прямая ссылка: <https://github.com>

[Якорная ссылка][anchor-id]

[anchor-id]: http://www.this-anchor-link.com/

[mailto:test.test@gmail.com](mailto:test.test@gmail.com)

GFM a-tail link @pandao  автоматическая ссылка на email test.test@gmail.com  www@vip.qq.com

> @pandao

### Подсветка кода для разных языков Codes

#### Встроенный код Inline code

Выполнить команду: `npm install marked`

#### Стиль с отступом

Отступ в четыре пробела также используется для создания предварительно форматированного текста, аналогично тегу `<pre>`.

    <?php
        echo "Hello world!";
    ?>
    
Предварительно форматированный текст:

    | First Header  | Second Header |
    | ------------- | ------------- |
    | Content Cell  | Content Cell  |
    | Content Cell  | Content Cell  |

#### JS-код

```javascript
function test() {
	console.log("Hello world!");
}
 
(function(){
    var box = function() {
        return box.fn.init();
    };

    box.prototype = box.fn = {
        init : function(){
            console.log('box.init()');

			return this;
        },

		add : function(str) {
			alert("add", str);

			return this;
		},

		remove : function(str) {
			alert("remove", str);

			return this;
		}
    };
    
    box.fn.init.prototype = box.fn;
    
    window.box =box;
})();

var testBox = box();
testBox.add("jQuery").remove("jQuery");
```

#### HTML-код HTML codes

```html
<!DOCTYPE html>
<html>
    <head>
        <mate charest="utf-8" />
        <meta name="keywords" content="Editor.md, Markdown, Editor" />
        <title>Hello world!</title>
        <style type="text/css">
            body{font-size:14px;color:#444;font-family: "Microsoft Yahei", Tahoma, "Hiragino Sans GB", Arial;background:#fff;}
            ul{list-style: none;}
            img{border:none;vertical-align: middle;}
        </style>
    </head>
    <body>
        <h1 class="text-xxl">Hello world!</h1>
        <p class="text-green">Plain text</p>
    </body>
</html>
```

### Изображения Images

Image:

![](https://pandao.github.io/editor.md/examples/images/4.jpg)

> Следуй зову сердца.

![](https://pandao.github.io/editor.md/examples/images/8.jpg)

> На фото: пляж Байчэн, Сямэнь

Изображение со ссылкой (Image + Link):

[![](https://pandao.github.io/editor.md/examples/images/7.jpg)](https://pandao.github.io/editor.md/images/7.jpg "李健首张专辑《似水流年》封面")

> На фото: обложка первого альбома Ли Цзяня «Поток времени»
                
----

### Списки Lists

#### Неупорядоченный список (дефис) Unordered Lists (-)
                
- Список один
- Список два
- Список три
     
#### Неупорядоченный список (звездочка) Unordered Lists (*)

* Список один
* Список два
* Список три

#### Неупорядоченный список (плюс и вложенность) Unordered Lists (+)
                
+ Список один
+ Список два
    + Список два-1
    + Список два-2
    + Список два-3
+ Список три
    * Список один
    * Список два
    * Список три

#### Упорядоченный список Ordered Lists (-)
                
1. Первая строка
2. Вторая строка
3. Третья строка

#### GFM task list

- [x] GFM task list 1
- [x] GFM task list 2
- [ ] GFM task list 3
    - [ ] GFM task list 3-1
    - [ ] GFM task list 3-2
    - [ ] GFM task list 3-3
- [ ] GFM task list 4
    - [ ] GFM task list 4-1
    - [ ] GFM task list 4-2
                
----
                    
### Таблицы Tables

| Товар        | Цена   |  Количество  |
| --------   | -----:  | :----:  |
| Компьютер   | $1600   |   5     |
| Телефон     |   $12   |   12   |
| Труба        |    $1    |  234  |
                    
First Header  | Second Header
------------- | -------------
Content Cell  | Content Cell
Content Cell  | Content Cell 

| First Header  | Second Header |
| ------------- | ------------- |
| Content Cell  | Content Cell  |
| Content Cell  | Content Cell  |

| Function name | Description                    |
| ------------- | ------------------------------ |
| `help()`      | Display the help window.       |
| `destroy()`   | **Destroy your computer!**     |

| Left-Aligned  | Center Aligned  | Right Aligned |
| :------------ |:---------------:| -----:|
| col 3 is      | some wordy text | $1600 |
| col 2 is      | centered        |   $12 |
| zebra stripes | are neat        |    $1 |

| Item      | Value |
| --------- | -----:|
| Computer  | $1600 |
| Phone     |   $12 |
| Pipe      |    $1 |
                
----

#### Специальные символы HTML Entities Codes

&copy; &  &uml; &trade; &iexcl; &pound;
&amp; &lt; &gt; &yen; &euro; &reg; &plusmn; &para; &sect; &brvbar; &macr; &laquo; &middot; 

X&sup2; Y&sup3; &frac34; &frac14;  &times;  &divide;   &raquo;

18&ordm;C  &quot;  &apos;

[========]

### Эмодзи :smiley:

> Blockquotes :star:

#### GFM task lists, эмодзи, иконки fontAwesome и эмодзи логотипа editormd :editormd-logo-5x:

- [x] :smiley: @mentions, :smiley: #refs, [links](), **formatting**, and <del>tags</del> supported :editormd-logo:;
- [x] list syntax required (any unordered or ordered list supported) :editormd-logo-3x:;
- [x] [ ] :smiley: this is a complete item :smiley:;
- [ ] []this is an incomplete item [test link](#) :fa-star: @pandao; 
- [ ] [ ]this is an incomplete item :fa-star: :fa-gear:;
    - [ ] :smiley: this is an incomplete item [test link](#) :fa-star: :fa-gear:;
    - [ ] :smiley: this is  :fa-star: :fa-gear: an incomplete item [test link](#);
 
#### Экранирование обратным слэшем Escape

\*literal asterisks\*

[========]
            
### Научные формулы TeX(KaTeX)

$$E=mc^2$$

Встроенная формула $$E=mc^2$$ встроенная формула, встроенная $$E=mc^2$$ формула.

$$x > y$$

$$\(\sqrt{3x-1}+(1+x)^2\)$$
                    
$$\sin(\alpha)^{\theta}=\sum_{i=0}^{n}(x^i + \cos(f))$$

Многострочная формула:

```math
\displaystyle
\left( \sum\_{k=1}^n a\_k b\_k \right)^2
\leq
\left( \sum\_{k=1}^n a\_k^2 \right)
\left( \sum\_{k=1}^n b\_k^2 \right)
```

```katex
\displaystyle 
    \frac{1}{
        \Bigl(\sqrt{\phi \sqrt{5}}-\phi\Bigr) e^{
        \frac25 \pi}} = 1+\frac{e^{-2\pi}} {1+\frac{e^{-4\pi}} {
        1+\frac{e^{-6\pi}}
        {1+\frac{e^{-8\pi}}
         {1+\cdots} }
        } 
    }
```

```latex
f(x) = \int_{-\infty}^\infty
    \hat f(\xi)\,e^{2 \pi i \xi x}
    \,d\xi
```

### Разрыв страницы Page break

> Тест печати: Ctrl + P

[========]

### Блок-схема Flowchart

```flow
st=>start: Начало: Вход пользователя
op=>operation: Операция входа
cond=>condition: Вход успешен? Да или Нет?
e=>end: Конец: Переход в админку

st->op->cond
cond(yes)->e
cond(no)->op
```

[========]
                    
### Диаграмма последовательности Sequence Diagram
                    
```seq
Andrew->China: Говорит привет
Note right of China: Китай думает\nоб этом
China-->Andrew: Как дела?
Andrew->>China: У меня всё хорошо, спасибо!
```

### End