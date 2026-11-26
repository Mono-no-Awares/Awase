use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use serde::Serialize;

const CREATE_NO_WINDOW: u32 = 0x08000000;
const ZAPRET_BUNDLE_URL: &str =
    "https://github.com/bol-van/zapret-win-bundle/archive/refs/heads/master.zip";

const SOUNDCLOUD_DOMAINS: &str = "\
soundcloud.com
www.soundcloud.com
api-v2.soundcloud.com
api.soundcloud.com
sndcdn.com
a-v2.sndcdn.com
i1.sndcdn.com
cf-media.sndcdn.com
cf-hls-media.sndcdn.com
soundcloud.cloud
playback.media-streaming.soundcloud.cloud
media-streaming.soundcloud.cloud
";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZapretStatus {
    pub installed: bool,
    pub running: bool,
    pub external_running: bool,
    pub list_path: String,
    pub exe_path: String,
    pub strategy: Option<String>,
    pub progress: Option<String>,
}

pub fn zapret_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("zapret")
}

fn ensure_awase_exe(dir: &Path) -> PathBuf {
    let awase_exe = dir.join("awase-zapret.exe");
    let orig_exe = dir.join("winws.exe");
    if !awase_exe.exists() && orig_exe.exists() {
        let _ = std::fs::copy(&orig_exe, &awase_exe);
    }
    awase_exe
}

pub fn ensure_soundcloud_list(data_dir: &Path) -> Result<PathBuf, String> {
    let dir = zapret_dir(data_dir);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let list_path = dir.join("list-soundcloud.txt");
    std::fs::write(&list_path, SOUNDCLOUD_DOMAINS).map_err(|e| e.to_string())?;
    Ok(list_path)
}

