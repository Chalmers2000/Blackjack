$ErrorActionPreference = 'Stop'
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$dataDir = "$env:TEMP\bj-edge-profile-$(Get-Random)"
$port = 9333
$url = "file:///c:/Users/chris/GitHub_Projects/Blackjack/index.html"
$shotDir = "C:\Users\chris\GitHub_Projects\Blackjack\.test\shots"
New-Item -ItemType Directory -Force -Path $shotDir | Out-Null

$proc = Start-Process -FilePath $edge -ArgumentList @(
  "--headless=new","--disable-gpu","--remote-debugging-port=$port",
  "--user-data-dir=$dataDir","--no-first-run","--window-size=1300,1100",$url
) -PassThru

try {
  $deadline = (Get-Date).AddSeconds(15)
  $targets = $null
  while ((Get-Date) -lt $deadline) {
    try { $targets = Invoke-RestMethod "http://localhost:$port/json"; if ($targets) { break } } catch {}
    Start-Sleep -Milliseconds 300
  }
  $target = $targets | Where-Object { $_.url -like "file:*index.html*" } | Select-Object -First 1
  if (-not $target) { throw "No matching target found" }
  $wsUrl = $target.webSocketDebuggerUrl
  Write-Host "Connected target: $($target.url)"

  $ws = [System.Net.WebSockets.ClientWebSocket]::new()
  $cts = [System.Threading.CancellationToken]::None
  $ws.ConnectAsync($wsUrl, $cts).Wait()

  $script:msgId = 0
  function Send-CDP($method, $paramsObj) {
    $script:msgId++
    $id = $script:msgId
    $payload = @{ id = $id; method = $method; params = $paramsObj } | ConvertTo-Json -Depth 10 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
    $ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts).Wait()

    $buffer = New-Object byte[] 65536
    while ($true) {
      $all = New-Object System.Collections.Generic.List[byte]
      do {
        $seg = [System.ArraySegment[byte]]::new($buffer)
        $result = $ws.ReceiveAsync($seg, $cts).Result
        $all.AddRange([byte[]]$buffer[0..($result.Count-1)])
      } while (-not $result.EndOfMessage)
      $text = [System.Text.Encoding]::UTF8.GetString($all.ToArray())
      $obj = $text | ConvertFrom-Json
      if ($obj.id -eq $id) { return $obj }
      # else it's an event notification; ignore and keep reading
    }
  }

  function Eval($expr) {
    $r = Send-CDP "Runtime.evaluate" @{ expression = $expr; returnByValue = $true; awaitPromise = $false }
    return $r.result.result.value
  }

  function Screenshot($name) {
    $r = Send-CDP "Page.captureScreenshot" @{ format = "png" }
    $b64 = $r.result.data
    [IO.File]::WriteAllBytes("$shotDir\$name.png", [Convert]::FromBase64String($b64))
    Write-Host "Saved screenshot: $name.png"
  }

  Send-CDP "Runtime.enable" @{} | Out-Null
  Send-CDP "Page.enable" @{} | Out-Null
  Start-Sleep -Seconds 1

  Write-Host "--- Initial state ---"
  Write-Host (Eval "JSON.stringify(BJ.getState().bankroll)")
  Screenshot "01-initial"

  Write-Host "--- Place bet: two $25 chips = $50, then Deal ---"
  Eval "document.querySelector('.chip-25').click()" | Out-Null
  Eval "document.querySelector('.chip-25').click()" | Out-Null
  Write-Host (Eval "document.getElementById('betDisplay').textContent")
  Eval "document.getElementById('btnDeal').click()" | Out-Null

  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline) {
    $phase = Eval "BJ.getState().phase"
    if ($phase -eq 'playerTurn') { break }
    Start-Sleep -Milliseconds 500
  }
  Screenshot "02-dealt"
  Write-Host (Eval "JSON.stringify({phase: BJ.getState().phase, player: BJ.getState().playerHands.map(h=>h.cards.map(c=>c.rank+c.suit[0])), dealerUp: BJ.getState().dealerHand[0].rank})")
  Write-Host "Odds badge:"
  Write-Host (Eval "document.getElementById('oddsVal').textContent")

  Write-Host "--- Hit once ---"
  $canHit = Eval "!document.getElementById('btnHit').disabled"
  if ($canHit -eq $true) {
    Eval "document.getElementById('btnHit').click()" | Out-Null
    Start-Sleep -Seconds 3
    Screenshot "03-after-hit"
    Write-Host (Eval "JSON.stringify(BJ.getState().playerHands[0])")
    Write-Host "Odds badge after hit:"
    Write-Host (Eval "document.getElementById('oddsVal').textContent")
  } else {
    Write-Host "Hit not available (busted/blackjack/etc). State:"
    Write-Host (Eval "JSON.stringify(BJ.getState().playerHands[0])")
  }

  Write-Host "--- Stand (if still active) ---"
  $canStand = Eval "!document.getElementById('btnStand').disabled"
  if ($canStand -eq $true) {
    Eval "document.getElementById('btnStand').click()" | Out-Null
    $deadline = (Get-Date).AddSeconds(20)
    while ((Get-Date) -lt $deadline) {
      $phase = Eval "BJ.getState().phase"
      if ($phase -eq 'betting') { break }
      Start-Sleep -Milliseconds 500
    }
    Screenshot "04-after-stand-result"
    Write-Host (Eval "JSON.stringify({phase: BJ.getState().phase, bankroll: BJ.getState().bankroll, dealer: BJ.getState().dealerHand.map(c=>c.rank+c.suit[0]), stats: BJ.getState().stats})")
  } else {
    Write-Host "Stand not available. Phase: $(Eval 'BJ.getState().phase')"
  }

  Screenshot "05-back-to-betting"
  Write-Host (Eval "JSON.stringify({phase: BJ.getState().phase, bankroll: BJ.getState().bankroll, history: BJ.getState().history})")
  Write-Host "History table cells:"
  Write-Host (Eval "Array.from(document.querySelectorAll('#historyTable .score-cell')).map(c=>c.textContent).join(',')")
  Write-Host "Stats row:"
  Write-Host (Eval "document.querySelector('.stats-row').textContent")

  Write-Host "--- Console errors check ---"
  Write-Host (Eval "window.__errs ? window.__errs.join('|') : 'no error hook'")

  $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", $cts).Wait()
}
finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $dataDir -ErrorAction SilentlyContinue
}
