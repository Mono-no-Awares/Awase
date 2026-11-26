<div align="center">

<img src="src-tauri/icons/128x128.png" alt="Awase Logo" width="84" />

# Awase

**Быстрый и лёгкий музыкальный плеер для Windows на Rust — объединяет локальные файлы, Яндекс Музыку, Spotify и SoundCloud.**

[English](README.md) | **Русский**

![Rust](https://img.shields.io/badge/Rust-1.80+-f97316?style=flat-square&logo=rust&logoColor=white)
![Tauri](https://img.shields.io/badge/Tauri-v2-24c8db?style=flat-square&logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/React-18%20%2B%20TS-38bdf8?style=flat-square&logo=react&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Windows%2011-0078d4?style=flat-square&logo=windows&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

</div>

---

## Превью

<p align="center">
  <img src="assets/resonance-aura.jpg" alt="Awase Резонанс — Аура" width="420" />
  &nbsp;&nbsp;
  <img src="assets/resonance-silk.jpg" alt="Awase Резонанс — Шёлк" width="420" />
</p>
<p align="center">
  <img src="assets/library.png" alt="Awase Коллекция" width="420" />
  &nbsp;&nbsp;
  <img src="assets/settings.png" alt="Awase Настройки и Эквалайзер" width="420" />
</p>

---

## Возможности

- **Единая медиатека** — локальные папки (`FLAC`, `WAV`, `MP3`, `M4A`, `AAC`, `OGG` с обложками), **Яндекс Музыка**, **Spotify** и **SoundCloud** в быстром виртуализированном списке.
- **Нативный аудиодвижок на Rust + 5-полосный эквалайзер** — декодирование через `rodio` + `symphonia` + `rustfft`, 32-полосный FFT-спектр в реальном времени, музыкальный эквалайзер (`60Hz` – `14kHz`) с автокомпенсацией перегрузок и выбором устройства вывода.
- **Визуализатор «Резонанс»** — три режима (**Аура**, **Шёлк**, **Орбита**), реагирующие на темп и цвета обложки, со встроенным управлением и полноэкранным режимом (`F11`).
- **Spotify без Premium и SoundCloud HLS/fMP4** — импорт публичных плейлистов Spotify по ссылке или из `.csv`/`.json` без подписки Premium (с автоматическим подбором полных версий из подключённых сервисов), а также встроенный демуксер MPEG-TS и fMP4 -> AAC для SoundCloud.
- **Адаптивная и кастомная тема** — глубокий чёрный OLED-интерфейс с подстройкой акцентов под обложку трека, ручной настройкой цветов, шрифтов и стилей анимаций (`Fluid`, `Snappy`, `Silk`).
- **Discord Rich Presence** — нативная интеграция статуса *«Слушает...»* с обложкой и таймером трека (отключается в настройках).
- **Игровой режим и трей** — кнопка **Игровой режим** в шапке отключает размытие/canvas и сбрасывает неиспользуемую память (`SetProcessWorkingSetSize`), а закрытие окна сворачивает плеер в системный трей.
- **Экспорт и импорт настроек** — резервное копирование настроек, эквалайзера, папок, плейлистов и токенов в один `.json` файл.

---

## Установка (Windows)

1. Скачайте `Awase_*_x64-setup.exe` со страницы [Releases](https://github.com/Mono-no-Awares/Awase/releases).
2. Запустите установщик (установка для текущего пользователя, права администратора не требуются).

---

## Сборка из исходников

```bash
npm install
npm run tauri build
```

Готовый `.exe` и NSIS-инсталлятор появятся в `src-tauri/target/release/`.

---

## Приватность и безопасность

- Все токены, плейлисты и кэш аудио хранятся **строго локально** на вашем ПК (`%APPDATA%\dev.mononoawares.awase\`).
- В приложении нет никакой телеметрии, аналитики или сторонних трекеров.

---

## Лицензия

MIT © [Mono no Aware](https://github.com/Mono-no-Awares)
