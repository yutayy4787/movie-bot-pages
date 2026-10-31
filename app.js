"use strict";

const byId = (id) => document.getElementById(id);
const state = { screenings: [], movies: new Map(), loaded: false };

// External data is always rendered as text, never as HTML.
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}
function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
function link(label, value) {
  const url = safeUrl(value);
  if (!url) return null;
  const node = element("a", label);
  node.href = url;
  node.target = "_blank";
  node.rel = "noopener noreferrer";
  return node;
}
function dateLabel(value) {
  const day = new Date(`${value}T12:00:00+09:00`);
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo" }).format(day);
}
function movieLabel(title) {
  const movie = state.movies.get(title);
  const director = (movie?.detail_director_name || movie?.director_name || "").trim();
  return director ? `${title}（${director}）` : title;
}
function detailLink(title, text, className) {
  const node = element("a", text, className);
  node.href = `#movie=${encodeURIComponent(title)}`;
  return node;
}
function metadata(movie) {
  return [movie.release_year && `${movie.release_year}年`, movie.countries,
    movie.runtime_minutes && `${movie.runtime_minutes}分`].filter(Boolean).join(" / ");
}
function poster(movie, className) {
  const url = safeUrl(movie.poster_url);
  if (!url) return null;
  const img = element("img", null, className);
  img.src = url;
  img.alt = `${movie.movie_title}のポスター`;
  img.loading = "lazy";
  img.referrerPolicy = "no-referrer";
  img.addEventListener("error", () => img.remove());
  return img;
}
function matchesQuery(title) {
  const query = byId("search").value.normalize("NFKC").toLocaleLowerCase("ja").trim();
  const movie = state.movies.get(title);
  const text = [title, movie?.title_original, movie?.detail_director_name, movie?.director_name].filter(Boolean).join(" ");
  return !query || text.normalize("NFKC").toLocaleLowerCase("ja").includes(query);
}
function filteredRows() {
  return state.screenings.filter((row) =>
    (!byId("date-filter").value || row.starts_on === byId("date-filter").value) &&
    (!byId("theater-filter").value || row.theater_slug === byId("theater-filter").value) &&
    matchesQuery(row.movie_title));
}
function renderMovies() {
  // Movie introductions cover every exported film, independently of calendar filters.
  const titles = [...new Set([...state.screenings.map((row) => row.movie_title), ...state.movies.keys()])].filter(matchesQuery);
  const list = byId("movie-list");
  list.replaceChildren();
  byId("count").textContent = `${titles.length}作品`;
  byId("status").textContent = titles.length ? "" : "該当する作品はありません。検索条件を変えてみてください。";
  for (const title of titles) {
    const movie = state.movies.get(title) || { movie_title: title };
    const article = element("article", null, "movie-entry");
    article.id = `movie=${encodeURIComponent(title)}`;
    const heading = element("h3", null, "movie-title");
    heading.id = `title=${encodeURIComponent(title)}`;
    heading.tabIndex = -1;
    heading.append(detailLink(title, movieLabel(title)));
    article.setAttribute("aria-labelledby", heading.id);
    const wrap = element("div", null, "poster-wrap");
    const placeholder = element("span", "上映手帖", "poster-placeholder");
    const image = poster(movie, "movie-poster");
    placeholder.hidden = Boolean(image);
    wrap.append(placeholder);
    if (image) {
      image.addEventListener("error", () => { placeholder.hidden = false; });
      wrap.append(image);
    }
    const copy = element("div", null, "movie-copy");
    copy.append(heading);
    if (movie.title_original && movie.title_original !== title) copy.append(element("p", movie.title_original, "original-title"));
    const info = metadata(movie);
    if (info) copy.append(element("p", info, "metadata"));
    copy.append(element("h4", "作品について"), element("p", movie.theater_synopsis || movie.synopsis || "作品の詳細は映画館の公式情報をご確認ください。", "synopsis"));
    if (movie.director_biography || movie.director_known_for) {
      const director = element("section", null, "director-info");
      director.append(element("h4", `監督：${movie.detail_director_name || movie.director_name || "監督情報"}`));
      if (movie.director_biography) director.append(element("p", movie.director_biography));
      try {
        const knownFor = JSON.parse(movie.director_known_for || "[]");
        if (Array.isArray(knownFor) && knownFor.length) director.append(element("p", `代表作：${knownFor.join(" / ")}`, "known-for"));
      } catch { /* Missing optional enrichment must not hide the introduction. */ }
      const source = link("監督情報の出典 ↗", movie.director_source_url);
      if (source) director.append(source);
      copy.append(director);
    }
    article.append(wrap, copy);
    list.append(article);
  }
}
function renderPage({ focusTarget = false } = {}) {
  const isSchedule = location.hash === "#schedule";
  const hasTarget = location.hash.startsWith("#movie=");
  byId("movies-page").hidden = isSchedule;
  byId("schedule-page").hidden = !isSchedule;
  byId("date-control").hidden = !isSchedule;
  byId("theater-control").hidden = !isSchedule;
  byId("filters").setAttribute("aria-label", isSchedule ? "上映予定の絞り込み" : "作品紹介の検索");
  byId("results").textContent = isSchedule ? "上映スケジュール" : "作品紹介";
  for (const name of ["movies", "schedule"]) {
    if (name === (isSchedule ? "schedule" : "movies")) byId(`${name}-link`).setAttribute("aria-current", "page");
    else byId(`${name}-link`).removeAttribute("aria-current");
  }
  if (!state.loaded) return;
  let title;
  if (hasTarget) {
    try { title = decodeURIComponent(location.hash.slice(7)); } catch { title = location.hash.slice(7); }
    // A calendar link or bookmarked film must remain reachable despite a previous search.
    if (focusTarget && !matchesQuery(title)) byId("search").value = "";
  }
  if (isSchedule) {
    const rows = filteredRows();
    renderCalendar(rows);
    byId("count").textContent = `${new Set(rows.map((row) => row.movie_title)).size}作品 / ${rows.length}上映 / ${new Set(rows.map((row) => row.theater_slug)).size}館`;
    byId("status").textContent = rows.length ? "" : "この条件の上映予定はありません。日付や映画館を変えてみてください。";
  } else {
    renderMovies();
    if (hasTarget && focusTarget) {
      const target = byId(`movie=${encodeURIComponent(title)}`);
      if (target) {
        target.scrollIntoView({ block: "start" });
        byId(`title=${encodeURIComponent(title)}`).focus({ preventScroll: true });
      } else {
        byId("status").textContent = "指定された作品は掲載されていません。作品一覧から探してください。";
      }
    }
  }
}
window.addEventListener("hashchange", () => {
  renderPage({ focusTarget: true });
  if (!location.hash.startsWith("#movie=")) byId("results").focus();
});
function renderCalendar(rows) {
  const calendar = byId("calendar");
  calendar.replaceChildren();
  const theaters = new Map(state.screenings.filter((row) => !byId("theater-filter").value || row.theater_slug === byId("theater-filter").value).map((row) => [row.theater_slug, row.theater_name]));
  const days = [...new Set(rows.map((row) => row.starts_on))].sort();
  for (const day of days) {
    const dayRows = rows.filter((row) => row.starts_on === day);
    const entries = dayRows.map((row) => ScreeningCalendar.entry(row, state.movies.get(row.movie_title)));
    const start = Math.min(9 * 60, Math.floor(Math.min(...entries.map((entry) => entry.start)) / 60) * 60);
    const end = Math.max(22 * 60, Math.ceil(Math.max(...entries.map((entry) => entry.end)) / 60) * 60);
    const section = element("section", null, "calendar-day");
    section.append(element("h3", `${day.slice(0, 4)}年 ${dateLabel(day)}`));
    const scroll = element("div", null, "calendar-scroll");
    scroll.tabIndex = 0;
    scroll.setAttribute("role", "region");
    scroll.setAttribute("aria-label", `${dateLabel(day)}の上映時間割（横スクロール可能）`);
    const grid = element("div", null, "calendar-grid");
    grid.style.gridTemplateColumns = `64px repeat(${theaters.size}, minmax(220px, 1fr))`;
    grid.append(element("div", "時刻", "calendar-corner"));
    for (const name of theaters.values()) grid.append(element("div", name, "calendar-theater"));
    const axis = element("div", null, "calendar-axis");
    axis.style.height = `${(end - start) * 2}px`;
    for (let minute = start; minute < end; minute += 60) {
      const tick = element("span", ScreeningCalendar.timeLabel(minute));
      tick.style.top = `${(minute - start) * 2}px`;
      axis.append(tick);
    }
    grid.append(axis);
    for (const [slug] of theaters) {
      const column = element("div", null, "calendar-column");
      column.style.height = `${(end - start) * 2}px`;
      const sessions = ScreeningCalendar.layout(entries.filter((entry) => entry.row.theater_slug === slug));
      if (!sessions.length) column.append(element("p", "上映予定なし", "calendar-empty"));
      for (const session of sessions) {
        const button = detailLink(session.row.movie_title, null, `calendar-event${session.knownDuration ? "" : " duration-unknown"}`);
        const label = movieLabel(session.row.movie_title);
        const time = `${ScreeningCalendar.timeLabel(session.start)}${session.knownDuration ? `–${ScreeningCalendar.timeLabel(session.end)}頃` : "〜 終了未定"}`;
        button.append(element("span", time, "event-time"), element("strong", label));
        if (session.row.feature_title) button.append(element("span", session.row.feature_title, "event-feature"));
        button.setAttribute("aria-label", `${session.row.theater_name} ${time} ${label}の詳細を見る`);
        button.title = `${time} ${label}`;
        button.style.top = `${(session.start - start) * 2}px`;
        button.style.height = `${(session.end - session.start) * 2}px`;
        button.style.left = `calc(${session.lane / session.lanes * 100}% + 3px)`;
        button.style.width = `calc(${100 / session.lanes}% - 6px)`;
        column.append(button);
      }
      grid.append(column);
    }
    scroll.append(grid);
    section.append(scroll);
    calendar.append(section);
  }
}
for (const id of ["date-filter", "theater-filter", "search"]) byId(id).addEventListener("input", () => renderPage());
byId("reset").addEventListener("click", () => {
  for (const id of ["date-filter", "theater-filter", "search"]) byId(id).value = "";
  renderPage();
});

