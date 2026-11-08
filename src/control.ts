// Copyright (c) 2026, Avunu LLC and contributors
// For license information, please see license.txt

/**
 * Replaces Frappe's Quill-based `Text Editor` field control with the
 * frappe-ui editor.
 *
 * It keeps the contract the rest of the desk relies on: values are saved
 * wrapped as Quill saves them (`html.ts`), `parse` strips scripts, the field
 * goes read-only with the form, and the toolbar is hidden in grid rows.
 */

import { createApp, h, reactive, type App } from "vue";
import FrappeEditor from "./FrappeEditor.vue";
import { fromFrappe, toFrappe } from "./html";
import { PORTAL_TARGET_KEY, SCOPE_CLASS, portalHost } from "./scope";
import { uploadTarget } from "./upload";

/** Same wait Frappe's Quill control uses before writing to the model. */
const COMMIT_DELAY = 300;

interface EditorState {
	content: string;
	placeholder: string;
	editable: boolean;
	toolbar: boolean;
	maxHeight: string;
}

export function installTextEditorControl(): void {
	class ControlTextEditor extends frappe.ui.form.ControlCode {
		/** The HTML in the model; BaseControl leaves a control's value untyped. */
		declare value?: string | null;
		// `declare`: Frappe's constructor calls `refresh()` -- which builds the
		// editor -- from inside `super()`, and a plain field declaration would be
		// re-initialised afterwards, wiping what was just set.
		declare editor_app?: App;
		declare editor_root?: HTMLElement;
		declare editor_state?: EditorState;
		declare editor_vm?: { focus(): void } | null;
		/** The value Frappe should see: the model's, until the user edits. */
		declare current: string;
		declare commit_timer?: ReturnType<typeof setTimeout>;

		make_input() {
			this.has_input = true;
			this.make_editor();
		}

		make_editor() {
			if (this.editor_app) return;

			this.current = this.value || "";
			const state = reactive<EditorState>({
				content: fromFrappe(this.current),
				placeholder: __(this.df.placeholder || ""),
				editable: this.is_editable(),
				// A grid row has no room for the toolbar.
				toolbar: !this.grid_row,
				maxHeight: this.df.max_height || "",
			});
			this.editor_state = state;

			this.editor_root = document.createElement("div");
			this.editor_root.className = SCOPE_CLASS;
			this.input_area.append(this.editor_root);

			this.editor_app = createApp({
				render: () =>
					h(FrappeEditor, {
						ref: (vm: unknown) => (this.editor_vm = vm as ControlTextEditor["editor_vm"]),
						modelValue: state.content,
						placeholder: state.placeholder,
						editable: state.editable,
						toolbar: state.toolbar,
						maxHeight: state.maxHeight,
						uploadTarget: () => uploadTarget(this.frm, this.df.fieldname),
						onChange: (html: string, isEmpty: boolean) => this.on_editor_change(html, isEmpty),
						onBlur: () => this.commit(),
					}),
			});
			this.editor_app.provide(PORTAL_TARGET_KEY, portalHost);
			this.editor_app.mount(this.editor_root);
		}

		is_editable(): boolean {
			return !this.disabled && !this.df.read_only;
		}

		refresh() {
			super.refresh();
			if (this.editor_state) this.editor_state.editable = this.is_editable();
		}

		on_editor_change(html: string, isEmpty: boolean) {
			if (!this.editor_state) return;
			// Keep the editor's input in step with what it holds, so a later
			// outside change is never mistaken for "no change".
			this.editor_state.content = html;
			this.current = toFrappe(html, isEmpty);

			clearTimeout(this.commit_timer);
			this.commit_timer = setTimeout(() => this.commit(), COMMIT_DELAY);
		}

		/** Write the current value to the model now (blur, or the debounce firing). */
		commit() {
			clearTimeout(this.commit_timer);
			this.commit_timer = undefined;
			if (this.current !== (this.value || "")) {
				this.parse_validate_and_set_in_model(this.current);
			}
		}

		parse(value: unknown) {
			if (value == null) value = "";
			return frappe.dom.remove_script_and_style(value as string);
		}

		set_formatted_input(value: string | null) {
			if (!this.editor_state) return;
			value = value || "";
			// Our own write coming back through the model.
			if (value === this.current) return;

			this.current = value;
			this.editor_state.content = fromFrappe(value);
		}

		get_input_value() {
			return this.current;
		}

		set_focus() {
			this.editor_vm?.focus();
		}
	}

	frappe.ui.form.ControlTextEditor = ControlTextEditor;
}
