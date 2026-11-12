import { View, div } from "gpui-kit";
import { v_flex, h_flex, v_resizable, resizable_panel, Textarea, TextareaState } from "gpui-base";
import { spaces, machines, focused, shared, setShared, theme } from "herdr";
import { STATE_KEY, readState, contexts, getText, setText, pruneTabs, canEdit } from "./model.js";

const SCOPES = ["space", "tab"];
const FONT_MIN = 10, FONT_MAX = 28;

export default class Note extends View {
  init() {
    this.editors = {};
    this.closed = false;
    this.folded = { space: false, tab: false };
    this.sizes = [300, 300];
    this.fontSizes = { space: 13, tab: 13 };
    try {
      const saved = JSON.parse(localStorage.getItem("panel") ?? "null");
      if (saved?.folded) {
        for (const scope of SCOPES) this.folded[scope] = saved.folded[scope] === true;
      }
      if (Array.isArray(saved?.sizes) && saved.sizes.length === 2 && saved.sizes.every(n => Number.isFinite(n) && n >= 80)) {
        this.sizes = saved.sizes;
      }
      for (const scope of SCOPES) {
        const size = saved?.fontSizes?.[scope];
        if (Number.isInteger(size) && size >= FONT_MIN && size <= FONT_MAX) this.fontSizes[scope] = size;
      }
    } catch { /* A broken panel preference must not affect notes. */ }
    // Retained native state must be created in init, never during render.
    for (const scope of SCOPES) {
      const input = TextareaState.new({
        placeholder: scope === "space" ? "이 Space에 남겨둘 메모" : "이 탭에서 할 일과 메모",
      });
      input.set_soft_wrap(true);
      const editor = { input, context: null, text: "", syncing: false };
      this.editors[scope] = editor;
      input.on("change", (_event, cx) => this.edit(scope, editor, cx));
    }
  }

  preferences() {
    localStorage.setItem("panel", JSON.stringify({ folded: this.folded, sizes: this.sizes, fontSizes: this.fontSizes }));
  }

  sync(scope, context, state, liveSpaces, liveMachines) {
    const enabled = context && canEdit(context, liveSpaces, liveMachines);
    const editor = this.editors[scope];
    const changed = editor.context?.key !== (enabled ? context.key : undefined);
    if (changed && editor.context && editor.input.value() !== editor.text
      && canEdit(editor.context, liveSpaces, liveMachines)) state = this.persist(editor);
    editor.context = enabled ? context : null;
    const text = enabled ? getText(state, context) : "";
    // Native IME composition can precede change. An unrelated repaint must not reset it.
    if (changed || editor.text !== text) {
      editor.text = text;
      editor.syncing = true;
      try { editor.input.set_value(text); }
      finally { editor.syncing = false; }
    }
    return state;
  }

  persist(editor) {
    // Read at the moment of editing: another area/copy may have saved since render.
    const previous = readState(shared(STATE_KEY));
    const text = editor.input.value();
    const next = setText(previous, editor.context, text);
    if (next !== previous) setShared(STATE_KEY, next);
    editor.text = text;
    return next;
  }

  edit(scope, editor, cx) {
    if (this.closed || editor.syncing || !editor.context) return;
    const liveSpaces = spaces(), liveMachines = machines();
    const current = contexts(liveSpaces, focused())[scope];
    if (current?.key !== editor.context.key || !canEdit(current, liveSpaces, liveMachines)) return;
    try {
      this.persist(editor);
      this.error = null;
    } catch {
      this.error = "메모를 저장하지 못했습니다. 원본 저장 데이터를 확인하세요.";
    }
    cx.notify();
  }

  fontButton(scope, delta, colors) {
    const enabled = delta < 0 ? this.fontSizes[scope] > FONT_MIN : this.fontSizes[scope] < FONT_MAX;
    const title = scope === "space" ? "Space" : "Tab";
    return div().id(`note-${scope}-font-${delta < 0 ? "minus" : "plus"}`)
      .w(22).h(24).flex_none().flex().items_center().justify_center().rounded(4)
      .opacity(enabled ? 1 : 0.4)
      .when(enabled, el => el.cursor_pointer().hover(style => style.bg(colors.hover)))
      .accessibility_label(`${title} 글자 크기 ${delta < 0 ? "줄이기" : "늘리기"}`)
      .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
      .on_click((_event, cx) => {
        cx.stop_propagation();
        const next = Math.max(FONT_MIN, Math.min(FONT_MAX, this.fontSizes[scope] + delta));
        if (next === this.fontSizes[scope]) return;
        this.fontSizes[scope] = next;
        this.preferences();
        cx.notify();
      })
      .child(delta < 0 ? "−" : "+");
  }

