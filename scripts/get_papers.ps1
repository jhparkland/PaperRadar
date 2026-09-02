<#
    get_papers.ps1 — 목록 파일의 논문을 PDF 로 내려받고 (선택) 서버로 보낸다. Windows / 학교망용.

    목록 파일 형식 (탭 또는 ' | ' 구분, # 은 주석):
        파일명.pdf<TAB>PDF직링크<TAB>랜딩페이지(선택)
    예:
        2026_HPCA_LowCarb-Carbon-Aware-Scheduling-of-Serverless-Functions.pdf	https://ieeexplore.ieee.org/stampPDF/getPDF.jsp?tp=&arnumber=11408586&ref=	https://ieeexplore.ieee.org/document/11408586
        2025_SoCC_GridGreen.pdf	https://dl.acm.org/doi/pdf/10.1145/3772052.3772241	https://dl.acm.org/doi/10.1145/3772052.3772241

    사용법:
        powershell -ExecutionPolicy Bypass -File .\get_papers.ps1 -List papers.txt
        powershell -ExecutionPolicy Bypass -File .\get_papers.ps1 -List papers.txt -Upload -RemoteHost 10.0.0.1 -RemotePort 22 -RemoteUser me -RemotePath /srv/papers/

    - 이미 정상 PDF 가 있으면 건너뜀 (재실행 안전)
    - %PDF 매직바이트·크기 검사로 HTML 오류 페이지를 걸러냄
    - 실패 목록을 마지막에 출력
    - IEEE 는 학교망 IP 인증이면 통과. ACM 은 Cloudflare 가 막을 수 있음 → 그땐 Claude in Chrome 으로
#>
param(
    [Parameter(Mandatory=$true)][string]$List,
    [switch]$Upload,
    [string]$Dest = (Join-Path $env:USERPROFILE 'Downloads'),
    [string]$RemoteUser = '',
    [string]$RemoteHost = '',
    [int]   $RemotePort = 22,
    [string]$RemotePath = ''
)

$ProgressPreference = 'SilentlyContinue'
$UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'

function Test-Pdf([string]$Path) {
    if (-not (Test-Path $Path)) { return $false }
    if ((Get-Item $Path).Length -lt 20000) { return $false }
    $h = [System.IO.File]::ReadAllBytes($Path)[0..3]
    return ($h[0] -eq 0x25 -and $h[1] -eq 0x50 -and $h[2] -eq 0x44 -and $h[3] -eq 0x46)
}

$papers = @()
foreach ($line in Get-Content $List -Encoding UTF8) {
    $t = $line.Trim()
    if (-not $t -or $t.StartsWith('#')) { continue }
    $parts = $t -split "`t| \| "
    if ($parts.Count -lt 2) { Write-Host "무시(형식 오류): $t" -ForegroundColor Yellow; continue }
    $papers += [pscustomobject]@{
        Name    = $parts[0].Trim()
        Pdf     = $parts[1].Trim()
        Referer = $(if ($parts.Count -ge 3 -and $parts[2].Trim()) { $parts[2].Trim() } else { $parts[1].Trim() })
    }
}
if ($papers.Count -eq 0) { Write-Host "목록이 비어 있습니다: $List" -ForegroundColor Red; exit 1 }
if (-not (Test-Path $Dest)) { New-Item -ItemType Directory -Path $Dest | Out-Null }

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$session.UserAgent = $UA
$ok = @(); $failed = @(); $skipped = @(); $i = 0; $n = $papers.Count

foreach ($p in $papers) {
    $i++
    $out = Join-Path $Dest $p.Name
    $short = if ($p.Name.Length -gt 70) { $p.Name.Substring(0,67) + '...' } else { $p.Name }
    if (Test-Pdf $out) { Write-Host ("[{0,2}/{1}] SKIP  {2}" -f $i,$n,$short) -ForegroundColor DarkGray; $skipped += $p.Name; continue }
    Write-Host ("[{0,2}/{1}] GET   {2}" -f $i,$n,$short)
    $done = $false; $err = ''
    foreach ($attempt in 1..3) {
        try {
            try { Invoke-WebRequest -Uri $p.Referer -WebSession $session -UseBasicParsing -TimeoutSec 60 -ErrorAction Stop | Out-Null } catch { }
            Invoke-WebRequest -Uri $p.Pdf -WebSession $session -UseBasicParsing -TimeoutSec 180 `
                -Headers @{ 'Referer' = $p.Referer; 'Accept' = 'application/pdf,*/*' } -OutFile $out -ErrorAction Stop
            if (Test-Pdf $out) { $done = $true; break }
            $err = 'PDF 아님 (HTML/오류 페이지)'; Remove-Item $out -ErrorAction SilentlyContinue
        } catch { $err = $_.Exception.Message; Remove-Item $out -ErrorAction SilentlyContinue }
        Start-Sleep -Seconds (2 * $attempt)
    }
    if ($done) { Write-Host ("         OK    {0} KB" -f [math]::Round((Get-Item $out).Length/1KB)) -ForegroundColor Green; $ok += $p.Name }
    else       { Write-Host ("         FAIL  {0}" -f $err) -ForegroundColor Red; $failed += $p.Name }
    Start-Sleep -Milliseconds 800
}

Write-Host "`n======== 결과 ========"
Write-Host ("성공 {0} / 건너뜀 {1} / 실패 {2}" -f $ok.Count, $skipped.Count, $failed.Count)
if ($failed.Count) { Write-Host "`n실패:" -ForegroundColor Yellow; $failed | ForEach-Object { Write-Host "  - $_" } }

if ($Upload) {
    if (-not $RemoteHost -or -not $RemoteUser -or -not $RemotePath) { Write-Host "`n-Upload 에는 -RemoteHost -RemoteUser -RemotePath 가 필요합니다." -ForegroundColor Red; exit 1 }
    $targets = @(); foreach ($p in $papers) { $f = Join-Path $Dest $p.Name; if (Test-Pdf $f) { $targets += $f } }
    if ($targets.Count -eq 0) { Write-Host "`n전송할 파일 없음" -ForegroundColor Yellow; exit 0 }
    Write-Host ("`n======== 서버 업로드 ({0}개, 목록의 파일만) ========" -f $targets.Count)
    & scp -P $RemotePort @targets "$RemoteUser@${RemoteHost}:$RemotePath"
    Write-Host "`n서버 내 PDF 개수:"
    & ssh -p $RemotePort "$RemoteUser@$RemoteHost" "ls -1 $RemotePath*.pdf | wc -l"
}
