# 🧪 Understanding the `.test` Folder

> **For new developers:** This guide explains what the test scripts do, why they exist, and how they work — step by step with diagrams!

---

## 📁 What's In This Folder?

```
.test/
├── cdp-test.ps1      ← Test script #1: Basic gameplay (Bet → Deal → Hit → Stand)
├── cdp-test2.ps1     ← Test script #2: Advanced gameplay (Split & Double Down)
└── shots/            ← Screenshots taken during tests (visual proof it works!)
    ├── 01-initial.png
    ├── 02-dealt.png
    ├── 03-after-hit.png
    ├── ...and more
```

---

## 🤔 What Is a "Test" and Why Do We Need One?

A **test** is code that plays your game automatically to make sure it works correctly. Instead of you manually clicking buttons every time you change something, the test does it for you!

Think of it like a robot that:
1. Opens your game in a browser
2. Clicks buttons (bet, deal, hit, stand)
3. Checks that the game responds correctly
4. Takes screenshots as proof

---

## 🔧 What Is "CDP"?

CDP stands for **Chrome DevTools Protocol**. It's a way for code to **remote-control** a web browser. The test scripts use it to control Microsoft Edge like a puppet!

```mermaid
graph LR
    A[PowerShell Script] -->|sends commands via CDP| B[Edge Browser]
    B -->|runs your Blackjack game| C[index.html]
    B -->|sends back results| A
    A -->|saves| D[Screenshots in /shots]
```

---

## 🏗️ How the Test Infrastructure Works

```mermaid
flowchart TD
    subgraph SETUP["⚙️ Setup Phase"]
        A[Launch Edge in Headless Mode] --> B[Connect via WebSocket]
        B --> C[Find the Blackjack page target]
    end

    subgraph PLAY["🎮 Test Phase"]
        C --> D[Send JavaScript commands]
        D --> E[Click buttons / Read game state]
        E --> F[Take screenshots]
        F --> G{More actions?}
        G -->|Yes| D
        G -->|No| H[Close connection]
    end

    subgraph CLEANUP["🧹 Cleanup Phase"]
        H --> I[Close Edge]
        I --> J[Delete temp profile folder]
    end
```

---

## 📝 Test Script #1: `cdp-test.ps1` — Basic Gameplay

This script tests a normal round of Blackjack: betting, dealing, hitting, and standing.

### Step-by-Step Flow

```mermaid
sequenceDiagram
    participant PS as PowerShell Script
    participant Edge as Edge Browser
    participant Game as Blackjack Game

    Note over PS: 🚀 SETUP
    PS->>Edge: Launch in headless mode (invisible)
    PS->>Edge: Connect via WebSocket (CDP)

    Note over PS: 📸 Screenshot: 01-initial
    PS->>Game: Check initial bankroll

    Note over PS: 💰 PLACE BET
    PS->>Game: Click $25 chip (twice = $50 bet)
    PS->>Game: Click "Deal" button

    Note over PS: ⏳ Wait for cards to be dealt...
    Game-->>PS: Phase = "playerTurn"

    Note over PS: 📸 Screenshot: 02-dealt
    PS->>Game: Read player cards & dealer's face-up card
    PS->>Game: Read odds badge

    Note over PS: 👊 HIT
    PS->>Game: Click "Hit" button

    Note over PS: 📸 Screenshot: 03-after-hit
    PS->>Game: Read updated hand & odds

    Note over PS: 🖐️ STAND
    PS->>Game: Click "Stand" button

    Note over PS: ⏳ Wait for dealer to play & round to finish...
    Game-->>PS: Phase = "betting"

    Note over PS: 📸 Screenshot: 04-after-stand-result
    PS->>Game: Read final bankroll, dealer cards, stats

    Note over PS: 📸 Screenshot: 05-back-to-betting
    PS->>Game: Check history table & stats row
    PS->>Game: Check for console errors

    Note over PS: 🧹 CLEANUP
    PS->>Edge: Close WebSocket
    PS->>Edge: Kill Edge process
```