  section(scope, context, colors) {
    const folded = this.folded[scope], editor = this.editors[scope];
    const title = scope === "space" ? "Space" : "Tab";
    return v_flex().id(`note-${scope}`).min_h(0).min_w(0)
      .when(!folded, el => el.size_full())
      .child(h_flex().id(`note-${scope}-toggle`).h(34).flex_none().px(10).gap(7).items_center()
        .bg(colors.chrome).cursor_pointer()
        .accessibility_label(`${title} 메모 ${folded ? "펼치기" : "접기"}`)
        .on_click((_event, cx) => {
          this.folded[scope] = !this.folded[scope];
          this.preferences();
          cx.notify();
        })
        .child(div().text_color(colors.dim).child(folded ? "▸" : "▾"))
        .child(div().font_semibold().child(title))
        .child(div().flex_1().min_w(0).truncate().text_color(colors.dim).child(context?.label ?? "선택 없음"))
        .child(this.fontButton(scope, -1, colors))
        .child(div().id(`note-${scope}-font-size`).w(22).flex_none().text_center().child(String(this.fontSizes[scope])))
        .child(this.fontButton(scope, 1, colors)))
      .when(!folded, el => el.child(editor.context
        ? v_flex().id(`note-${scope}-body`).flex_1().min_h(0).min_w(0).p(8)
          .child(Textarea.new(editor.input).w_full().h_full().min_h(0)
            .text_size(this.fontSizes[scope])
            .accessibility_label(`${title} 메모`))
        : div().flex_1().p(12).text_color(colors.dim)
          .child(context ? "연결이 준비되면 메모를 편집할 수 있습니다." : `${title}를 선택하세요.`)));
  }

  render() {
    const colors = /** @type {Record<string, import("gpui-kit").Color>} */ (theme());
    const liveSpaces = spaces(), liveMachines = machines();
    const selected = contexts(liveSpaces, focused());
    try {
      const previous = readState(shared(STATE_KEY));
      let state = pruneTabs(previous, liveSpaces, liveMachines);
      if (state !== previous) setShared(STATE_KEY, state);
      for (const scope of SCOPES) state = this.sync(scope, selected[scope], state, liveSpaces, liveMachines);
    } catch {
      for (const scope of SCOPES) this.editors[scope].context = null;
      return div().p(12).text_color(colors.foreground)
        .child("저장된 note 데이터 형식을 읽지 못했습니다. 원본을 보존하기 위해 편집을 중지했습니다.");
    }

    const root = v_flex().id("note").size_full().min_h(0).min_w(0)
      .bg(colors.surface).text_color(colors.foreground).text_size(13);
    if (this.folded.space || this.folded.tab) {
      for (const scope of SCOPES) {
        root.child(v_flex().min_h(0).when(!this.folded[scope], el => el.flex_1())
          .when(this.folded[scope], el => el.flex_none())
          .child(this.section(scope, selected[scope], colors)));
      }
    } else {
      root.child(v_resizable("note-sections").w_full().flex_1().min_h(0)
        .on_resize((sizes) => { this.sizes = sizes; this.preferences(); })
        .children(SCOPES.map((scope, index) => resizable_panel().size(this.sizes[index]).size_range(80)
          .child(this.section(scope, selected[scope], colors)))));
    }
    if (this.error) root.child(div().p(8).text_color(colors.blocked).child(this.error));
    return root;
  }

  async close() {
    this.closed = true;
    for (const scope of SCOPES) {
      const editor = this.editors[scope];
      try {
        if (editor.input.value() !== editor.text && canEdit(editor.context, spaces(), machines())) this.persist(editor);
      } catch {
        console.error("note: 종료 중 메모를 저장하지 못했습니다.");
      } finally { editor.input.release(); }
    }
    await localStorage.flush();
  }
}
