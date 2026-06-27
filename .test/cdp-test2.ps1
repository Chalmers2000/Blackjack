$ErrorActionPreference = 'Stop'
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$dataDir = "$env:TEMP\bj-edge-profile-$(Get-Random)"
$port = 9334
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
  $wsUrl = $target.webSocketDebuggerUrl

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
    }
  }
  function Eval($expr) {
    $r = Send-CDP "Runtime.evaluate" @{ expression = $expr; returnByValue = $true; awaitPromise = $false }
    if ($r.result.exceptionDetails) { Write-Host "JS ERROR: $($r.result.exceptionDetails.text)" }
    return $r.result.result.value
  }
  function Screenshot($name) {
    $r = Send-CDP "Page.captureScreenshot" @{ format = "png" }
    [IO.File]::WriteAllBytes("$shotDir\$name.png", [Convert]::FromBase64String($r.result.data))
    Write-Host "Saved screenshot: $name.png"
  }
  function WaitPhase($p, $secs) {
    $deadline = (Get-Date).AddSeconds($secs)
    while ((Get-Date) -lt $deadline) {
      if ((Eval "BJ.getState().phase") -eq $p) { return $true }
      Start-Sleep -Milliseconds 400
    }
    return $false
  }

  Send-CDP "Runtime.enable" @{} | Out-Null
  Send-CDP "Page.enable" @{} | Out-Null
  Start-Sleep -Seconds 1

  Write-Host "=== TEST: SPLIT ==="
  Eval @'
(function(){
  var shoe = createShoe();
  // pop order: last element popped first -> player1, dealerUp, player2, dealerHole
  shoe.push({suit:"diamonds",rank:"2",value:2});   // dealerHole (4th pop)
  shoe.push({suit:"spades",rank:"8",value:8});     // player2   (3rd pop)
  shoe.push({suit:"hearts",rank:"6",value:6});      // dealerUp  (2nd pop)
  shoe.push({suit:"clubs",rank:"8",value:8});       // player1   (1st pop)
  BJ.getState().shoe = shoe;
})();
'@ | Out-Null

  Eval "document.querySelector('.chip-25').click()" | Out-Null
  Eval "document.querySelector('.chip-25').click()" | Out-Null
  Eval "document.getElementById('btnDeal').click()" | Out-Null
  WaitPhase "playerTurn" 20 | Out-Null
  Screenshot "06-split-pair-dealt"
  Write-Host (Eval "JSON.stringify({bankroll: BJ.getState().bankroll, hand: BJ.getState().playerHands[0].cards.map(c=>c.rank), splitEnabled: !document.getElementById('btnSplit').disabled})")

  Eval "document.getElementById('btnSplit').click()" | Out-Null
  Start-Sleep -Seconds 4
  Screenshot "07-after-split"
  Write-Host (Eval "JSON.stringify({bankroll: BJ.getState().bankroll, hands: BJ.getState().playerHands.map(h=>({cards:h.cards.map(c=>c.rank), bet:h.bet, status:h.status})), activeIdx: BJ.getState().activeHandIndex})")
  Write-Host "Hand zone labels:"
  Write-Host (Eval "Array.from(document.querySelectorAll('.hand-label.player-label')).map(e=>e.textContent).join(',')")

  # Stand both hands to resolve the round
  Eval "document.getElementById('btnStand').click()" | Out-Null
  Start-Sleep -Seconds 1
  $canStand2 = Eval "!document.getElementById('btnStand').disabled"
  if ($canStand2 -eq $true) { Eval "document.getElementById('btnStand').click()" | Out-Null }
  WaitPhase "betting" 25 | Out-Null
  Screenshot "08-split-resolved"
  Write-Host (Eval "JSON.stringify({bankroll: BJ.getState().bankroll, stats: BJ.getState().stats, history: BJ.getState().history})")

  Write-Host "=== TEST: DOUBLE DOWN ==="
  Eval @'
(function(){
  var shoe = createShoe();
  shoe.push({suit:"diamonds",rank:"2",value:2});    // dealerHole
  shoe.push({suit:"clubs",rank:"5",value:5});        // double-down draw (5th pop, for hand total 11+5=16)
  shoe.push({suit:"spades",rank:"6",value:6});       // player2
  shoe.push({suit:"hearts",rank:"7",value:7});       // dealerUp
  shoe.push({suit:"clubs",rank:"5",value:5});        // player1
  BJ.getState().shoe = shoe;
})();
'@ | Out-Null

  Eval "document.getElementById('btnRebet') && document.getElementById('btnRebet').style.display !== 'none' ? null : document.querySelector('.chip-25').click()" | Out-Null
  $betAmt = Eval "BJ.getState().bet.amount"
  if ($betAmt -lt 5) { Eval "document.querySelector('.chip-25').click()" | Out-Null }
  Eval "document.getElementById('btnDeal').click()" | Out-Null
  WaitPhase "playerTurn" 20 | Out-Null
  Screenshot "09-double-dealt"
  Write-Host (Eval "JSON.stringify({bankroll: BJ.getState().bankroll, hand: BJ.getState().playerHands[0].cards.map(c=>c.rank), bet: BJ.getState().playerHands[0].bet, doubleEnabled: !document.getElementById('btnDouble').disabled})")

  Eval "document.getElementById('btnDouble').click()" | Out-Null
  Start-Sleep -Seconds 3
  Screenshot "10-after-double"
  Write-Host (Eval "JSON.stringify({bankroll: BJ.getState().bankroll, hand: BJ.getState().playerHands[0].cards.map(c=>c.rank), bet: BJ.getState().playerHands[0].bet, status: BJ.getState().playerHands[0].status})")

  WaitPhase "betting" 25 | Out-Null
  Screenshot "11-double-resolved"
  Write-Host (Eval "JSON.stringify({bankroll: BJ.getState().bankroll, stats: BJ.getState().stats, history: BJ.getState().history})")

  $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", $cts).Wait()
}
finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $dataDir -ErrorAction SilentlyContinue
}
