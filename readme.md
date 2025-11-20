
# GitHub Watcher Bot (Tenjiku Core Edition)

A premium, production-grade **GitHub Repository Watcher Bot** for Discord — built with advanced embeds, commit grouping, role tagging, padded box UI, and Tenjiku Core branding.

---

## 🚀 Features

### **✓ Premium Dark Embeds**
- Modern GitHub-style dark theme  
- Sharp-edged padded info box  
- Avatar-based branding  
- Fully responsive layout  
- Clean metadata blocks  

---

### **✓ Repository Watcher**
Automatically detects:
- New repositories created by a user  
- New releases  
- New commits on default branch  
- Repo metadata, tags, topics, stats  

---

### **✓ Commit Grouping (Anti-Spam)**
Commits pushed within **10 seconds** are grouped into **one premium embed**:

```
┌──────────────────────────────────────────┐
│ Repository: owner/repo                   │
│ Branch: main                             │
│ Commits: 8                               │
│                                          │
│ • abc12d — fixed bug                     │
│ • f91aa2 — added routing                 │
│ • ...                                    │
└──────────────────────────────────────────┘
```

No channel spam. No flooding. Clean & elegant.

---

### **✓ Role Tagging**
Optional commit-role ping via `.env`:

```
COMMIT_ROLE_ID=1234567890123
```

Only commit announcements get tagged.

---

### **✓ Buttons / Actions**
Each embed includes:

- **Open on GitHub**
- **Clone Repository**
- **Download ZIP**
- **View Commits**

---

### **✓ Padded Info Boxes**
Every embed includes a smooth, clean padded box:

```
┌────────────────────────────────────────┐
│ Repository: NxT_Payments               │
│ Language: JavaScript                   │
│ Stars: 12                              │
│                                        │
│ Description:                           │
│ A modern Discord payment system bot... │
└────────────────────────────────────────┘
```

---

### **✓ Tenjiku Core Branding**
Each embed is watermarked with:

```
Tenjiku Core — GitHub Watcher · Powered by Tenjiku Core (TJK)
```

with your custom icon.

---

## 📦 Installation

```bash
git clone https://github.com/Karthixn/GitHub-Watcher-Bot.git
cd GitHub-Watcher-Bot
npm install
```

---

## ⚙️ Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

### Fill in required values:

```
DISCORD_TOKEN=your_discord_token
CLIENT_ID=discord_application_id
GUILD_ID=server_id_for_dev(optional)
POLL_INTERVAL_SECONDS=120
DEFAULT_ANNOUNCE_CHANNEL_ID=channel_id

# Role ping for commits only
COMMIT_ROLE_ID=optional_role_id
```

---

## 🧩 Slash Commands

### **Add a GitHub user watcher**

Monitors for *new repositories*.

```
/watch add_user username:karthixn
```

---

### **Add a repository watcher**

Monitors **releases + commits**.

```
/watch add_repo repo:owner/repo
```

Examples:

```
/watch add_repo repo:karthixn/NxT_Payments
/watch add_repo repo:torvalds/linux
```

---

### **Remove a watcher**
```
/watch remove id:repo:karthixn/NxT_Payments
```

---

### **List watchers**
```
/watch list
```

---

## 🚀 Running the Bot

### Register commands:
```bash
npm run register-commands
```

### Start the bot:
```bash
node index.js
```

---

## 🛠️ Technologies Used
- Node.js (ESM)
- Discord.js v14
- GitHub API (REST)
- LowDB v5
- node-fetch
- Action Buttons / Modern UI
- Unicode-based padded box rendering

---

## 🛡️ Anti-Spam / Abuse Safe
- Commit grouping window (10 seconds)  
- Debounce commit announcements  
- Rate-limit safe API usage  
- Auto-skip invalid repos  
- Per-repo scoped watchers  

---

## 🧪 Tested On
- Windows 10 / 11  
- Ubuntu 20+  
- Node.js v20 / v22 / v24  
- Discord.js v14  

---

## 🖋️ Credits
Developed and designed for **Tenjiku Core (TJK)**  
with a focus on quality UI, performance, and clean automation.

---

## 📄 License
MIT License (2025) — You may modify and distribute freely.

---

## 🤝 Support
Need custom features, UI changes, or automation extensions?  
This bot was designed to be fully expandable.

---

Enjoy your GitHub automation — **Tenjiku Core style**.
