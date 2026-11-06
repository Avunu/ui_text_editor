// Copyright (c) 2026, Avunu LLC and contributors
// For license information, please see license.txt

/**
 * Points frappe-ui's image entry points at Frappe's file dialog (`upload.ts`),
 * and keeps the upload's placeholder from being an edit.
 *
 * The toolbar's image item and the drop handler both go through a command, and
 * tiptap merges commands in priority order, so a later extension's wins.
 *
 * frappe-ui's upload engine puts a placeholder in the document before it calls
 * `uploadFunction`, which here can mean a dialog the user sits in for minutes,
 * and may well close again. All the engine's writes pass through `dispatchUpload`:
 * - The placeholder goes in out of the undo history, beside a selection rather
 *   than over it, so closing the dialog changes nothing.
 * - A finished image becomes the edit: the placeholder comes out and the image
 *   goes in with a transaction of its own, the one undo reverts, and that is
 *   when it replaces the selection.
 * - The placeholder survives the field's value being replaced from outside,
 *   which a clean form lets happen at any time (a reload when someone else saves).
 */

import { Extension } from "@tiptap/core";
import { isHistoryTransaction } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
	Plugin,
	PluginKey,
	Selection,
	TextSelection,
	type EditorState,
	type SelectionBookmark,
	type Transaction,
} from "@tiptap/pm/state";
import { Mapping } from "@tiptap/pm/transform";
import { UPLOAD_CANCELLED, sameDocument, type ImageDialog, type UploadTarget } from "./upload.ts";

interface Located {
	node: ProseMirrorNode;
	pos: number;
}

/** What is remembered about a placeholder, by upload id. */
interface Placeholder {
	/** The document it was asked for. */
	target: UploadTarget;
	/** The selection it will replace once it has a file. */
	replaces: SelectionBookmark | null;
}

type Placeholders = Map<string, Placeholder>;

/** On a transaction, marks it as only a placeholder coming or going. */
interface PlaceholderChange {
	add?: Placeholder & { id: string };
	remove?: string;
}

const placeholdersKey = new PluginKey<Placeholders>("frappeImages");

const isImage = (node: ProseMirrorNode | null | undefined): node is ProseMirrorNode =>
	node?.type.name === "image";

/** The images with an upload behind them; finished ones keep their id. */
function uploads(doc: ProseMirrorNode): Map<string, Located> {
	const found = new Map<string, Located>();
	doc.descendants((node, pos) => {
		if (isImage(node) && node.attrs.uploadId) found.set(node.attrs.uploadId as string, { node, pos });
	});
	return found;
}

/** How many images in the document are still waiting on their upload. */
export function pendingUploads(doc: ProseMirrorNode): number {
	let pending = 0;
	doc.descendants((node) => {
		if (isImage(node) && node.attrs.loading) pending += 1;
	});
	return pending;
}

/** Remembers the placeholders across transactions, with their selections mapped along. */
export function placeholderPlugin(): Plugin<Placeholders> {
	return new Plugin<Placeholders>({
		key: placeholdersKey,
		state: {
			init: () => new Map(),
			apply(tr, previous) {
				const change = tr.getMeta(placeholdersKey) as PlaceholderChange | undefined;
				if (!tr.docChanged && !change) return previous;
				const next: Placeholders = new Map();
				for (const [id, placeholder] of previous) {
					if (id === change?.remove) continue;
					next.set(id, { ...placeholder, replaces: placeholder.replaces?.map(tr.mapping) ?? null });
				}
				if (change?.add) {
					const { id, ...placeholder } = change.add;
					next.set(id, placeholder);
				}
				return next;
			},
		},
	});
}

/**
 * The engine putting in a placeholder: out of the history, and beside any
 * selection. No update either: the model has no use for it, and frappe-ui would
 * take one as the cue to measure the images that have no size, swapping a selected
 * image for a new node, which is the end of the selection.
 */
