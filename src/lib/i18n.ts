import type { AppLanguage } from "../types";

export const TRANSLATIONS: Record<
  AppLanguage,
  {
    navHome: string;
    navWave: string;
    navLibrary: string;
    navSettings: string;
    sourcesTitle: string;
    allMusic: string;
    favorites: string;
    playlists: string;
    noPlaylists: string;
    playlistPlaceholder: string;
    searchPlaceholder: string;
    welcomeTitle: string;
    welcomeSubtitle: string;
    nowPlaying: string;
    addFolder: string;
    connectServices: string;
    openWave: string;
    resume: string;
    pause: string;
    playAll: string;
    recentTracks: string;
    seeAll: string;
    emptyLibraryTitle: string;
    emptyLibrarySubtitle: string;
    tracksCount: string;
    clearSearch: string;
    refresh: string;
    scanning: string;
    nothingFound: string;
    nothingFoundSub: string;
    connectionsHeader: string;
    connectionsSub: string;
    appearanceHeader: string;
    languageLabel: string;
    fontSizeLabel: string;
    fontSizeSmall: string;
    fontSizeMedium: string;
    fontSizeLarge: string;
    fontFamilyLabel: string;
    miniVizLabel: string;
    miniVizBars: string;
    miniVizWave: string;
    miniVizOff: string;
    audioOutputLabel: string;
    eqTitle: string;
    eqOn: string;
    authorizeBrowser: string;
    syncLibrary: string;
    disconnect: string;
    connected: string;
    ready: string;
    connectBtn: string;
    saveToken: string;
    linkProfile: string;
    importLikes: string;
    yandexHint: string;
    yandexPlaceholder: string;
    spotifyClientId: string;
    spotifyToken: string;
    spotifyRedirectHint: string;
    scHandle: string;
    scToken: string;
    localDesc: string;
    noFolders: string;
    queueTitle: string;
    clearQueue: string;
    confirmClear: string;
    emptyQueue: string;
    notPlaying: string;
    selectTrack: string;
    waveTitle: string;
    waveStandby: string;
    allTab: string;
    vizAura: string;
    vizSilk: string;
    vizOrbital: string;
    vizLiquid: string;
    clickToSetup: string;
    selectMode: string;
    cancelSelect: string;
    selectAll: string;
    deselectAll: string;
    deleteSelected: string;
    clearLibrary: string;
    confirmClearLibrary: string;
    filterInList: string;
    colTitle: string;
    colAlbum: string;
    colActions: string;
    colDuration: string;
    addToPlaylist: string;
    addedToPlaylist: string;
    removeFromPlaylist: string;
    fullscreen: string;
    themeHeader: string;
    accentColorLabel: string;
    bgColorLabel: string;
    coverAdaptiveLabel: string;
    motionStyleLabel: string;
    motionFluid: string;
    motionSnappy: string;
    motionSilk: string;
    gamingModeLabel: string;
    gamingModeDesc: string;
    discordRpcLabel: string;
    discordRpcDesc: string;
    discordAppIdPlaceholder: string;
    discordCreateApp: string;
    deletePlaylist: string;
    spotifyPlaylistUrl: string;
    spotifyImportUrlBtn: string;
    spotifyImportFileBtn: string;
    spotifyPremiumNote: string;
    scHint: string;
    openSoundCloud: string;
    openDashboard: string;
    exportBackup: string;
    importBackup: string;
    pasteBtn: string;
    upNext: string;
    nowPlayingQueue: string;
  }
