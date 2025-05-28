# 🖥️ Task Monitor CLI

English terminal-based task monitoring CLI application. Integrates with [Task Master](https://github.com/taskmaster-ai/taskmaster) CLI tool to monitor tasks in real-time.

## 🚀 Features

- **Real-time English Task Monitoring** - Perfect English support with proper encoding
- **Status and Priority Filtering** - Filter tasks by progress status
- **Task Selection and Subtask Display** - View detailed subtasks of selected tasks
- **Recommended Next Task Display** - Recommendation system considering dependencies and priorities (v0.15.0 compatible)
- **Performance Optimization** - Efficient monitoring with minimal CPU usage
- **Comprehensive Progress Visualization** - Progress bars and task count statistics
- **Demo Mode Support** - Functionality testing available without Task Master

## 🔧 Recent Updates

- **v1.2.0**: Complete UI localization to English
  - All UI elements converted to English interface
  - English status, priority, and command displays
  - Improved user experience for international users
- **v1.1.1**: Recommended task parsing performance improvement
  - Priority use of `task-master list` command to prevent duplicate calls
  - Optimized recommended task information parsing logic
- **v1.1.0**: Task Master v0.15.0 output format compatibility improvement
  - `⚡ RECOMMENDED NEXT TASK ⚡` section parsing support
  - Multi-line description parsing improvement
  - Complexity information display added
  - Demo mode recommended task simulation added

## 📦 Installation Methods

### Method 1: Global NPM Installation (Recommended)

```bash
npm install -g task-monitor-cli
```

### Method 2: Direct Installation from GitHub

```bash
npm install -g git+https://github.com/charlie0421/task-monitor-cli.git
```

### Method 3: Git Submodule (Recommended for Team Projects)

```bash
# Add as a submodule in the main project
git submodule add https://github.com/charlie0421/task-monitor-cli.git tools/task-monitor
git submodule init && git submodule update
cd tools/task-monitor && npm install && cd ../..

# Add script to package.json
# "monitor": "node tools/task-monitor/src/index.js"
```

### Method 4: Local Development

```bash
git clone https://github.com/charlie0421/task-monitor-cli.git
cd task-monitor-cli
npm install
npm start
```

## 🎯 Usage

Run from the terminal with the following command:

```bash
task-monitor
```

Alternatively, run directly:

```bash
node src/index.js
```

## ⌨️ Keyboard Shortcuts

- `↑↓` - Select a task
- `f` - Filter by priority (high → medium → low → all)
- `s` - Filter by status (all → in progress → waiting → completed)
- `r` - Manual refresh
- `q` or `Ctrl+C` - Exit

## 🔧 Requirements

- **Node.js** 14.0.0 or higher
- **Task Master CLI** (Optional - runs in demo mode if not installed)

## 📊 UI Configuration

```
┌─ Task Monitor ─────────────────────────────┐
│ Header Information (Time, Filter, Progress, Task Count)      │
├───────────────────────────────────────────┤
│ Task List Table                            │
│                                           │
├─ 🔥 Recommended Next Task ──────────────────────┤
│ Recommended Task Information (3 lines)                       │
├─ Selected Task's Subtasks ──────────────────┤
│ Subtask Information (3 lines)                      │
├───────────────────────────────────────────┤
│ Keyboard Shortcuts Guide                          │
└───────────────────────────────────────────┘
```