async function load() {
  try {
    const response = await fetch("./screenings.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.screenings) || !Array.isArray(data.movies)) throw new Error("Invalid schedule data");
    state.screenings = data.screenings;
    state.movies = new Map(data.movies.map((movie) => [movie.movie_title, movie]));
    for (const day of [...new Set(state.screenings.map((row) => row.starts_on))].sort()) {
      const option = element("option", dateLabel(day)); option.value = day; byId("date-filter").append(option);
    }
    const theaters = new Map(state.screenings.map((row) => [row.theater_slug, row.theater_name]));
    for (const [slug, name] of theaters) {
      const option = element("option", name); option.value = slug; byId("theater-filter").append(option);
    }
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
    const dates = [...new Set(state.screenings.map((row) => row.starts_on))].sort();
    byId("date-filter").value = dates.find((day) => day >= today) || dates[0] || "";
    byId("updated").textContent = `最終更新：${new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(new Date(data.generated_at))}（日本時間）`;
    if (dates.length && dates[dates.length - 1] < today) byId("updated").textContent += " · 更新が止まっています。掲載中の予定はすべて過去の情報です。";
    for (const id of ["date-filter", "theater-filter", "search", "reset"]) byId(id).disabled = false;
    state.loaded = true;
    renderPage({ focusTarget: true });
  } catch {
    byId("count").textContent = "読み込みに失敗しました";
    byId("status").textContent = "上映情報を読み込めませんでした。時間をおいてページを再読み込みしてください。";
  }
}
renderPage();
load();