function holdPlaceholder(
	state: EditorState,
	tr: Transaction,
	id: string,
	node: ProseMirrorNode,
	target: UploadTarget,
): Transaction {
	const { selection } = state;
	const overSelection = !selection.empty && tr.mapping.mapResult(selection.from, 1).deleted;
	const hold = (held: Transaction, replaces: SelectionBookmark | null) =>
		held
			.setMeta("addToHistory", false)
			.setMeta("preventUpdate", true)
			.setMeta(placeholdersKey, { add: { id, target, replaces } } satisfies PlaceholderChange);
	if (!overSelection) return hold(tr, null);

	// The end of a selection can be between blocks, and an inline node would bring
	// a paragraph of its own there, which would then stay behind.
	const at = Selection.near(state.doc.resolve(selection.to), -1).from;
	const beside = state.tr.insert(at, node);
	const bookmark = selection.getBookmark();
	const replaces = at < selection.to ? bookmark.map(beside.mapping) : bookmark;
	return hold(beside.setSelection(replaces.resolve(beside.doc)), replaces);
}

/** A placeholder finished, so the image goes in as the edit it is. */
function fillPlaceholder(
	getState: () => EditorState,
	next: (tr: Transaction) => void,
	id: string,
	{ pos, node: placeholder }: Located,
	image: ProseMirrorNode,
): void {
	const state = getState();
	const out = state.tr
		.delete(pos, pos + placeholder.nodeSize)
		.setMeta("addToHistory", false)
		// The model hears of it once, when the image is in.
		.setMeta("preventUpdate", true)
		.setMeta(placeholdersKey, { remove: id } satisfies PlaceholderChange);
	const replaces = placeholdersKey.getState(state)?.get(id)?.replaces?.map(out.mapping);
	next(out);

	const edit = getState().tr;
	const selection = replaces?.resolve(edit.doc);
	// A selection the document no longer has collapses, and the image stays put.
	if (selection && !selection.empty) edit.setSelection(selection).replaceSelectionWith(image);
	else edit.insert(pos, image);
	next(edit);
}

/** The placeholders a replaced document took with it go back in, near where they were. */
function keepPlaceholders(
	state: EditorState,
	tr: Transaction,
	dropped: Located[],
	current: UploadTarget,
): Transaction {
	const known = placeholdersKey.getState(state);
	for (const { node, pos } of dropped) {
		const asked = known?.get(node.attrs.uploadId as string)?.target;
		// The form moved on to another document, and the file is attached to the first.
		if (asked && !sameDocument(asked, current)) continue;
		// The end of that block: the old position would land in the middle of a word.
		const { $from } = Selection.near(tr.doc.resolve(Math.min(pos, tr.doc.content.size)));
		tr.insert($from.parent.inlineContent ? $from.end() : $from.pos, node);
	}
	return tr;
}

/**
 * Every transaction the editor dispatches comes through here: `next` applies one,
 * and `getState` then reads the result. Only those touching a placeholder change.
 */
export function dispatchUpload(
	tr: Transaction,
	getState: () => EditorState,
	next: (tr: Transaction) => void,
	target: () => UploadTarget,
): void {
	if (!tr.docChanged || isHistoryTransaction(tr)) {
		next(tr);
		return;
	}
	const state = getState();
	const before = uploads(tr.before);
	const after = uploads(tr.doc);

	for (const [id, { node }] of after) {
		if (node.attrs.loading && !before.has(id)) {
			next(holdPlaceholder(state, tr, id, node, target()));
			return;
		}
	}

	const dropped: Located[] = [];
	for (const [id, located] of before) {
		if (!located.node.attrs.loading) continue;
		const now = after.get(id);
		if (!now) {
			dropped.push(located);
		} else if (now.node.attrs.error === UPLOAD_CANCELLED) {
			next(
				state.tr
					.delete(located.pos, located.pos + located.node.nodeSize)
					.setMeta("addToHistory", false)
					.setMeta(placeholdersKey, { remove: id } satisfies PlaceholderChange),
			);
			return;
		} else if (now.node.attrs.src) {
			fillPlaceholder(getState, next, id, located, now.node);
			return;
		} else if (!now.node.attrs.loading) {
			// Failed for some other reason: the image shows the error and stays.
			next(
				tr
					.setMeta("addToHistory", false)
					.setMeta(placeholdersKey, { remove: id } satisfies PlaceholderChange),
			);
			return;
		}
	}

	if (dropped.length > 0 && tr.getMeta("preventUpdate")) {
		next(keepPlaceholders(state, tr, dropped, target()));
		return;
	}
	const [only] = dropped;
	if (dropped.length === 1 && isDeletionOf(tr, only)) {
		// Its upload was cancelled, or someone deleted just this: undo should not
		// bring back a placeholder that has no upload behind it any more.
		next(
			tr
				.setMeta("addToHistory", false)
				.setMeta(placeholdersKey, { remove: only.node.attrs.uploadId as string } satisfies PlaceholderChange),
		);
		return;
	}
	if (dropped.length > 0) {
		deleteAroundPlaceholders(getState, next, tr, dropped);
		return;
	}
	next(tr);
}

