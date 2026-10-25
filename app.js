"use strict";

const byId = (id) => document.getElementById(id);
const state = { screenings: [], movies: new Map() };
const dialog = byId("movie-dialog");

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
function metadata(movie) {
  return [movie.release_year && `${movie.release_year}年`, movie.countries,
    movie.runtime_minutes && `${movie.runtime_minutes}分`,
    movie.detail_director_name || movie.director_name].filter(Boolean).join(" / ");
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
function sessionGroups(rows) {
  const groups = new Map();
  [...rows].sort((a, b) => `${a.starts_on} ${a.theater_name} ${a.starts_at}`.localeCompare(`${b.starts_on} ${b.theater_name} ${b.starts_at}`, "ja")).forEach((row) => {
    const key = JSON.stringify([row.starts_on, row.theater_slug]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return [...groups.values()];
}
function sessionBlock(rows, includeLinks = false) {
  const first = rows[0];
  const block = element("div", null, "session-group");
  block.append(element("strong", `${dateLabel(first.starts_on)} · ${first.theater_name}`));
  block.append(element("p", [...new Set(rows.map((row) => row.starts_at.slice(0, 5)))].join(" / "), "times"));
  const features = [...new Set(rows.map((row) => row.feature_title).filter(Boolean))];
  if (features.length) block.append(element("p", features.join(" / "), "feature"));
  if (includeLinks) {
    const links = element("div", null, "links");
    const seen = new Set();
    for (const row of rows) {
      for (const [label, value] of [["公式情報", row.source_url], ["チケット", row.ticket_url], ["特集ページ", row.feature_url]]) {
        const node = link(label, value);
        if (node && !seen.has(node.href)) { seen.add(node.href); links.append(node); }
      }
    }
    block.append(links);
  }
  return block;
}
function showDetail(title) {
  const movie = state.movies.get(title) || { movie_title: title };
  const body = byId("detail-body");
  body.replaceChildren();
  const image = poster(movie, "detail-poster");
  if (image) body.append(image);
  const heading = element("h2", title);
  heading.id = "detail-title";
  body.append(heading);
  if (movie.title_original && movie.title_original !== title) body.append(element("p", movie.title_original, "muted"));
  body.append(element("p", metadata(movie), "metadata"));
  body.append(element("h3", "作品について"));
  body.append(element("p", movie.theater_synopsis || movie.synopsis || "作品の詳細は映画館の公式情報をご確認ください。"));
  if (movie.director_biography || movie.director_known_for) {
    body.append(element("h3", `監督：${movie.detail_director_name || movie.director_name || "監督情報"}`));
    if (movie.director_biography) body.append(element("p", movie.director_biography));
    try {
      const titles = JSON.parse(movie.director_known_for || "[]");
      if (Array.isArray(titles) && titles.length) body.append(element("p", `代表作：${titles.join(" / ")}`));
    } catch { /* Missing optional enrichment must not hide screenings. */ }
    const source = link("監督情報の出典", movie.director_source_url);
    if (source) body.append(source);
  }
  body.append(element("h3", "上映予定（選択中の条件）"));
  sessionGroups(filteredRows().filter((row) => row.movie_title === title)).forEach((rows) => body.append(sessionBlock(rows, true)));
  dialog.showModal();
  dialog.scrollTop = 0;
}
function filteredRows() {
  const query = byId("search").value.normalize("NFKC").toLocaleLowerCase("ja").trim();
  return state.screenings.filter((row) =>
    (!byId("date-filter").value || row.starts_on === byId("date-filter").value) &&
    (!byId("theater-filter").value || row.theater_slug === byId("theater-filter").value) &&
    (!query || row.movie_title.normalize("NFKC").toLocaleLowerCase("ja").includes(query)));
}
function render() {
  const rows = filteredRows();
  const movies = new Map();
  rows.forEach((row) => {
    if (!movies.has(row.movie_title)) movies.set(row.movie_title, []);
    movies.get(row.movie_title).push(row);
  });
  const cards = byId("cards");
  cards.replaceChildren();
  byId("count").textContent = `${movies.size}作品 / ${rows.length}上映 / ${new Set(rows.map((row) => row.theater_slug)).size}館`;
  byId("status").textContent = rows.length ? "" : "この条件の上映予定はありません。日付や映画館を変えてみてください。";
  for (const [title, sessions] of movies) {
    const movie = state.movies.get(title) || { movie_title: title };
    const card = element("article", null, "card");
    const button = element("button", null, "card-main");
    button.type = "button";
    button.setAttribute("aria-label", `${title}の詳細を見る`);
    button.addEventListener("click", () => showDetail(title));
    const wrap = element("div", null, "poster-wrap");
    wrap.append(poster(movie) || element("span", "上映手帖", "poster-placeholder"));
    const copy = element("div", null, "card-copy");
    copy.append(element("h3", title), element("p", metadata(movie), "metadata"));
    button.append(wrap, copy);
    card.append(button);
    const groups = sessionGroups(sessions);
    const preview = element("div", null, "card-sessions");
    groups.slice(0, 3).forEach((group) => preview.append(sessionBlock(group)));
    if (groups.length > 3) preview.append(element("p", `ほか${groups.length - 3}件の日付・映画館で上映`, "more-sessions"));
    const detail = element("button", "作品詳細・すべての上映予定 →", "detail-hint");
    detail.type = "button";
    detail.addEventListener("click", () => showDetail(title));
    card.append(preview, detail);
    cards.append(card);
  }
}
byId("close-detail").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => { if (event.target === dialog) {
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
}});
for (const id of ["date-filter", "theater-filter", "search"]) byId(id).addEventListener("input", render);
byId("reset").addEventListener("click", () => {
  for (const id of ["date-filter", "theater-filter", "search"]) byId(id).value = "";
  render();
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
    render();
  } catch {
    byId("count").textContent = "読み込みに失敗しました";
    byId("status").textContent = "上映情報を読み込めませんでした。時間をおいてページを再読み込みしてください。";
  }
}
load();
