const SYSTEMS = {
  deadlands:     { name: "Deadlands",       tag: "Weird West",        color: "#d4a574" },
  twilight2000:  { name: "Twilight: 2000",  tag: "Post-Apokalipszis", color: "#b8ba80" },
  starfinder2e:  { name: "Starfinder 2e",   tag: "Űropera",           color: "#a8b8ff" },
  cyberpunk_red: { name: "Cyberpunk RED",   tag: "Neon Disztópia",    color: "#ff2e88" },
};

const POINTS_MAP = [4, 3, 2, 1];
const SESSION_KEY = "detour_code";

let pollInterval = null;
let voteCountInterval = null;

// ============ Sortable list (pointer events — mouse + touch) ============

class SortableList {
  constructor(container) {
    this.container = container;
    this.dragEl = null;
    this.placeholder = null;
    this.onMoveRef = null;
    this.onUpRef = null;

    container.addEventListener("pointerdown", (e) => {
      const item = e.target.closest("[data-system]");
      if (item) this.startDrag(e, item);
    });
  }

  startDrag(e, item) {
    e.preventDefault();

    const rect = item.getBoundingClientRect();

    this.placeholder = document.createElement("div");
    this.placeholder.className = "rank-placeholder";
    this.placeholder.style.height = rect.height + "px";
    item.parentNode.insertBefore(this.placeholder, item);

    this.dragEl = item;
    item.classList.add("dragging");
    item.style.cssText = `
      position: fixed;
      width: ${rect.width}px;
      left: ${rect.left}px;
      top: ${rect.top}px;
      z-index: 100;
      pointer-events: none;
      margin: 0;
    `;

    this.offsetY = e.clientY - rect.top;

    this.onMoveRef = this.onMove.bind(this);
    this.onUpRef = this.onUp.bind(this);
    document.addEventListener("pointermove", this.onMoveRef, { passive: false });
    document.addEventListener("pointerup", this.onUpRef);
    document.addEventListener("pointercancel", this.onUpRef);
  }

  onMove(e) {
    e.preventDefault();
    this.dragEl.style.top = (e.clientY - this.offsetY) + "px";

    const items = [...this.container.querySelectorAll("[data-system]:not(.dragging)")];
    let inserted = false;

    for (const item of items) {
      const rect = item.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) {
        this.container.insertBefore(this.placeholder, item);
        inserted = true;
        break;
      }
    }
    if (!inserted) this.container.appendChild(this.placeholder);

    updateRankBadges();
  }

  onUp() {
    const el = this.dragEl;
    el.style.cssText = "";
    el.classList.remove("dragging");
    this.container.insertBefore(el, this.placeholder);
    this.placeholder.remove();
    this.dragEl = null;
    this.placeholder = null;

    document.removeEventListener("pointermove", this.onMoveRef);
    document.removeEventListener("pointerup", this.onUpRef);
    document.removeEventListener("pointercancel", this.onUpRef);

    updateRankBadges();
  }
}

// ============ Rank badge sync ============

function updateRankBadges() {
  document.querySelectorAll("#ranking-list [data-system]").forEach((item, i) => {
    item.querySelector(".rank-badge").textContent = i + 1;
    item.querySelector(".rank-pts").textContent = POINTS_MAP[i] + " pt";
  });
}

// ============ Build ranking list ============

