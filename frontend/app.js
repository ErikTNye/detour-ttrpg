const SYSTEMS = {
  deadlands:     { name: "Deadlands",       tag: "Weird West",        color: "#d4a574" },
  twilight2000:  { name: "Twilight: 2000",  tag: "Post-Apokalipszis", color: "#b8ba80" },
  starfinder2e:  { name: "Starfinder 2e",   tag: "Űropera",           color: "#a8b8ff" },
  cyberpunk_red: { name: "Cyberpunk RED",   tag: "Neon Disztópia",    color: "#ff2e88" },
};

const POINTS_MAP = [4, 3, 2, 1];
const SESSION_KEY = "detour_code";

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
  const btn = document.getElementById("submit-btn");
  if (btn.disabled) return;

  clearError();

  const code = document.getElementById("code-input").value.trim();
  if (!code) { showError("Add meg a belépőkódod!"); return; }

  const ranking = [...document.querySelectorAll("#ranking-list [data-system]")]
    .map((el) => el.dataset.system);

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
      showResults(code);
      return;
    }

    const data = await res.json();

    if (res.status === 409) {
      // Already voted — still let them see results
      sessionStorage.setItem(SESSION_KEY, code);
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

function clearError() {
  const el = document.getElementById("vote-error");
  el.textContent = "";
  el.classList.add("hidden");
}

// ============ Results ============

async function showResults(code) {
  document.getElementById("ranking-section").classList.add("hidden");
  const resultsSection = document.getElementById("results-section");
  resultsSection.classList.remove("hidden");
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });

  await fetchAndRender(code);

  document.getElementById("refresh-btn").onclick = () => fetchAndRender(code);
}

async function fetchAndRender(code) {
  const chart = document.getElementById("results-chart");
  chart.innerHTML = '<p class="chart-loading">Betöltés…</p>';

  try {
    const res = await fetch(`/api/results/${encodeURIComponent(code)}`);
    if (!res.ok) {
      chart.innerHTML = '<p class="chart-error">Nem sikerült betölteni az eredményeket.</p>';
      return;
    }
    const data = await res.json();
    document.getElementById("votes-count").innerHTML = `
      <p>${data.votes_cast} / ${data.total_codes} szavazat beérkezett</p>
      ${data.voted_labels.length > 0 ? `<p class="voted-list">Már szavazott: ${data.voted_labels.join(" · ")}</p>` : ""}
    `;
    renderChart(data.scores);
  } catch {
    chart.innerHTML = '<p class="chart-error">Hálózati hiba.</p>';
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

  // Trigger CSS transition on next frame
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

  const savedCode = sessionStorage.getItem(SESSION_KEY);
  if (savedCode) {
    document.getElementById("code-input").value = savedCode;
    const status = await checkStatus(savedCode);
    if (status?.voted) {
      showResults(savedCode);
      return;
    }
  }

  document.getElementById("submit-btn").addEventListener("click", submitVote);

  // Allow Enter key in code input
  document.getElementById("code-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitVote();
  });
});
