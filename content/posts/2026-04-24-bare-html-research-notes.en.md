---
title: "Why this site stays close to plain HTML"
date: "2026-04-24"
lang: "en"
slug: "bare-html-research-notes-en"
translationKey: "bare-html-research-notes"
translationOf: "bare-html-research-notes-zh"
visibility: "academic"
tags: ["writing", "web", "research-notes"]
summary: "A research notebook does not have to become an application before it becomes useful."
translatedBy: "llm"
translationModel: "gpt-5-mini"
source: "posts/2026-04-24-bare-html-research-notes.zh.md"
---

A research notebook does not have to become an application before it becomes useful. Its first job is to make arguments, equations, code, and references appear in a stable way. Browsers already provide headings, paragraphs, lists, tables, links, code blocks, and expandable sections; for academic writing, these elements are often enough.

I want this site to follow a plain objective:

$$
\operatorname*{arg\,min}_{site} \; C_{\text{maintenance}} + C_{\text{reading}} - V_{\text{durability}}
$$

Here $C_{\text{maintenance}}$ is maintenance cost, $C_{\text{reading}}$ is the reader's cost of understanding the page structure, and $V_{\text{durability}}$ is long-term accessibility. This objective does not reject tools, but it asks them to stay in the build phase rather than become work the reader must download and execute when opening a page.

## Writing interface

An article starts as Markdown:

```md
---
title: "A note"
visibility: "academic"
---

The Bellman equation is $v = r + \gamma Pv$.
```

The build script turns it into ordinary HTML. MathJax renders equations, while the rest of the page keeps native browser semantics whenever possible. The benefit is that even if I replace the generator later, the source files remain close to the final text.

## Boundary of the public surface

By default, this site only places posts marked `visibility: academic` on the homepage, academic list, RSS feed, and sitemap. More personal commentary can still exist, but it is entered through the complete index and is not actively pushed to search engines. This is not strong access control; it is a publishing policy.
