# Не вордли (Don't Wordle RU)

[![Live](https://img.shields.io/badge/live-dontwordle.ru-2ea44f)](https://dontwordle.ru)
[![Tests](https://github.com/NikitaMikhailov/dontwordle-ru/actions/workflows/deploy.yml/badge.svg)](https://github.com/NikitaMikhailov/dontwordle-ru/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Russian-language clone of [DontWordle](https://dontwordle.com). A daily word game where the goal is to **not** guess the secret 5-letter word.

**Play now:** [dontwordle.ru](https://dontwordle.ru)

## Game mechanics

- 5 attempts (6 in hard mode) to avoid guessing the target word
- Every guess must be a valid Russian noun from the dictionary
- Every guess must respect all previous hints (Wordle rules apply)
- 🟩 **Green** — correct letter, correct position — must appear there in all future guesses
- 🟨 **Yellow** — correct letter, wrong position — must appear elsewhere in all future guesses
- ⬜ **Gray** — letter not in word — cannot be used again
- **Survived** — completed all guesses without hitting the target word ✓
- **Wordled** — accidentally guessed the target word ✗
- **Eliminated** — ran out of valid words before all attempts were used ✗

Undos are limited (5 in normal mode, 2 in hard mode) and roll back the last guess.

## Stack

- Vanilla JS ES modules, no framework, no build step
- Single HTML file + `style.css` + `js/app.js` + `js/logic.js`
- Game state and stats persisted in `localStorage`
- Daily word: deterministic shuffle with seed `1337`, indexed by days since `2025-05-14`

## Dictionary

4194 five-letter Russian nouns sourced from [vfrsute.ru](https://vfrsute.ru).  
To rebuild: `python3 scripts/fetch_words.py`

## Project structure

```
index.html              Single-page app entry point
style.css               All styles: CSS variables, dark mode, responsive
js/
  app.js                UI, state management, game loop
  logic.js              Pure functions: evaluate, satisfies, countValid
data/
  words.json            Shuffled word list (4194 words)
tests/
  logic.test.js         Unit tests for game logic (Node.js)
scripts/
  fetch_words.py        Word list scraper
.github/workflows/
  deploy.yml            CI/CD: push to main → SSH deploy
```

## Local development

```bash
python3 -m http.server 3456
# open http://localhost:3456
```

No build step required. Cache-busting is handled by `__BUILD_HASH__` tokens replaced during deploy.

## Tests

```bash
node --experimental-vm-modules node_modules/.bin/jest
```

## Deployment

Push to `main` triggers GitHub Actions → SSH into production server → `sudo dontwordle-update` (git pull + `docker compose up --build -d`).

**Server:** Ubuntu, nginx reverse proxy, Docker, Let's Encrypt SSL  
**Webroot:** `/var/www/dontwordle.ru`

## Analytics & SEO

- Yandex.Metrica (counter `109237777`) — pageviews, webvisor, custom goals
- Custom events: `game_start`, `game_end` (with `result`, `guesses`, `hard_mode` params), `share`
- Open Graph + Twitter Card meta tags
- JSON-LD `WebApplication` schema
- Sitemap: [dontwordle.ru/sitemap.xml](https://dontwordle.ru/sitemap.xml)

## Sister project

[Chainle](https://chainle.ru) ([source](https://github.com/NikitaMikhailov/chainle-ru)) — a daily math puzzle game by the same author, same infra.