/**
 * A wider edit took placeholders with it. They come out first, out of the history,
 * and the edit is what the history records: undoing it restores the text, and a
 * placeholder restored with it would have no upload left to finish it, which would
 * hold every later edit back from the form.
 */
function deleteAroundPlaceholders(
	getState: () => EditorState,
	next: (tr: Transaction) => void,
	tr: Transaction,
	dropped: Located[],
): void {
	const mapping = new Mapping();
	for (const { node, pos } of dropped) {
		const at = mapping.map(pos);
		const out = getState()
			.tr.delete(at, at + node.nodeSize)
			.setMeta("addToHistory", false)
			.setMeta("preventUpdate", true)
			.setMeta(placeholdersKey, { remove: node.attrs.uploadId as string } satisfies PlaceholderChange);
		mapping.appendMapping(out.mapping);
		next(out);
	}

	const edit = getState().tr;
	for (const step of tr.steps) {
		const mapped = step.map(mapping);
		if (mapped) edit.step(mapped);
	}
	const { from, to } = tr.selection;
	const size = edit.doc.content.size;
	edit.setSelection(
		TextSelection.between(edit.doc.resolve(Math.min(from, size)), edit.doc.resolve(Math.min(to, size))),
	);
	next(edit);
}

function isDeletionOf(tr: Transaction, { node, pos }: Located): boolean {
	return (
		tr.steps.length === 1 &&
		tr.doc.content.size === tr.before.content.size - node.nodeSize &&
		tr.mapping.mapResult(pos, 1).deleted
	);
}

/**
 * Which of the editor's updates the form should hear about. A placeholder coming
 * or going is not one, and while one is in the document its HTML is not fit to
 * store, so an edit made meanwhile waits until the last one is gone. Nor is what
 * frappe-ui does of its own accord and keeps out of the history, which is measuring
 * the images with no size: closing a dialog should not change the form that way.
 */
export function createEditFilter(): (tr: Transaction, doc: ProseMirrorNode) => boolean {
	let held = false;
	return (tr, doc) => {
		// See FrappeEditor.vue: a plugin's own follow-up is not an edit either.
		if (!tr.docChanged) return false;
		const isPlaceholder = tr.getMeta(placeholdersKey) !== undefined;
		if (!isPlaceholder && tr.getMeta("addToHistory") === false) return false;
		if (pendingUploads(doc) > 0) {
			held ||= !isPlaceholder;
			return false;
		}
		const report = held || !isPlaceholder;
		held = false;
		return report;
	};
}

export const FrappeImages = Extension.create<{ dialog: ImageDialog | null; target: () => UploadTarget }>({
	name: "frappeImages",
	// Below the default, so these commands replace the kit's.
	priority: 50,

	addOptions() {
		return { dialog: null, target: () => ({}) };
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
					const replaced = editor.state.doc.nodeAt(pos);
					const asked = this.options.target();
					this.options.dialog?.upload(file).then(
						(media) => {
							if (editor.isDestroyed) return;
							const { doc } = editor.state;
							const at = findImage(doc, pos, replaced);
							if (at !== null) {
								const attrs = {
									...doc.nodeAt(at)?.attrs,
									src: media.file_url,
									width: null,
									height: null,
									error: null,
								};
								editor.view.dispatch(editor.state.tr.setNodeMarkup(at, undefined, attrs));
							} else if (sameDocument(asked, this.options.target())) {
								// The field's value was replaced while the dialog was open.
								editor.chain().focus().setImage({ src: media.file_url }).run();
							}
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
		dispatchUpload(transaction, () => this.editor.state, next, this.options.target);
	},

	addProseMirrorPlugins() {
		return [placeholderPlugin()];
	},
});

/** The image a replacement is for: still at its position, or moved. */
function findImage(doc: ProseMirrorNode, pos: number, replaced: ProseMirrorNode | null): number | null {
	const same = (node: ProseMirrorNode | null) => isImage(node) && node.attrs.src === replaced?.attrs.src;
	if (same(doc.nodeAt(pos))) return pos;
	let found: number | null = null;
	doc.descendants((node, at) => {
		if (found === null && same(node) && !node.attrs.loading) found = at;
	});
	return found;
}