### What It Checks

| Step | What It Verifies |
|------|-----------------|
| Initial state | Game loads with correct bankroll |
| Bet & Deal | Clicking chips and Deal button works |
| Player Turn | Cards are dealt, phase changes correctly |
| Hit | Player receives a card, odds update |
| Stand | Dealer plays, round resolves, bankroll updates |
| History | Results are recorded in the history table |
| Errors | No JavaScript errors occurred |

---

## 📝 Test Script #2: `cdp-test2.ps1` — Split & Double Down

This script tests **advanced moves** that are harder to test manually because you need specific card combinations.

### 🃏 The "Rigged Deck" Trick

To test a Split, you need two cards of the same rank. To test Double Down, you need a hand totaling 11. The script **rigs the shoe** (deck) by pushing specific cards onto the top:

```mermaid
flowchart LR
    subgraph SHOE["🂠 Rigged Shoe (stack - last in, first out)"]
        direction TB
        A["8♣ ← dealt 1st (player card 1)"]
        B["6♥ ← dealt 2nd (dealer face-up)"]
        C["8♠ ← dealt 3rd (player card 2)"]
        D["2♦ ← dealt 4th (dealer hole card)"]
    end

    SHOE --> E["Player gets: 8♣ + 8♠ = a PAIR!"]
    E --> F["Split button becomes available ✅"]
```

### Split Test Flow

```mermaid
sequenceDiagram
    participant PS as PowerShell Script
    participant Game as Blackjack Game

    Note over PS: 🃏 Rig the deck with a pair of 8s
    PS->>Game: Inject cards into shoe

    PS->>Game: Bet $50, click Deal
    Game-->>PS: Player has 8♣ + 8♠ (a pair!)

    Note over PS: 📸 Screenshot: 06-split-pair-dealt
    PS->>Game: Verify Split button is enabled

    PS->>Game: Click "Split" button
    Note over Game: Hand splits into TWO hands!
    Note over Game: Each hand gets one new card

    Note over PS: 📸 Screenshot: 07-after-split
    PS->>Game: Verify two separate hands exist
    PS->>Game: Verify bankroll decreased (split costs extra bet)

    PS->>Game: Stand on hand 1
    PS->>Game: Stand on hand 2
    Note over Game: Dealer plays, both hands resolve

    Note over PS: 📸 Screenshot: 08-split-resolved
    PS->>Game: Check final bankroll & stats
```

### Double Down Test Flow

```mermaid
sequenceDiagram
    participant PS as PowerShell Script
    participant Game as Blackjack Game

    Note over PS: 🃏 Rig deck for an 11-value hand (5+6)
    PS->>Game: Inject cards into shoe

    PS->>Game: Bet, click Deal
    Game-->>PS: Player has 5♣ + 6♠ = 11

    Note over PS: 📸 Screenshot: 09-double-dealt
    PS->>Game: Verify Double button is enabled

    PS->>Game: Click "Double Down" button
    Note over Game: Bet is doubled!
    Note over Game: Player gets exactly ONE more card
    Note over Game: Hand automatically stands

    Note over PS: 📸 Screenshot: 10-after-double
    PS->>Game: Verify bet was doubled
    PS->>Game: Verify hand has exactly 3 cards

    Note over Game: Dealer plays, round resolves

    Note over PS: 📸 Screenshot: 11-double-resolved
    PS->>Game: Check final bankroll & stats
```

---

## 🖥️ Key Concepts Explained

### Headless Browser

```mermaid
graph TD
    A[Normal Browser] -->|has| B[Visible window you can see]
    C[Headless Browser] -->|NO window| D[Runs invisibly in background]
    C -->|still loads| E[All HTML, CSS, JavaScript]
    C -->|can still| F[Take screenshots]
```

The `--headless=new` flag tells Edge to run without showing a window. The game still loads and works — you just can't see it! The test takes screenshots so you can see what happened.

### WebSocket Connection

