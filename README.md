# TheftGuard

> **Next‑generation Power Monitoring & Theft Detection Dashboard**

**TheftGuard** takes raw current measurements from an ESP32‑based sensor and turns them into a polished, premium web experience. Whether you're a hobbyist tracking a 3D printer or a facility manager monitoring critical loads, TheftGuard delivers real‑time insights, automated alerts, and intelligent analytics—all wrapped in a modern, installable Progressive Web App (PWA).

---

## 🚀 Why TheftGuard?

- **Lightning‑fast updates** – live amperage/wattage readings stream into the browser as soon as they arrive.
- **Cost awareness** – readings are converted into kWh and estimated cost using user‑supplied pricing.
- **Smart automation** – define flexible rules that trigger email alerts when thresholds are exceeded for a set duration.
- **Rich analytics** – inspect daily patterns, spot anomalies, and understand hourly usage distributions.
- **Offline‑first PWA** – install on desktop or mobile; the app works even when the network drops or you’re offline.
- **Clean, responsive UI** – built with Bootstrap for layout and Chart.js for interactive visualizations.


## 📁 Project Structure

```text
TheftGuard_Web/
├── index.html               # Single‑page interface with multiple views and forms
├── script.js                # Core application logic and UI glue (navigation, settings)
├── phase2_4_functions.js    # Phase 2‑4 feature helpers (rules engine, analytics, PWA helpers)
├── style.css                # Custom stylesheet, responsive rules, and layout tweaks
├── manifest.json            # Web App Manifest (icons, display, theme color)
├── sw.js                    # Service worker for caching & background sync
├── README.md                # Comprehensive documentation (this file)
├── screenshot.png           # Example screenshot used in docs (optional)
```

Each JavaScript file is intentionally kept flat (no bundler) to make it easy to inspect and modify.


## 🛠️ Quick Start

1. **Clone the repository** to your local machine:
   ```bash
   git clone https://github.com/yourusername/theftguard.git
   cd TheftGuard_Web
   ```

2. **Configure Git (if not already)**:
   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "you@example.com"
   git remote add origin https://github.com/yourusername/theftguard.git
   ```

3. **Serve the files over HTTP** (required for service worker and PWA installation):
   ```bash
   python -m http.server 8000
   # or
   npx http-server -p 8000
   ```

4. **Open your browser** and visit:
   ```text
   http://localhost:8000
   ```

> 🔐 **Security Note**: Browsers require `https://` or `localhost` for service worker registration—avoid using `file://` URLs. For a production deployment, serve via HTTPS.


## 🧩 Detailed Features

### 📈 Real-Time Readings
- Displays instantaneous amperage and calculated wattage in the chosen units (A/W).
- Converts raw readings to kWh based on time intervals and user-provided cost per kWh.
- Supports dynamic unit switching without losing historical context.

### ⚙ Settings
- **kWh price**: enter your local utility rate (e.g. 0.12 USD).
- **Plot unit**: choose between amperes or watts for chart axes.
- **Email notifications**: provide one or more comma-separated addresses for rule alerts.
- **Duration granularity**: rules support durations from seconds to hours.

### 🔔 Rules Engine
- Add rules with a **threshold** (amps) and **duration** (seconds).
- Optionally convert threshold to current units based on selection, but rules are stored internally in base amperes for consistency.
- When a continuous sequence of readings exceeds the threshold for at least the duration, an email alert is queued via background sync.
- Rules persist in `localStorage`; deleting a rule removes its alert logic.

### 📊 Analytics & Charts
- **Usage patterns** chart displays each reading as a point over time. Hover to see exact values and costs.
- **Anomaly heatmap** groups readings by day/hour to highlight unusual spikes.
- **Hourly distribution** shows how readings fall across the 24‑hour day in a radial or bar chart.
- Placeholder messages appear when no data is available for a particular chart.
- Charts are destroyed and recreated when settings change to avoid stale canvas references.

### 📲 Progressive Web App (PWA)
- The `manifest.json` defines a minimal icon set, theme color, and display parameters.
- `sw.js` caches all static assets and uses the `stale-while-revalidate` strategy.
- Background sync is used for sending pending emails and readings when connectivity returns.
- Users receive an install prompt and can add the app to their home screen or desktop.

### 📦 Offline Support
- Core assets (HTML, CSS, JS, icons) are cached during service worker install.
- Failures to fetch readings or send emails are stored and retried via background sync.
- The app still functions in read-only mode while offline; new rules/analytics work with cached data.


## 🛠 Installation & Build

There is no build step—this is a purely static project. To deploy:
1. Copy files to any static hosting provider (GitHub Pages, Netlify, S3, etc.).
2. Ensure HTTPS is enabled to allow service worker registration.

For local development, use any static server as described above.


## 🧠 Architecture & Code Overview

- **Navigation**: `script.js` handles page switching by toggling `d-none` on section classes.
- **Data Model**: readings are stored in an in-memory array (`readings`), updated via `updateReadingDisplay` and persisted optionally via Firebase.
- **Rules Logic**: new rules are added through `createRuleElement` and tracked in `rules` array. Each reading triggers `checkRules`.
- **Analytics Calculations**: data aggregation functions (`computeUsagePatterns`, `computeAnomalyHeatmap`, `computeHourlyDistribution`) are in `phase2_4_functions.js`.
- **Charts**: `updateUsagePatternsChart`, `updateAnomalyHeatmapChart`, and `updateHourlyDistributionChart` manage Chart.js instances.
- **Utility Helpers**: functions for unit conversion (`displayValue`, `wattsToAmps`), debouncing updates, and localStorage serialization.

All functions include JSDoc-style comments for clarity.


## 💼 Example Configuration

```js
// settings object stored in localStorage
const settings = {
  costPerKwh: 0.15,
  plotUnit: 'w',       // 'a' for amps, 'w' for watts
  emailRecipients: 'user@example.com,admin@example.com'
};
// rule example
const rule = {
  id: 1,
  thresholdA: 2.5,    // stored in amps internally
  durationSec: 60,
};
```

Rules may be edited or removed using the UI. Analytics automatically convert thresholds based on `plotUnit`.


## 🧪 Testing & Validation

- Use the browser console to simulate readings:
  ```js
  addReading(3.2); // amps
  ```
- Validate rule triggering by adding readings above threshold for required duration.
- Check offline functionality by toggling network in DevTools and refreshing.
- Inspect service worker activity under `Application > Service Workers`.


## 🛡 Security Considerations

- The app runs entirely in the client; no sensitive data is stored.
- Email sending is simulated; integrating with a real backend (e.g., Firebase Functions, SMTP service) is recommended before production use.
- PWA caching strategies respect `.png`, `.js`, `.css`, and HTML files only; adapt `sw.js` if you add dynamic assets.


## 🤝 Contributing

All contributions are welcome. To get started:
1. **Fork** this repository on GitHub.
2. **Create a feature branch**:
   ```bash
   git checkout -b feature/cool-new-widget
   ```
3. **Commit your changes** with descriptive messages.
4. **Push** to your fork and open a pull request.

Please include screenshots or GIFs for UI changes and describe your testing steps.


## 📄 License

**MIT License** – use, modify, and distribute with attribution. See [LICENSE](./LICENSE) for full text.

---

_This project was handcrafted using vanilla JavaScript, Bootstrap, and Chart.js. It demonstrates that powerful web applications can be built without heavy frameworks._