function buildRankingList() {
  const list = document.getElementById("ranking-list");
  const ids = shuffle(Object.keys(SYSTEMS));

  ids.forEach((id, i) => {
    const sys = SYSTEMS[id];
    const item = document.createElement("div");
    item.className = `rank-item rank-${id}`;
    item.dataset.system = id;
    item.innerHTML = `
      <span class="rank-badge">${i + 1}</span>
      <span class="rank-handle">⠿⠿</span>
      <div class="rank-info">
        <strong class="rank-name">${sys.name}</strong>
        <span class="rank-tag">${sys.tag}</span>
      </div>
      <span class="rank-pts">${POINTS_MAP[i]} pt</span>
    `;
    list.appendChild(item);
  });

  new SortableList(list);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============ API calls ============

async function checkStatus(code) {
  try {
    const res = await fetch(`/api/status/${encodeURIComponent(code)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function submitVote() {
  const code = document.getElementById("code-input").value.trim();
  if (!code) { showError("Add meg a hozzáférési kódodat!"); return; }

  const ranking = [...document.querySelectorAll("#ranking-list [data-system]")]
    .map((el) => el.dataset.system);

  const btn = document.getElementById("submit-btn");
  btn.disabled = true;
  btn.textContent = "Küldés…";

  try {
    const res = await fetch("/api/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, ranking }),
    });

    if (res.ok) {
      sessionStorage.setItem(SESSION_KEY, code);
      const firstRanked = document.querySelector("#ranking-list [data-system]").dataset.system;
      showThemeFeedback(firstRanked);
      showResults(code);
      return;
    }

    const data = await res.json();

    if (res.status === 409) {
      sessionStorage.setItem(SESSION_KEY, code);
      const firstRanked = document.querySelector("#ranking-list [data-system]").dataset.system;
      showThemeFeedback(firstRanked);
      showResults(code);
    } else {
      showError(res.status === 404 ? "Érvénytelen kód." : (data.detail || "Hiba. Próbáld újra."));
      btn.disabled = false;
      btn.textContent = "Szavazok";
    }
  } catch {
    showError("Kapcsolódási hiba. Próbáld újra.");
    btn.disabled = false;
    btn.textContent = "Szavazok";
  }
}

function showError(msg) {
  const el = document.getElementById("vote-error");
  el.textContent = msg;
  el.classList.remove("hidden");
}

// ============ Themed submission feedback ============

function showThemeFeedback(systemId) {
  const creators = {
    deadlands: createCardEffect,
    twilight2000: createStaticEffect,
    starfinder2e: createSparkleEffect,
    cyberpunk_red: createGlitchEffect,
  };

  const creator = creators[systemId];
  if (creator) {
    const effect = creator();
    document.body.appendChild(effect);
    setTimeout(() => effect.remove(), 1800);
  }
}

function createCardEffect() {
  const container = document.createElement("div");
  container.style.cssText = "position: fixed; inset: 0; z-index: 2000; pointer-events: none;";

  const suits = ["♠", "♥", "♦", "♣"];
  for (let i = 0; i < 4; i++) {
    const card = document.createElement("div");
    card.className = "card-effect";
    card.textContent = suits[i];
    card.style.left = 10 + i * 25 + "%";
    card.style.animationDelay = i * 150 + "ms";
    container.appendChild(card);
  }

  return container;
}

function createStaticEffect() {
  const effect = document.createElement("div");
  effect.className = "static-effect";
  return effect;
}

function createSparkleEffect() {
  const container = document.createElement("div");
  container.style.cssText = "position: fixed; inset: 0; z-index: 2000; pointer-events: none;";

  for (let i = 0; i < 7; i++) {
    const sparkle = document.createElement("div");
    sparkle.className = "sparkle";
    sparkle.textContent = "✦";
    sparkle.style.left = Math.random() * 100 + "%";
    sparkle.style.top = Math.random() * 100 + "%";
    sparkle.style.animationDelay = i * 80 + "ms";
    container.appendChild(sparkle);
  }

  return container;
}

function createGlitchEffect() {
  const effect = document.createElement("div");
  effect.className = "glitch-effect";
  return effect;
}

// ============ Auto-refresh polling ============

function startAutoRefresh(code) {
  stopAutoRefresh();
  pollInterval = setInterval(() => {
    if (!document.hidden) {
      fetchAndRender(code, false);
    }
  }, 30000);
}

function stopAutoRefresh() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// ============ Vote counter (ranking section) ============

async function updateVoteCounter() {
  try {
    const res = await fetch("/api/vote-count");
    if (res.ok) {
      const data = await res.json();
      const el = document.getElementById("vote-counter");
      if (el) {
        el.textContent = `${data.votes_cast} / ${data.total_codes} szavazat beérkezett`;
      }
    }
  } catch {
    // Silently fail, not critical
  }
}

function startVoteCountPolling() {
  updateVoteCounter(); // Initial fetch
  voteCountInterval = setInterval(updateVoteCounter, 30000); // Poll every 30s
}

function stopVoteCountPolling() {
  if (voteCountInterval) {
    clearInterval(voteCountInterval);
    voteCountInterval = null;
  }
}

// ============ Results ============

async function showResults(code) {
  stopAutoRefresh();
  stopVoteCountPolling();
  document.getElementById("ranking-section").classList.add("hidden");
  const resultsSection = document.getElementById("results-section");
  resultsSection.classList.remove("hidden");
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });

  await fetchAndRender(code, true);
  startAutoRefresh(code);

  document.getElementById("refresh-btn").addEventListener("click", () => {
    fetchAndRender(code, false);
  });

  const handleVisibility = () => {
    if (document.hidden) {
      stopAutoRefresh();
    } else {
      startAutoRefresh(code);
    }
  };
  document.addEventListener("visibilitychange", handleVisibility);
}

async function fetchAndRender(code, isInitial = true) {
  const chart = document.getElementById("results-chart");

  if (isInitial) {
    chart.innerHTML = '<p class="chart-loading">Betöltés…</p>';
  }

  try {
    const res = await fetch(`/api/results/${encodeURIComponent(code)}`);
    if (!res.ok) {
      if (isInitial) {
        chart.innerHTML = '<p class="chart-error">Nem sikerült betölteni az eredményeket.</p>';
      }
      return;
    }
    const data = await res.json();
    document.getElementById("votes-count").innerHTML = `
      <p>${data.votes_cast} / ${data.total_codes} szavazat beérkezett</p>
      ${data.voted_labels.length > 0 ? `<p class="voted-list">Már szavazott: ${data.voted_labels.join(" · ")}</p>` : ""}
    `;
    renderChart(data.scores);
  } catch {
    if (isInitial) {
      chart.innerHTML = '<p class="chart-error">Kapcsolódási hiba.</p>';
    }
  }
}

function renderChart(scores) {
  const chart = document.getElementById("results-chart");
  const max = scores[0]?.points || 1;

  chart.innerHTML = scores.map((entry, i) => {
    const sys = SYSTEMS[entry.system];
    const pct = Math.round((entry.points / max) * 100);
    return `
      <div class="chart-row">
        <div class="chart-label">
          <span class="chart-rank">${i + 1}.</span>
          <span class="chart-name">${sys.name}</span>
        </div>
        <div class="chart-bar-wrap">
          <div class="chart-bar" style="--pct:${pct}%; background:${sys.color}"></div>
        </div>
        <span class="chart-pts">${entry.points} pt</span>
      </div>
    `;
  }).join("");

  requestAnimationFrame(() => {
    chart.querySelectorAll(".chart-bar").forEach((bar) => bar.classList.add("animate"));
  });
}

// ============ Reveal on scroll ============

function setupReveal() {
  const section = document.getElementById("ranking-section");
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        section.classList.add("revealed");
        observer.disconnect();
      }
    },
    { threshold: 0.12 }
  );
  observer.observe(section);
}

// ============ Init ============

document.addEventListener("DOMContentLoaded", async () => {
  buildRankingList();
  setupReveal();
  startVoteCountPolling();

  const savedCode = sessionStorage.getItem(SESSION_KEY);
  if (savedCode) {
    document.getElementById("code-input").value = savedCode;
    const status = await checkStatus(savedCode);
    if (status?.voted) {
      stopVoteCountPolling();
      showResults(savedCode);
      return;
    }
  }

  document.getElementById("submit-btn").addEventListener("click", submitVote);

  document.getElementById("code-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitVote();
  });
});
