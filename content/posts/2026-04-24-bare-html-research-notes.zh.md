---
title: "为什么这个站点近似裸 HTML"
date: "2026-04-24"
lang: "zh"
slug: "bare-html-research-notes-zh"
translationKey: "bare-html-research-notes"
visibility: "academic"
tags: ["writing", "web", "research-notes"]
summary: "一个研究笔记站点不需要先成为一个应用。它首先要让论证、公式、代码和引用稳定地出现。"
---

一个研究笔记站点不需要先成为一个应用。它首先要让论证、公式、代码和引用稳定地出现。浏览器已经提供了标题、段落、列表、表格、链接、代码块和可展开区域；这些元素对学术写作来说往往已经足够。

我希望这个站点遵守一个朴素目标：

$$
\operatorname*{arg\,min}_{site} \; C_{\text{maintenance}} + C_{\text{reading}} - V_{\text{durability}}
$$

这里的 $C_{\text{maintenance}}$ 是维护成本，$C_{\text{reading}}$ 是读者理解页面结构的成本，$V_{\text{durability}}$ 是长期可访问性。这个目标不排斥工具，但会要求工具留在构建阶段，而不是成为读者打开网页时必须下载和执行的负担。

## 写作接口

文章从 Markdown 开始：

```md
---
title: "A note"
visibility: "academic"
---

The Bellman equation is $v = r + \gamma Pv$.
```

构建脚本会把它变成普通 HTML。公式交给 MathJax 渲染，其他内容尽量保持浏览器原生语义。这样做的好处是：即使未来我换掉生成器，源文件仍然接近最终文本。

## 公开面的边界

这个站点默认只把 `visibility: academic` 的文章放到主页、学术列表、RSS 和 sitemap。更个人化的评论仍可存在，但只从完整索引进入，并且不主动推给搜索引擎。这不是强权限；它只是一个发布策略。