```mermaid
graph LR
    A[Script] <-->|"Two-way connection (WebSocket)"| B[Browser]

    A -->|"Send: 'click this button'"| B
    B -->|"Reply: 'done, here's the result'"| A
```

A WebSocket is like a phone call between the script and the browser — both sides can talk at any time. This is how the script sends commands and gets responses.

### The `Send-CDP` Function

This is the heart of the test. It:
1. Packages a command as JSON
2. Sends it to Edge via WebSocket
3. Waits for and returns the response

### The `Eval` Function

A shortcut that runs JavaScript inside the browser page. For example:
- `Eval "document.getElementById('btnHit').click()"` → clicks the Hit button
- `Eval "BJ.getState().phase"` → reads what phase the game is in

### The `Screenshot` Function

Takes a picture of the browser page and saves it as a PNG file in the `shots/` folder.

---

## 📸 Screenshots Produced

The `shots/` folder contains visual evidence from each test run:

| Screenshot | What It Shows |
|-----------|---------------|
| `01-initial.png` | Game loaded, ready to bet |
| `02-dealt.png` | Cards dealt, player's turn |
| `03-after-hit.png` | After player hits |
| `04-after-stand-result.png` | Round result after standing |
| `05-back-to-betting.png` | Back to betting phase |
| `06-split-pair-dealt.png` | Pair of 8s dealt (ready to split) |
| `07-after-split.png` | After splitting into two hands |
| `08-split-resolved.png` | Split round finished |
| `09-double-dealt.png` | Hand of 11 dealt (ready to double) |
| `10-after-double.png` | After doubling down |
| `11-double-resolved.png` | Double down round finished |

---

## 🔄 Overall Test Architecture

```mermaid
flowchart TB
    subgraph Tests["Test Scripts"]
        T1[cdp-test.ps1<br/>Basic: Bet → Deal → Hit → Stand]
        T2[cdp-test2.ps1<br/>Advanced: Split & Double Down]
    end

    subgraph Tech["Technology Stack"]
        PS[PowerShell<br/>Script language]
        CDP[Chrome DevTools Protocol<br/>Browser remote control]
        WS[WebSocket<br/>Two-way communication]
        Edge[Microsoft Edge<br/>Headless browser]
    end

    subgraph Game["Your Blackjack Game"]
        HTML[index.html]
        JS[JavaScript game logic]
        UI[User Interface]
    end

    subgraph Output["Test Output"]
        SHOTS[Screenshots<br/>.test/shots/*.png]
        CONSOLE[Console messages<br/>Pass/fail info]
    end

    T1 & T2 --> PS
    PS --> CDP
    CDP --> WS
    WS --> Edge
    Edge --> HTML
    HTML --> JS & UI
    T1 & T2 --> SHOTS & CONSOLE
```

---

## 💡 Summary for New Developers

| Question | Answer |
|----------|--------|
| **What language are the tests in?** | PowerShell (`.ps1` files) — a scripting language built into Windows |
| **Why not just test manually?** | Tests can run automatically every time you change code, catching bugs instantly |
| **What does "headless" mean?** | The browser runs without a visible window (like a background process) |
| **What is CDP?** | Chrome DevTools Protocol — lets code control a browser remotely |
| **Why rig the deck?** | To test specific scenarios (like splits) that would be random otherwise |
| **What are the screenshots for?** | Visual proof that the game looked correct at each step |
| **Do I need to run these?** | They've already been run! The screenshots in `shots/` are the results |

---

## 🚀 How to Run the Tests Yourself

1. Open **PowerShell** on Windows
2. Navigate to your project folder: `cd C:\Users\chris\GitHub_Projects\Blackjack`
3. Run: `.\.test\cdp-test.ps1` (basic test)
4. Run: `.\.test\cdp-test2.ps1` (advanced test)
5. Check the `.test\shots\` folder for new screenshots!

> ⚠️ **Note:** You need Microsoft Edge installed, and the file paths in the scripts need to match your computer's setup.