fn check_processes() -> (bool, bool) {
    let Ok(out) = Command::new("tasklist")
        .args(["/NH", "/FO", "CSV"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    else {
        return (false, false);
    };
    let text = String::from_utf8_lossy(&out.stdout).to_lowercase();
    let awase_running = text.contains("\"awase-zapret.exe\"");
    let external_running = text.contains("\"winws.exe\"");
    (awase_running, external_running)
}

fn read_text_file(path: PathBuf) -> Option<String> {
    std::fs::read_to_string(path)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub fn get_status(data_dir: &Path) -> ZapretStatus {
    let dir = zapret_dir(data_dir);
    let exe = ensure_awase_exe(&dir);
    let list = dir.join("list-soundcloud.txt");
    let (running, external_running) = check_processes();
    ZapretStatus {
        installed: exe.exists() || external_running,
        running: running || (external_running && read_text_file(dir.join("strategy.txt")).as_deref() == Some("Integrated (External Zapret)")),
        external_running,
        list_path: list.to_string_lossy().to_string(),
        exe_path: exe.to_string_lossy().to_string(),
        strategy: read_text_file(dir.join("strategy.txt")),
        progress: read_text_file(dir.join("status.txt")),
    }
}

pub async fn install_zapret(client: &reqwest::Client, data_dir: &Path) -> Result<ZapretStatus, String> {
    let dir = zapret_dir(data_dir);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    ensure_soundcloud_list(data_dir)?;
    let _ = std::fs::write(dir.join("status.txt"), "Скачивание Zapret (~5 МБ)...");

    let resp = client
        .get(ZAPRET_BUNDLE_URL)
        .send()
        .await
        .map_err(|e| format!("Zapret download failed: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("Zapret download HTTP {}", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    let zip_path = dir.join("bundle.zip");
    let extract_dir = dir.join("_extract");
    if extract_dir.exists() {
        let _ = std::fs::remove_dir_all(&extract_dir);
    }
    std::fs::write(&zip_path, &bytes).map_err(|e| e.to_string())?;

    let _ = std::fs::write(dir.join("status.txt"), "Распаковка awase-zapret.exe и WinDivert...");
    let ps_cmd = format!(
        "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
        zip_path.to_string_lossy().replace('\'', "''"),
        extract_dir.to_string_lossy().replace('\'', "''")
    );
    let out = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &ps_cmd])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to extract Zapret: {}", e))?;

    if !out.status.success() {
        let _ = std::fs::remove_file(&zip_path);
        let _ = std::fs::remove_dir_all(&extract_dir);
        return Err("Failed to extract Zapret archive".to_string());
    }

    let winws_src = extract_dir.join("zapret-win-bundle-master").join("zapret-winws");
    for file in ["winws.exe", "WinDivert.dll", "WinDivert64.sys", "cygwin1.dll"] {
        let src = winws_src.join(file);
        if src.exists() {
            let dst_name = if file == "winws.exe" { "awase-zapret.exe" } else { file };
            let dst = dir.join(dst_name);
            std::fs::copy(&src, &dst).map_err(|e| e.to_string())?;
        }
    }

    let _ = std::fs::remove_file(&zip_path);
    let _ = std::fs::remove_dir_all(&extract_dir);
    let _ = std::fs::remove_file(dir.join("status.txt"));

    let status = get_status(data_dir);
    if !status.installed {
        return Err("awase-zapret.exe не найден в архиве".to_string());
    }
    Ok(status)
}

pub async fn start_zapret_auto(data_dir: &Path) -> Result<ZapretStatus, String> {
    let list_path = ensure_soundcloud_list(data_dir)?;
    let dir = zapret_dir(data_dir);
    let exe_path = ensure_awase_exe(&dir);
    let (_, external_running) = check_processes();
    if !exe_path.exists() && !external_running {
        return Err("Zapret не установлен".to_string());
    }

    let dir_esc = dir.to_string_lossy().replace('\'', "''");
    let exe_esc = exe_path.to_string_lossy().replace('\'', "''");
    let list_esc = list_path.to_string_lossy().replace('\'', "''");
    let status_file = dir.join("status.txt");
    let out_file = dir.join("last_out.txt");
    let err_file = dir.join("last_error.txt");
    let _ = std::fs::remove_file(&out_file);
    let _ = std::fs::remove_file(&err_file);
    let _ = std::fs::write(&status_file, "Ожидание прав администратора (UAC)...");

    let autotune_ps = dir.join("autotune.ps1");
    let script = format!(
        r#"$ErrorActionPreference = 'SilentlyContinue'
$dir = '{dir}'
$exe = '{exe}'
$list = '{list}'
$statusPath = Join-Path $dir 'status.txt'
$stratPath = Join-Path $dir 'strategy.txt'
$outPath = Join-Path $dir 'last_out.txt'

function Set-St($msg) {{ Set-Content -Path $statusPath -Value $msg -Encoding UTF8 }}

$extProc = Get-CimInstance Win32_Process -Filter "Name='winws.exe'" | Select-Object -First 1
if ($extProc) {{
  Set-St 'Найден активный Zapret — добавляем SoundCloud...'
  $extDir = Split-Path $extProc.ExecutablePath -Parent
  $parentDir = Split-Path $extDir -Parent
  $listsDir = Join-Path $parentDir 'lists'
  if (-not (Test-Path $listsDir)) {{ $listsDir = $extDir }}
  $userList = Join-Path $listsDir 'list-general-user.txt'
  if (-not (Test-Path $userList)) {{ $userList = Join-Path $listsDir 'list-general.txt' }}
  $scDomains = Get-Content $list -Encoding UTF8
  if (Test-Path $userList) {{
    $existing = Get-Content $userList -Raw -Encoding UTF8
    $toAdd = @()
    foreach ($d in $scDomains) {{
      $t = $d.Trim()
      if ($t -and ($existing -notmatch [regex]::Escape($t))) {{ $toAdd += $t }}
    }}
    if ($toAdd.Count -gt 0) {{
      Add-Content -Path $userList -Value ("`r`n" + ($toAdd -join "`r`n")) -Encoding UTF8
    }}
  }}
  $svc = Get-Service | Where-Object {{ $_.Name -like '*zapret*' -and $_.Status -eq 'Running' }} | Select-Object -First 1
  if ($svc) {{
    Set-St 'Перезапуск службы Zapret с доменами SoundCloud...'
    Restart-Service -Name $svc.Name -Force
  }} elseif ($extProc.CommandLine) {{
    Set-St 'Перезапуск Zapret с доменами SoundCloud...'
    Stop-Process -Id $extProc.ProcessId -Force
    Start-Sleep -Milliseconds 400
    $cl = $extProc.CommandLine
    $exeQ = '"' + $extProc.ExecutablePath + '"'
    $argStr = $cl.Replace($exeQ, '').Replace($extProc.ExecutablePath, '').Trim()
    Start-Process -FilePath $extProc.ExecutablePath -WorkingDirectory $extDir -ArgumentList $argStr -WindowStyle Hidden
  }}
  Start-Sleep -Milliseconds 800
  Set-Content -Path $stratPath -Value 'Integrated (External Zapret)' -Encoding UTF8
  Set-St 'Готово: SoundCloud добавлен в ваш Zapret'
  exit 0
}}

Set-St 'Очистка старого драйвера WinDivert...'
taskkill /F /IM awase-zapret.exe 2>$null | Out-Null
$wdConf = (sc.exe qc WinDivert 2>$null) -join ' '
$wdQuery = (sc.exe query WinDivert 2>$null) -join ' '
if (($wdConf -match 'DISABLED') -and ($wdQuery -match 'RUNNING')) {{
  Set-Content -Path $outPath -Value 'Драйвер WinDivert заблокирован Windows до перезагрузки ПК. Используйте встроенный RU-обход Awase (работает сразу без драйвера).' -Encoding UTF8
  Set-St 'WinDivert ждёт перезагрузки ПК — используйте встроенный RU-обход'
  exit 1
}}
if ($wdQuery -match 'RUNNING') {{
  sc.exe stop WinDivert 2>$null | Out-Null
  for ($w = 0; $w -lt 15; $w++) {{
    $q = (sc.exe query WinDivert 2>$null) -join ' '
    if ($q -match 'STOPPED' -or $q -match '1060') {{ break }}
    Start-Sleep -Milliseconds 200
  }}
  $qEnd = (sc.exe query WinDivert 2>$null) -join ' '
  if ($qEnd -match 'STOPPED') {{
    sc.exe delete WinDivert 2>$null | Out-Null
  }}
}}
Start-Sleep -Milliseconds 300

$hlArg = if ($list -match '\s') {{ "--hostlist=`"$list`"" }} else {{ "--hostlist=$list" }}

$strategies = @(
  @{{ Name = 'ALT-1 (fake+fakedsplit ts)'; Args = @('--wf-tcp=80,443','--filter-tcp=80,443',$hlArg,'--dpi-desync=fake,fakedsplit','--dpi-desync-repeats=6','--dpi-desync-fooling=ts','--dpi-desync-fakedsplit-pattern=0x00') }},
  @{{ Name = 'ALT-2 (fake+multisplit ts)'; Args = @('--wf-tcp=80,443','--filter-tcp=80,443',$hlArg,'--dpi-desync=fake,multisplit','--dpi-desync-split-pos=1','--dpi-desync-fooling=ts','--dpi-desync-repeats=8') }},
  @{{ Name = 'ALT-3 (fake+multisplit badseq)'; Args = @('--wf-tcp=80,443','--filter-tcp=80,443',$hlArg,'--dpi-desync=fake,multisplit','--dpi-desync-split-pos=2','--dpi-desync-fooling=badseq','--dpi-desync-repeats=6') }},
  @{{ Name = 'ALT-4 (multisplit)'; Args = @('--wf-tcp=80,443','--filter-tcp=80,443',$hlArg,'--dpi-desync=multisplit','--dpi-desync-split-pos=2') }}
)

$found = $null
$lastMsg = ''
for ($i = 0; $i -lt $strategies.Count; $i++) {{
  $s = $strategies[$i]
  Set-St ("Проверка стратегии " + ($i + 1) + "/" + $strategies.Count + ": " + $s.Name)
  taskkill /F /IM awase-zapret.exe 2>$null | Out-Null
  Start-Sleep -Milliseconds 250
  $proc = Start-Process -FilePath $exe -WorkingDirectory $dir -ArgumentList $s.Args -WindowStyle Hidden -PassThru
  Start-Sleep -Milliseconds 800
  if ($proc -and -not $proc.HasExited) {{
    $c1 = (curl.exe -s -o NUL -w "%{{http_code}}" --max-time 4 "https://soundcloud.com")
    $c2 = (curl.exe -s -o NUL -w "%{{http_code}}" --max-time 4 "https://playback.media-streaming.soundcloud.cloud")
    if (($c1 -ne "000" -and $c1 -ne "") -and ($c2 -ne "000" -and $c2 -ne "")) {{
      $found = $s.Name
      break
    }}
  }} else {{
    $cmdLine = "`"$exe`" " + ($s.Args -join ' ') + " > `"$outPath`" 2>&1"
    cmd.exe /c $cmdLine | Out-Null
    $o = if (Test-Path $outPath) {{ (Get-Content $outPath -Raw) }} else {{ '' }}
    $lastMsg = $o.Trim()
  }}
}}

if ($found) {{
  Set-Content -Path $stratPath -Value $found -Encoding UTF8
  Set-St ("Готово: " + $found)
}} else {{
  $fb = $strategies[0]
  taskkill /F /IM awase-zapret.exe 2>$null | Out-Null
  $p2 = Start-Process -FilePath $exe -WorkingDirectory $dir -ArgumentList $fb.Args -WindowStyle Hidden -PassThru
  Start-Sleep -Milliseconds 600
  if ($p2 -and -not $p2.HasExited) {{
    Set-Content -Path $stratPath -Value $fb.Name -Encoding UTF8
    Set-St ("Запущена базовая стратегия: " + $fb.Name)
  }} elseif ($lastMsg) {{
    Set-St ("Ошибка: " + $lastMsg)
  }}
}}
"#,
        dir = dir_esc,
        exe = exe_esc,
        list = list_esc
    );
    let script_with_bom = format!("\u{FEFF}{}", script);
    std::fs::write(&autotune_ps, script_with_bom).map_err(|e| e.to_string())?;

    let launcher_cmd = format!(
        "Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"{}\"' -Verb RunAs -Wait",
        autotune_ps.to_string_lossy().replace('\'', "''")
    );

    let out = tokio::task::spawn_blocking(move || {
        Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &launcher_cmd])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("Failed to start Zapret: {}", e))?;

    if !out.status.success() {
        let _ = std::fs::remove_file(&status_file);
        return Err("Запуск Zapret отменён (нужны права администратора)".to_string());
    }

    let st = get_status(data_dir);
    let _ = std::fs::remove_file(&status_file);
    if !st.running {
        let err_detail = read_text_file(err_file)
            .or_else(|| read_text_file(out_file))
            .unwrap_or_else(|| "проверьте права администратора или совместимость WinDivert".to_string());
        return Err(format!("awase-zapret.exe не запустился: {}", err_detail));
    }
    Ok(st)
}

pub fn stop_zapret() {
    let ps = "Start-Process -FilePath 'taskkill.exe' -ArgumentList '/F /IM awase-zapret.exe' -Verb RunAs -WindowStyle Hidden -Wait";
    let _ = Command::new("taskkill")
        .args(["/F", "/IM", "awase-zapret.exe"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    let (awase_running, _) = check_processes();
    if awase_running {
        let _ = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", ps])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
}