> = {
  ru: {
    navHome: "Главная",
    navWave: "Резонанс",
    navLibrary: "Коллекция",
    navSettings: "Настройки",
    sourcesTitle: "Источники",
    allMusic: "Вся музыка",
    favorites: "Мне нравится",
    playlists: "Плейлисты",
    noPlaylists: "Пока нет плейлистов",
    playlistPlaceholder: "Название плейлиста...",
    searchPlaceholder: "Поиск треков и артистов...",
    welcomeTitle: "Вся твоя музыка в одном потоке",
    welcomeSubtitle:
      "Локальные файлы, Яндекс Музыка, Spotify и SoundCloud в едином проигрывателе.",
    nowPlaying: "Сейчас играет",
    addFolder: "Добавить папку",
    connectServices: "Подключить сервисы",
    openWave: "Открыть Резонанс",
    resume: "Продолжить",
    pause: "Пауза",
    playAll: "Включить всё",
    recentTracks: "Недавние треки",
    seeAll: "Показать все",
    emptyLibraryTitle: "Здесь пока пусто",
    emptyLibrarySubtitle:
      "Найди трек через поиск сверху, добавь папку с музыкой или подключи Яндекс Музыку.",
    tracksCount: "треков",
    clearSearch: "Сбросить поиск",
    refresh: "Обновить",
    scanning: "Сканирую...",
    nothingFound: "Ничего не найдено",
    nothingFoundSub: "Попробуй другой запрос или переключи вкладку сервиса выше.",
    connectionsHeader: "Настройки и подключения",
    connectionsSub: "Подключай сервисы, меняй внешний вид, нижний визуализатор и эквалайзер.",
    appearanceHeader: "Интерфейс и язык",
    languageLabel: "Язык",
    fontSizeLabel: "Размер текста",
    fontSizeSmall: "Компактный",
    fontSizeMedium: "Стандартный",
    fontSizeLarge: "Крупный",
    fontFamilyLabel: "Шрифт",
    miniVizLabel: "Визуализатор в нижней панели",
    miniVizBars: "Полосы",
    miniVizWave: "Волна",
    miniVizOff: "Выкл",
    audioOutputLabel: "Устройство вывода",
    eqTitle: "Эквалайзер",
    eqOn: "Включён",
    authorizeBrowser: "Войти в браузере",
    syncLibrary: "Загрузить медиатеку",
    disconnect: "Отключить",
    connected: "Подключено",
    ready: "Готово",
    connectBtn: "Подключить",
    saveToken: "Сохранить",
    linkProfile: "Привязать профиль",
    importLikes: "Загрузить лайки",
    yandexHint:
      "После входа в браузере скопируй ссылку из адресной строки (там будет access_token) и вставь сюда:",
    yandexPlaceholder: "Вставь ссылку из браузера или токен...",
    spotifyClientId: "Spotify Client ID",
    spotifyToken: "Или Bearer-токен",
    spotifyRedirectHint: "Redirect URI в настройках приложения Spotify:",
    scHandle: "Ник или ссылка на профиль",
    scToken: "Необязательный OAuth-токен",
    localDesc: "FLAC, WAV, MP3, M4A, AAC и OGG прямо с диска с обложками.",
    noFolders: "Папки пока не добавлены.",
    queueTitle: "Очередь",
    clearQueue: "Очистить очередь",
    confirmClear: "Точно очистить?",
    emptyQueue: "Очередь пуста. Выбери трек или нажми + рядом с песней.",
    notPlaying: "Ничего не играет",
    selectTrack: "Выбери любой трек",
    waveTitle: "Awase · Резонанс",
    waveStandby: "Включи любой трек, чтобы Резонанс ожил под цвета обложки",
    allTab: "Все",
    vizAura: "Аура",
    vizSilk: "Шёлк",
    vizOrbital: "Орбита",
    vizLiquid: "Жидкий шёлк",
    clickToSetup: "Нажмите для настройки",
    selectMode: "Выбрать",
    cancelSelect: "Отмена",
    selectAll: "Выбрать все",
    deselectAll: "Снять выбор",
    deleteSelected: "Удалить выбранные",
    clearLibrary: "Удалить все",
    confirmClearLibrary: "Подтвердить удаление?",
    filterInList: "Фильтр по названию или артисту...",
    colTitle: "Трек / Исполнитель",
    colAlbum: "Альбом",
    colActions: "Действия",
    colDuration: "Время",
    addToPlaylist: "В плейлист",
    addedToPlaylist: "Добавлено",
    removeFromPlaylist: "Убрать из плейлиста",
    fullscreen: "На весь экран (F11)",
    themeHeader: "Тема и цвета",
    accentColorLabel: "Акцентный цвет",
    bgColorLabel: "Цвет фона",
    coverAdaptiveLabel: "Цвет интерфейса под обложку трека",
    motionStyleLabel: "Стиль анимаций",
    motionFluid: "Плавный",
    motionSnappy: "Чёткий",
    motionSilk: "Мягкий",
    gamingModeLabel: "Игровой режим",
    gamingModeDesc: "Отключает тяжёлые эффекты и фоновый рендер для минимума RAM и CPU",
    discordRpcLabel: "Discord Rich Presence",
    discordRpcDesc: "Показывать текущий трек и обложку в статусе Discord",
    discordAppIdPlaceholder: "Discord Application ID (из Developer Portal)...",
    discordCreateApp: "Создать App ID",
    deletePlaylist: "Удалить плейлист",
    spotifyPlaylistUrl: "Ссылка на публичный плейлист Spotify (open.spotify.com/playlist/...)",
    spotifyImportUrlBtn: "Импорт плейлиста",
    spotifyImportFileBtn: "Импорт CSV / JSON (лайки)",
    spotifyPremiumNote:
      "Воспроизведение Spotify работает напрямую через официальный Web Playback SDK и требует активной подписки Spotify Premium.",
    scHint:
      "1) Нажми «Войти в SoundCloud» (если профиль приватный) или вставь свой ник/ссылку (например soundcloud.com/yourname) -> 2) Нажми «Привязать профиль» -> 3) Нажми «Загрузить лайки».",
    openSoundCloud: "Войти в SoundCloud",
    openDashboard: "Создать Client ID",
    exportBackup: "Экспорт настроек",
    importBackup: "Импорт настроек",
    pasteBtn: "Вставить",
    upNext: "Далее в очереди",
    nowPlayingQueue: "Сейчас играет",
  },
  en: {
    navHome: "Home",
    navWave: "Resonance",
    navLibrary: "Library",
    navSettings: "Settings",
    sourcesTitle: "Sources",
    allMusic: "All Music",
    favorites: "Favorites",
    playlists: "Playlists",
    noPlaylists: "No playlists yet",
    playlistPlaceholder: "Playlist name...",
    searchPlaceholder: "Search songs and artists...",
    welcomeTitle: "All your music, in one calm flow",
    welcomeSubtitle:
      "Local lossless, Yandex Music, Spotify and SoundCloud harmonized together.",
    nowPlaying: "Now Playing",
    addFolder: "Add Folder",
    connectServices: "Connect Services",
    openWave: "Open Resonance",
    resume: "Resume",
    pause: "Pause",
    playAll: "Play All",
    recentTracks: "Recent Tracks",
    seeAll: "See all",
    emptyLibraryTitle: "Nothing here yet",
    emptyLibrarySubtitle:
      "Search any song above, add a local folder, or connect your streaming accounts.",
    tracksCount: "tracks",
    clearSearch: "Clear Search",
    refresh: "Refresh",
    scanning: "Scanning...",
    nothingFound: "Nothing found",
    nothingFoundSub: "Try another query or switch source tabs above.",
    connectionsHeader: "Settings & Connections",
    connectionsSub: "Connect services, customize look, bottom mini-visualizer and equalizer.",
    appearanceHeader: "Interface & Language",
    languageLabel: "Language",
    fontSizeLabel: "Text Size",
    fontSizeSmall: "Compact",
    fontSizeMedium: "Standard",
    fontSizeLarge: "Large",
    fontFamilyLabel: "Font Family",
    miniVizLabel: "Bottom Bar Visualizer",
    miniVizBars: "Bars",
    miniVizWave: "Wave",
    miniVizOff: "Off",
    audioOutputLabel: "Output Device",
    eqTitle: "Equalizer",
    eqOn: "Active",
    authorizeBrowser: "Sign in via Browser",
    syncLibrary: "Sync Library",
    disconnect: "Disconnect",
    connected: "Connected",
    ready: "Ready",
    connectBtn: "Connect",
    saveToken: "Save",
    linkProfile: "Link Profile",
    importLikes: "Import Likes",
    yandexHint:
      "After signing in in your browser, copy the final URL from the address bar (containing access_token) and paste it below:",
    yandexPlaceholder: "Paste redirected URL or token...",
    spotifyClientId: "Spotify Client ID",
    spotifyToken: "Optional Bearer Token",
    spotifyRedirectHint: "Redirect URI for Spotify Dashboard:",
    scHandle: "Profile name or URL",
    scToken: "Optional OAuth token",
    localDesc: "FLAC, WAV, MP3, M4A, AAC & OGG directly from your folders.",
    noFolders: "No folders added yet.",
    queueTitle: "Queue",
    clearQueue: "Clear queue",
    confirmClear: "Confirm clear?",
    emptyQueue: "Queue is empty. Play a track or click + on any song.",
    notPlaying: "Not Playing",
    selectTrack: "Select any track to start",
    waveTitle: "Awase · Resonance",
    waveStandby: "Play any track to awaken the cover-reactive visualizer",
    allTab: "All",
    vizAura: "Aura",
    vizSilk: "Silk",
    vizOrbital: "Orbital",
    vizLiquid: "Liquid Aurora",
    clickToSetup: "Click to setup",
    selectMode: "Select",
    cancelSelect: "Cancel",
    selectAll: "Select all",
    deselectAll: "Deselect all",
    deleteSelected: "Delete selected",
    clearLibrary: "Delete all",
    confirmClearLibrary: "Confirm delete all?",
    filterInList: "Filter by title or artist...",
    colTitle: "Track / Artist",
    colAlbum: "Album",
    colActions: "Actions",
    colDuration: "Time",
    addToPlaylist: "Add to playlist",
    addedToPlaylist: "Added",
    removeFromPlaylist: "Remove from playlist",
    fullscreen: "Fullscreen (F11)",
    themeHeader: "Theme & Colors",
    accentColorLabel: "Accent Color",
    bgColorLabel: "Background",
    coverAdaptiveLabel: "Adapt theme colors to track cover",
    motionStyleLabel: "Motion Style",
    motionFluid: "Fluid",
    motionSnappy: "Snappy",
    motionSilk: "Silk",
    gamingModeLabel: "Gaming Mode",
    gamingModeDesc: "Disables blur & heavy canvas effects for ultra-low RAM and CPU",
    discordRpcLabel: "Discord Rich Presence",
    discordRpcDesc: "Display current track and cover art in your Discord status",
    discordAppIdPlaceholder: "Discord Application ID (from Developer Portal)...",
    discordCreateApp: "Create App ID",
    deletePlaylist: "Delete playlist",
    spotifyPlaylistUrl: "Public Spotify playlist URL (open.spotify.com/playlist/...)",
    spotifyImportUrlBtn: "Import Playlist",
    spotifyImportFileBtn: "Import CSV / JSON (Likes)",
    spotifyPremiumNote:
      "Spotify playback runs directly via the official Web Playback SDK and requires an active Spotify Premium subscription.",
    scHint:
      "1) Click Sign in to SoundCloud (or enter your handle/URL like soundcloud.com/yourname) -> 2) Click Link Profile -> 3) Click Import Likes.",
    openSoundCloud: "Sign in to SoundCloud",
    openDashboard: "Get Client ID",
    exportBackup: "Export Settings",
    importBackup: "Import Settings",
    pasteBtn: "Paste",
    upNext: "Up Next",
    nowPlayingQueue: "Now Playing",
  },
};
