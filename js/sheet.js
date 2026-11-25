// Выдвижное окно снизу: общее для настроек и подсказок.

import { h, icon } from "./util.js";

let current = null;

export function closeSheet() {
  if (!current) return;
  const { backdrop, onClose, opener } = current;
  current = null;
  backdrop.remove();
  document.body.classList.remove("sheet-open");
  try {
    opener?.focus?.();
  } catch {
    /* элемент мог исчезнуть */
  }
  onClose?.();
}

/**
 * Открывает окно и возвращает { body, close }: содержимое кладётся в body.
 * Одновременно открыто только одно окно.
 */
export function openSheet({ title, closeLabel, onClose, id = "sheet-title" }) {
  closeSheet();
  const opener = document.activeElement;
  const body = h("div", { class: "sheet-body" });
  const sheet = h(
    "div",
    { class: "sheet", role: "dialog", "aria-modal": "true", "aria-labelledby": id },
    h("header", { class: "sheet-head" }, h("h2", { id }, title), h("button", { class: "icon-btn ghost", type: "button", "aria-label": closeLabel, onclick: closeSheet }, icon("close"))),
    body
  );
  const backdrop = h("div", { class: "sheet-backdrop", onclick: (e) => e.target === backdrop && closeSheet() }, sheet);
  backdrop.addEventListener("keydown", (e) => e.key === "Escape" && closeSheet());
  document.body.append(backdrop);
  document.body.classList.add("sheet-open");
  current = { backdrop, onClose, opener };
  requestAnimationFrame(() => {
    backdrop.classList.add("show");
    sheet.querySelector(".sheet-head .icon-btn")?.focus();
  });
  return { body, close: closeSheet };
}

export const sheetOpen = () => !!current;
