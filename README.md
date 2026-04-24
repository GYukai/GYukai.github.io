# 顾俞凯的 Blog

vibe coded 个人主页和学术博客骨架。


## 新增blog

新增一篇 Markdown：

```md
---
title: "文章标题"
date: "2026-04-24"
lang: "zh"
slug: "my-note-zh"
translationKey: "my-note"
visibility: "academic"
tags: ["rl", "notes"]
summary: "一句话摘要。"
---

正文可以包含 $x^\top y$ 或：

$$
V^\pi(s)=\mathbb{E}_\pi[G_t \mid S_t=s]
$$
```

推到 `main` 后，GitHub Actions 会构建并部署 `_site`。

## 自动翻译

`Generate missing translations` workflow 会检查缺失的中英版本：

- 中文 `lang: zh` 缺英文时，生成 `lang: en`。
- 英文 `lang: en` 缺中文时，生成 `lang: zh`。
- 翻译稿会写回 `content/posts`，并标记 `translatedBy: llm`，页面会显示 `powered by llm`。

需要在 GitHub 仓库里设置：

- Secret: `OPENROUTER_API_KEY`
- Optional variable: `LLM_MODEL`，默认是 `gpt-5.4-mini`

## 本地使用

```sh
npm run build
npm run serve
```

然后打开 `http://127.0.0.1:4173/`。

## 发布到你的仓库

当前远程目标是：

```sh
git@github.com:GYukai/GYukai.github.io.git
```

如果这个目录还没有初始化：

```sh
git init
git branch -M main
git remote add origin git@github.com:GYukai/GYukai.github.io.git
```

如果远端已有模板历史，替换远端前请先确认你确实不要旧内容，再进行覆盖式推送。GitHub Pages 的 Source 选择 `GitHub Actions`。
