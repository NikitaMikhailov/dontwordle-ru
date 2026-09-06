# Не вордли — CLAUDE.md

Русскоязычный клон DontWordle. Цель игры — НЕ угадать загаданное 5-буквенное слово за 6 попыток.

## Структура проекта

```
index.html          — единственная страница (SPA)
style.css           — все стили, CSS variables, dark mode, адаптив
js/app.js           — вся игровая логика (ES module)
data/words.json     — 4194 пятибуквенных русских существительных
data/words.txt      — то же, plain text
scripts/
  fetch_words.py    — парсер слов с vfrsute.ru API
  deploy.sh         — первоначальный деплой на сервер
.github/workflows/
  deploy.yml        — CI/CD: пуш в main → деплой на сервер
```

## Игровая механика

- 6 попыток угадать слово (цель — не угадать)
- 🟩 Зелёная: буква на правильной позиции — **обязана** там стоять в следующих словах
- 🟨 Жёлтая: буква есть, но не на этом месте — **обязана** быть, но на другой позиции
- ⬜ Серая: буквы нет — **нельзя** использовать
- Счётчик «Осталось слов» показывает валидные слова по текущим ограничениям
- Отмены (5 штук / 2 в хард-моде) откатывают последний ход
- Если угадал слово — проигрыш (ВОРДЛНУЛ)
- Пережил 6 ходов — победа (ВЫЖИЛ)
- Слова кончились раньше 6 ходов — проигрыш (ВЫБЫЛ)

## Локальная разработка

```bash
cd /Users/nikitamikhailov/Documents/dontwordle-ru
python3 -m http.server 3456
# открыть http://localhost:3456
```

Сервер для превью настроен в `.claude/launch.json`.

## Продакшн сервер

Данные для SSH-доступа (IP, порт, логин) не хранятся в репозитории — см. приватные заметки/менеджер паролей.

- **Домен:** https://dontwordle.ru
- **ОС:** Ubuntu 20.04 LTS
- **Webroot:** `/var/www/dontwordle.ru`
- **nginx конфиг:** `/etc/nginx/sites-available/dontwordle.ru`
- **SSL:** Let's Encrypt, автообновление certbot, истекает 2026-08-12
- **Обновление вручную:** `sudo nevordli-update`
- **Логи:** `sudo tail -f /var/log/nginx/dontwordle.ru.error.log`

## CI/CD (GitHub Actions)

Workflow: `.github/workflows/deploy.yml`  
Триггер: push в `main` → SSH на сервер → `sudo nevordli-update` (git pull + chown)

**Secrets в репозитории** (Settings → Secrets → Actions):
- `SSH_HOST` — IP сервера
- `SSH_PORT` — SSH порт
- `SSH_USER` — имя пользователя
- `SSH_PRIVATE_KEY` — приватный ed25519 ключ

## Словарь

Источник: [vfrsute.ru API](https://vfrsute.ru/сканворд/слово-из-5-букв/)  
Параметры: `part_speech=существительное`, 5 пустых `letter[]` полей  
Пересобрать: `python3 scripts/fetch_words.py`

## Ежедневное слово

Детерминированный shuffle с seed=1337, затем `words[daysSince(2025-05-14) % words.length]`.  
Состояние и статистика хранятся в `localStorage` под ключами `nevordl_game` и `nevordl_stats`.
