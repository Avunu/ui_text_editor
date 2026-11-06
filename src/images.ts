// Copyright (c) 2026, Avunu LLC and contributors
// For license information, please see license.txt

/**
 * Points frappe-ui's image entry points at Frappe's file dialog (`upload.ts`).
 *
 * The toolbar's image item and the drop handler both go through a command, and
 * tiptap merges commands in priority order, so a later extension's wins.
 */

import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { UPLOAD_CANCELLED, type ImageDialog } from "./upload.ts";

const isImage = (node: ProseMirrorNode | null): node is ProseMirrorNode => node?.type.name === "image";

/** How many images in the document are still waiting on their upload. */
export function pendingUploads(doc: ProseMirrorNode): number {
	let pending = 0;
	doc.descendants((node) => {
		if (isImage(node) && node.attrs.loading) pending += 1;
	});
	return pending;
}

/**
 * Whether a transaction is an upload finishing, either way. Those stay out of
 * the undo history, which then only knows the placeholder being inserted: one
 * undo takes the image out, however long the dialog was open, and undo never
 * brings back a placeholder with no upload behind it.
 */
export function settlesUpload(tr: Transaction): boolean {
	return tr.docChanged && pendingUploads(tr.before) > pendingUploads(tr.doc);
}

/** Takes out the images whose dialog was closed. */
export function dropCancelledUploads(state: EditorState): Transaction | null {
	const tr = state.tr;
	state.doc.descendants((node, pos) => {
		if (isImage(node) && node.attrs.error === UPLOAD_CANCELLED) {
			tr.delete(tr.mapping.map(pos), tr.mapping.map(pos + node.nodeSize));
		}
	});
	return tr.docChanged ? tr : null;
}

export const FrappeImages = Extension.create<{ dialog: ImageDialog | null }>({
	name: "frappeImages",
	// Below the default, so these commands replace the kit's.
	priority: 50,

	addOptions() {
		return { dialog: null };
	},

	addCommands() {
		return {
			selectAndUploadImage: () => () => {
				this.options.dialog?.pick();
				return true;
			},
			// frappe-ui swaps the image for a placeholder first, so closing the dialog
			// would lose it. Here it stays until there is a new file to show.
			replaceImage:
				(pos, file) =>
				({ editor }) => {
					this.options.dialog?.upload(file).then(
						(media) => {
							const node = editor.state.doc.nodeAt(pos);
							if (!isImage(node)) return;
							const attrs = { ...node.attrs, src: media.file_url, width: null, height: null, error: null };
							editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, attrs));
						},
						() => undefined,
					);
					return true;
				},
			// frappe-ui sends several images to its gallery dialog, which is turned off
			// here. One by one they all join the same file dialog instead.
			dropFiles:
				(files) =>
				({ editor }) => {
					if (!editor.isEditable) return false;
					const images = files.filter((file) => file.type.startsWith("image/"));
					for (const image of images) editor.commands.uploadImage(image);
					return images.length > 0;
				},
		};
	},

	dispatchTransaction({ transaction, next }) {
		if (settlesUpload(transaction)) transaction.setMeta("addToHistory", false);
		next(transaction);
	},

	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: new PluginKey("frappeImages"),
				appendTransaction: (transactions, _old, state) =>
					transactions.some((tr) => tr.docChanged) ? dropCancelledUploads(state) : null,
			}),
		];
	},
});
