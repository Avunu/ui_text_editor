// Copyright (c) 2026, Avunu LLC and contributors
// For license information, please see license.txt

import assert from "node:assert/strict";
import { test } from "node:test";
import { history, redo, undo } from "@tiptap/pm/history";
import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { AllSelection, EditorState, NodeSelection, TextSelection, type Transaction } from "@tiptap/pm/state";
import {
	FrappeImages,
	createEditFilter,
	dispatchUpload,
	pendingUploads,
	placeholderPlugin,
} from "./images.ts";
import { UPLOAD_CANCELLED, type ImageDialog, type UploadTarget } from "./upload.ts";

const schema = new Schema({
	nodes: {
		doc: { content: "paragraph+" },
		paragraph: { content: "inline*" },
		text: { group: "inline" },
		image: {
			group: "inline",
			inline: true,
			attrs: {
				loading: { default: false },
				error: { default: null },
				src: { default: null },
				uploadId: { default: null },
				width: { default: null },
				height: { default: null },
			},
		},
	},
});

const image = (attrs: Record<string, unknown>) => schema.nodes.image.create(attrs);
const paragraph = (...inline: ProseMirrorNode[]) => schema.nodes.paragraph.create(null, inline);
const text = (value: string) => schema.text(value);
const doc = (...paragraphs: ProseMirrorNode[]) => schema.nodes.doc.create(null, paragraphs);

/** An editor's state and dispatch, with every transaction going through `dispatchUpload`. */
function editor(start: ProseMirrorNode, target: () => UploadTarget = () => ({})) {
	let state = EditorState.create({ schema, doc: start, plugins: [history(), placeholderPlugin()] });
	const isEdit = createEditFilter();
	const reported: ProseMirrorNode[] = [];
	const updates: Transaction[] = [];
	const apply = (tr: Transaction) => {
		const before = state.doc;
		state = state.apply(tr);
		// As tiptap decides on its `update` event, then as FrappeEditor.vue does.
		if (tr.getMeta("preventUpdate") || before.eq(state.doc)) return;
		updates.push(tr);
		if (isEdit(tr, state.doc)) reported.push(state.doc);
	};
	const dispatch = (tr: Transaction) => dispatchUpload(tr, () => state, apply, target);
	return {
		get state() {
			return state;
		},
		dispatch,
		reported,
		updates,
		select: (from: number, to = from) =>
			dispatch(state.tr.setSelection(TextSelection.create(state.doc, from, to))),
		selectNode: (pos: number) => dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos))),
		selectAll: () => dispatch(state.tr.setSelection(new AllSelection(state.doc))),
		undo: () => undo(state, dispatch),
		redo: () => redo(state, dispatch),

		// frappe-ui's media-node-ops.ts, which node cannot load (it is TypeScript in node_modules).
		insertPlaceholder(uploadId: string, pos?: number) {
			const node = image({ loading: true, uploadId, src: null });
			const tr = state.tr;
			if (pos === undefined) tr.replaceSelectionWith(node);
			else tr.insert(pos, node);
			dispatch(tr);
		},
		replaceWithPlaceholder(uploadId: string, pos: number) {
			const size = state.doc.nodeAt(pos)?.nodeSize ?? 0;
			dispatch(state.tr.replaceWith(pos, pos + size, image({ loading: true, uploadId, src: null })));
		},
		find(uploadId: string): number | null {
			const found: number[] = [];
			state.doc.descendants((node, pos) => {
				if (node.attrs.uploadId === uploadId) found.push(pos);
			});
			return found[0] ?? null;
		},
		succeed(uploadId: string, src: string) {
			const pos = this.find(uploadId);
			if (pos === null) return;
			const node = state.doc.nodeAt(pos);
			dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node?.attrs, src, loading: false, error: null }));
		},
		fail(uploadId: string, message: string) {
			const pos = this.find(uploadId);
			if (pos === null) return;
			const node = state.doc.nodeAt(pos);
			dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node?.attrs, loading: false, error: message }));
		},
		abort(uploadId: string) {
			const pos = this.find(uploadId);
			if (pos === null) return;
			dispatch(state.tr.delete(pos, pos + (state.doc.nodeAt(pos)?.nodeSize ?? 0)));
		},
		/** frappe-ui's content watcher, on the field's value being replaced from outside. */
		setContent(next: ProseMirrorNode) {
			dispatch(
				state.tr
					.replaceWith(0, state.doc.content.size, next.content)
					.setMeta("preventUpdate", true)
					.setMeta("addToHistory", false),
			);
		},
	};
}

const finished = (src: string) => (node: ProseMirrorNode | null | undefined) =>
	node?.type.name === "image" && node.attrs.src === src && !node.attrs.loading;

test("a placeholder counts as pending; a finished or failed image does not", () => {
	assert.equal(pendingUploads(doc(paragraph(image({ loading: true }), image({ loading: true })))), 2);
	assert.equal(pendingUploads(doc(paragraph(image({ src: "/files/a.png" })))), 0);
	assert.equal(pendingUploads(doc(paragraph(image({ error: "File too large" })))), 0);
	assert.equal(pendingUploads(doc(paragraph(text("no image")))), 0);
});

test("cancelling a paste over a selection leaves the document and form as they were", () => {
	const start = doc(paragraph(text("Keep this sentence")));
	const ed = editor(start);
	ed.select(1, 19);
	ed.insertPlaceholder("u1");
	assert.equal(ed.state.doc.textContent, "Keep this sentence");
	assert.equal(pendingUploads(ed.state.doc), 1);
	assert.equal(ed.state.selection.from, 1);
	assert.equal(ed.state.selection.to, 19);

	ed.fail("u1", UPLOAD_CANCELLED);
	assert.ok(ed.state.doc.eq(start));
	assert.equal(ed.state.selection.from, 1);
	assert.equal(ed.state.selection.to, 19);
	assert.equal(ed.reported.length, 0);
});

test("cancelling a paste over a selected image keeps the image", () => {
	const start = doc(paragraph(text("Start"), image({ src: "/files/red.png" })));
	const ed = editor(start);
	ed.selectNode(6);
	ed.insertPlaceholder("u1");
	assert.ok(finished("/files/red.png")(ed.state.doc.nodeAt(6)));
	assert.ok(ed.state.selection instanceof NodeSelection);
	ed.fail("u1", UPLOAD_CANCELLED);
	assert.ok(ed.state.doc.eq(start));
	assert.equal(ed.reported.length, 0);
});

test("cancelling a paste over the whole document leaves no paragraph behind", () => {
	const start = doc(paragraph(text("One")), paragraph(text("Two")));
	const ed = editor(start);
	ed.selectAll();
	ed.insertPlaceholder("u1");
	assert.equal(ed.state.doc.textContent, "OneTwo");
	assert.equal(ed.state.doc.childCount, 2);
	ed.fail("u1", UPLOAD_CANCELLED);
	assert.ok(ed.state.doc.eq(start));
});

test("a finished paste over the whole document replaces it", () => {
	const ed = editor(doc(paragraph(text("One")), paragraph(text("Two"))));
	ed.selectAll();
	ed.insertPlaceholder("u1");
	ed.succeed("u1", "/files/a.png");
	assert.equal(ed.state.doc.textContent, "");
	assert.equal(ed.state.doc.childCount, 1);
	assert.equal(ed.state.doc.firstChild?.childCount, 1);
});

test("a finished paste replaces the selection, and one undo brings it back", () => {
	const start = doc(paragraph(text("Keep this sentence")));
	const ed = editor(start);
	ed.select(1, 19);
	ed.insertPlaceholder("u1");
	ed.succeed("u1", "/files/a.png");
	assert.equal(ed.state.doc.textContent, "");
	assert.ok(finished("/files/a.png")(ed.state.doc.nodeAt(1)));
	assert.equal(pendingUploads(ed.state.doc), 0);
	assert.equal(ed.reported.length, 1);

	ed.undo();
	assert.ok(ed.state.doc.eq(start));
	assert.equal(ed.state.selection.to, 19);
	ed.redo();
	assert.ok(finished("/files/a.png")(ed.state.doc.nodeAt(1)));
});

test("a finished paste over a selected image replaces it", () => {
	const ed = editor(doc(paragraph(text("Start"), image({ src: "/files/red.png" }))));
	ed.selectNode(6);
	ed.insertPlaceholder("u1");
	ed.succeed("u1", "/files/new.png");
	const srcs: unknown[] = [];
	ed.state.doc.descendants((node) => {
		if (node.type.name === "image") srcs.push(node.attrs.src);
	});
	assert.deepEqual(srcs, ["/files/new.png"]);
});

test("a cancelled paste leaves no undo step behind", () => {
	const ed = editor(doc(paragraph(text("Start"))));
	ed.select(6);
	ed.dispatch(ed.state.tr.insertText(" typed"));
	ed.reported.length = 0;
	ed.insertPlaceholder("u1");
	ed.fail("u1", UPLOAD_CANCELLED);
	assert.equal(ed.state.doc.textContent, "Start typed");
	ed.undo();
	assert.equal(ed.state.doc.textContent, "Start");
});

test("a cancelled paste leaves what could be redone alone", () => {
	const ed = editor(doc(paragraph(text("Start"))));
	ed.select(6);
	ed.dispatch(ed.state.tr.insertText(" typed"));
	ed.undo();
	ed.insertPlaceholder("u1");
	ed.fail("u1", UPLOAD_CANCELLED);
	ed.redo();
	assert.equal(ed.state.doc.textContent, "Start typed");
});

test("one undo takes out a finished image, with no placeholder coming back", () => {
	const start = doc(paragraph(text("Start")));
	const ed = editor(start);
	ed.select(6);
	ed.insertPlaceholder("u1");
	ed.succeed("u1", "/files/a.png");
	ed.undo();
	assert.ok(ed.state.doc.eq(start));
	assert.equal(pendingUploads(ed.state.doc), 0);
	ed.redo();
	assert.ok(finished("/files/a.png")(ed.state.doc.nodeAt(6)));
	assert.equal(pendingUploads(ed.state.doc), 0);
});

test("undoing while a placeholder waits leaves the placeholder", () => {
	const ed = editor(doc(paragraph(text("Start"))));
	ed.select(6);
	ed.dispatch(ed.state.tr.insertText(" typed"));
	ed.insertPlaceholder("u1");
	ed.undo();
	assert.equal(ed.state.doc.textContent, "Start");
	assert.equal(pendingUploads(ed.state.doc), 1);
	ed.succeed("u1", "/files/a.png");
	assert.equal(pendingUploads(ed.state.doc), 0);
});

test("the editor's own abort takes the placeholder out of history too", () => {
	const ed = editor(doc(paragraph(text("Start"))));
	ed.select(6);
	ed.dispatch(ed.state.tr.insertText(" typed"));
	ed.insertPlaceholder("u1");
	ed.abort("u1");
	assert.equal(pendingUploads(ed.state.doc), 0);
	ed.undo();
	assert.equal(ed.state.doc.textContent, "Start");
	assert.equal(pendingUploads(ed.state.doc), 0);
});

test("the form hears of a finished image once, with no placeholder in it", () => {
	const ed = editor(doc(paragraph(text("Start"))));
	ed.select(6);
	ed.insertPlaceholder("u1");
	assert.equal(ed.reported.length, 0);
	ed.succeed("u1", "/files/a.png");
	assert.equal(ed.reported.length, 1);
	assert.equal(pendingUploads(ed.reported[0] as ProseMirrorNode), 0);
	assert.equal(ed.updates.length, 1); // no update for the placeholder
});

test("two uploads: the form waits for the last, and hears it if that one is cancelled", () => {
	const ed = editor(doc(paragraph(text("Start"))));
	ed.select(6);
	ed.insertPlaceholder("u1");
	ed.insertPlaceholder("u2");
	ed.succeed("u1", "/files/a.png");
	assert.equal(ed.reported.length, 0);
	ed.fail("u2", UPLOAD_CANCELLED);
	assert.equal(ed.reported.length, 1);
	assert.equal(pendingUploads(ed.reported[0] as ProseMirrorNode), 0);
});

test("typing while a placeholder waits reaches the form once it is gone, even on a cancel", () => {
	const ed = editor(doc(paragraph(text("Start"))));
	ed.select(6);
	ed.insertPlaceholder("u1");
	ed.select(1);
	ed.dispatch(ed.state.tr.insertText("x"));
	assert.equal(ed.reported.length, 0);
	ed.fail("u1", UPLOAD_CANCELLED);
	assert.equal(ed.reported.length, 1);
	assert.equal(ed.reported[0]?.textContent, "xStart");
});

test("frappe-ui measuring an image is not an edit, on a cancel or behind a placeholder", () => {
	const ed = editor(doc(paragraph(text("Start"), image({ src: "/files/red.png" }))));
	const measure = () =>
		ed.dispatch(
			ed.state.tr
				.setNodeMarkup(6, undefined, { ...ed.state.doc.nodeAt(6)?.attrs, width: 100, height: 60 })
				.setMeta("addToHistory", false),
		);
	ed.select(6);
	ed.insertPlaceholder("u1");
	measure();
	ed.fail("u1", UPLOAD_CANCELLED);
	measure();
	assert.equal(ed.reported.length, 0);
});

test("an ordinary edit is reported at once", () => {
	const ed = editor(doc(paragraph(text("Start"))));
	ed.select(6);
	ed.dispatch(ed.state.tr.insertText("!"));
	assert.equal(ed.reported.length, 1);
});

test("a file over the size limit shows its error and stays", () => {
	const ed = editor(doc(paragraph(text("Start"))));
	ed.select(6);
	ed.insertPlaceholder("u1");
	ed.fail("u1", "File too large");
	assert.equal(ed.state.doc.nodeAt(ed.find("u1") ?? -1)?.attrs.error, "File too large");
	assert.equal(pendingUploads(ed.state.doc), 0);
});

test("a data: image swapped for a placeholder is not kept for a cancel", () => {
	const ed = editor(doc(paragraph(text("one "), image({ src: "data:image/png;base64,x" }), text(" two"))));
	ed.select(1);
	ed.replaceWithPlaceholder("u1", 5);
	ed.fail("u1", UPLOAD_CANCELLED);
	assert.equal(ed.state.doc.textContent, "one  two");
	assert.equal(ed.state.doc.firstChild?.childCount, 1);
});

test("the placeholder survives the value being replaced from outside, and the image lands", () => {
	const ed = editor(doc(paragraph(text("Mine"))));
	ed.select(5);
	ed.insertPlaceholder("u1");
	ed.setContent(doc(paragraph(text("Changed by someone else"))));
	assert.equal(ed.state.doc.textContent, "Changed by someone else");
	assert.equal(pendingUploads(ed.state.doc), 1);
	assert.equal(ed.reported.length, 0);

	ed.succeed("u1", "/files/a.png");
	assert.equal(ed.state.doc.textContent, "Changed by someone else");
	assert.equal(pendingUploads(ed.state.doc), 0);
	assert.equal(ed.reported.length, 1);
	let srcs = 0;
	ed.state.doc.descendants((node) => {
		if (finished("/files/a.png")(node)) srcs += 1;
	});
	assert.equal(srcs, 1);
	// At the end of the block, not splitting a word at the old position.
	assert.equal(ed.state.doc.firstChild?.child(0).text, "Changed by someone else");
	assert.ok(finished("/files/a.png")(ed.state.doc.firstChild?.child(1)));
});

test("cancelling after the value changed from outside leaves that value and a clean form", () => {
	const ed = editor(doc(paragraph(text("Mine"))));
	ed.select(5);
	ed.insertPlaceholder("u1");
	const changed = doc(paragraph(text("Changed")));
	ed.setContent(changed);
	ed.fail("u1", UPLOAD_CANCELLED);
	assert.ok(ed.state.doc.eq(changed));
	assert.equal(ed.reported.length, 0);
});

test("a selection replaced from outside is not what the image replaces", () => {
	const ed = editor(doc(paragraph(text("Mine"))));
	ed.select(1, 5);
	ed.insertPlaceholder("u1");
	ed.setContent(doc(paragraph(text("Changed"))));
	ed.succeed("u1", "/files/a.png");
	assert.equal(ed.state.doc.textContent, "Changed");
});

test("several placeholders all survive", () => {
	const ed = editor(doc(paragraph(text("Mine"))));
	ed.select(5);
	ed.insertPlaceholder("u1");
	ed.insertPlaceholder("u2");
	ed.setContent(doc(paragraph(text("A much longer value than before"))));
	assert.equal(pendingUploads(ed.state.doc), 2);
});

test("when the form moves to another document, the placeholder stays behind", () => {
	let target: UploadTarget = { doctype: "Note", docname: "N-1", fieldname: "c" };
	const ed = editor(doc(paragraph(text("Mine"))), () => target);
	ed.select(5);
	ed.insertPlaceholder("u1");
	target = { doctype: "Note", docname: "N-2", fieldname: "c" };
	ed.setContent(doc(paragraph(text("Another document"))));
	assert.equal(pendingUploads(ed.state.doc), 0);
	ed.succeed("u1", "/files/a.png");
	assert.equal(ed.state.doc.textContent, "Another document");
	assert.equal(ed.state.doc.firstChild?.childCount, 1);
});

test("deleting a placeholder is not undone back into the document", () => {
	const ed = editor(doc(paragraph(text("Start"))));
	ed.select(6);
	ed.insertPlaceholder("u1");
	ed.selectNode(6);
	ed.dispatch(ed.state.tr.deleteSelection());
	assert.equal(pendingUploads(ed.state.doc), 0);
	assert.equal(ed.undo(), false);
	assert.equal(pendingUploads(ed.state.doc), 0);
});

// The extension's commands, against the parts of an editor they use.

type Commands = {
	selectAndUploadImage: () => (props: unknown) => boolean;
	replaceImage: (pos: number, file: File) => (props: unknown) => boolean;
	dropFiles: (files: File[]) => (props: unknown) => boolean;
};

function commands(dialog: Partial<ImageDialog>, target: () => UploadTarget = () => ({})) {
	const { addCommands } = FrappeImages.config;
	assert.ok(addCommands);
	return (addCommands as unknown as (this: unknown) => Commands).call({
		options: { dialog, target },
	});
}

const png = (name = "a.png") => new File(["x"], name, { type: "image/png" });

test("a wider delete takes a placeholder with it, and undo brings back only the text", () => {
	const ed = editor(doc(paragraph(text("one two three"))));
	ed.insertPlaceholder("up", 5);
	const pos = ed.find("up");
	assert.equal(pos, 5);
	ed.select(3, 9);
	ed.dispatch(ed.state.tr.deleteSelection());
	assert.equal(pendingUploads(ed.state.doc), 0);
	assert.equal(ed.state.doc.textContent, "on three");

	ed.undo();
	assert.equal(ed.find("up"), null, "no placeholder without an upload behind it");
	assert.equal(pendingUploads(ed.state.doc), 0);
	assert.equal(ed.state.doc.textContent, "one two three");
});

test("after that undo the form still hears later edits", () => {
	const ed = editor(doc(paragraph(text("one two three"))));
	ed.insertPlaceholder("up", 5);
	ed.select(3, 9);
	ed.dispatch(ed.state.tr.deleteSelection());
	ed.undo();
	const before = ed.reported.length;
	ed.dispatch(ed.state.tr.insertText("!", 1));
	assert.equal(ed.reported.length, before + 1);
	assert.equal(pendingUploads(ed.reported.at(-1) as ProseMirrorNode), 0);
});

test("a wider delete reaches the form once, without the placeholder", () => {
	const ed = editor(doc(paragraph(text("one two three"))));
	ed.insertPlaceholder("up", 5);
	ed.select(3, 9);
	ed.dispatch(ed.state.tr.deleteSelection());
	assert.equal(ed.reported.length, 1);
	assert.equal(pendingUploads(ed.reported[0]), 0);
});

test("a delete across two placeholders drops both, and a third outside it keeps waiting", () => {
	const ed = editor(doc(paragraph(text("one two three four"))));
	ed.insertPlaceholder("a", 3);
	ed.insertPlaceholder("b", 6);
	ed.insertPlaceholder("c", 18);
	ed.select(2, 9);
	ed.dispatch(ed.state.tr.deleteSelection());
	assert.equal(ed.find("a"), null);
	assert.equal(ed.find("b"), null);
	assert.notEqual(ed.find("c"), null);
	assert.equal(pendingUploads(ed.state.doc), 1);
	ed.undo();
	assert.equal(ed.find("a"), null);
	assert.equal(ed.find("b"), null);
	assert.notEqual(ed.find("c"), null);
});

test("the toolbar's command opens the dialog", () => {
	let picked = 0;
	assert.equal(commands({ pick: () => picked++ }).selectAndUploadImage()({}), true);
	assert.equal(picked, 1);
});

test("a drop on a read-only editor takes nothing", () => {
	const uploaded: File[] = [];
	const run = commands({}).dropFiles([png()]);
	const fake = { isEditable: false, commands: { uploadImage: (file: File) => uploaded.push(file) } };
	assert.equal(run({ editor: fake }), false);
	assert.equal(uploaded.length, 0);
});

test("a drop takes each image, and only images", () => {
	const uploaded: File[] = [];
	const fake = { isEditable: true, commands: { uploadImage: (file: File) => uploaded.push(file) } };
	const images = [png("a.png"), png("b.png")];
	const notes = new File(["x"], "notes.pdf", { type: "application/pdf" });
	assert.equal(commands({}).dropFiles([images[0], notes, images[1]])({ editor: fake }), true);
	assert.deepEqual(uploaded, images);
	uploaded.length = 0;
	assert.equal(commands({}).dropFiles([notes])({ editor: fake }), false);
	assert.equal(uploaded.length, 0);
});

/** An editor for `replaceImage`, with the document it holds. */
function replacing(start: ProseMirrorNode) {
	const ed = editor(start);
	const inserted: string[] = [];
	return {
		ed,
		inserted,
		fake: {
			isDestroyed: false,
			get state() {
				return ed.state;
			},
			view: { dispatch: ed.dispatch },
			chain: () => ({
				focus: () => ({
					setImage: ({ src }: { src: string }) => ({ run: () => inserted.push(src) }),
				}),
			}),
		},
	};
}

test("replacing an image swaps its src once there is a file, and undo restores it", async () => {
	const { ed, fake } = replacing(doc(paragraph(text("Start"), image({ src: "/files/old.png" }))));
	const upload = async () => ({ file_url: "/files/new.png" });
	commands({ upload }).replaceImage(6, png())({ editor: fake });
	assert.equal(ed.state.doc.nodeAt(6)?.attrs.src, "/files/old.png");
	await new Promise((resolve) => setTimeout(resolve));
	assert.equal(ed.state.doc.nodeAt(6)?.attrs.src, "/files/new.png");
	ed.undo();
	assert.equal(ed.state.doc.nodeAt(6)?.attrs.src, "/files/old.png");
});

test("cancelling a replacement keeps the old image", async () => {
	const start = doc(paragraph(text("Start"), image({ src: "/files/old.png" })));
	const { ed, fake } = replacing(start);
	const upload = () => Promise.reject(new DOMException("x", "AbortError"));
	commands({ upload }).replaceImage(6, png())({ editor: fake });
	await new Promise((resolve) => setTimeout(resolve));
	assert.ok(ed.state.doc.eq(start));
});

test("a replacement follows its image when the document moved, and survives it going", async () => {
	const moved = replacing(doc(paragraph(text("Start"), image({ src: "/files/old.png" }))));
	let finish: (media: { file_url: string }) => void = () => {};
	const upload = () => new Promise<{ file_url: string }>((resolve) => (finish = resolve));
	commands({ upload }).replaceImage(6, png())({ editor: moved.fake });
	moved.ed.setContent(doc(paragraph(text("Prefix then Start"), image({ src: "/files/old.png" }))));
	finish({ file_url: "/files/new.png" });
	await new Promise((resolve) => setTimeout(resolve));
	assert.equal(moved.ed.state.doc.nodeAt(18)?.attrs.src, "/files/new.png");
	assert.equal(moved.inserted.length, 0);

	const gone = replacing(doc(paragraph(text("Start"), image({ src: "/files/old.png" }))));
	commands({ upload }).replaceImage(6, png())({ editor: gone.fake });
	gone.ed.setContent(doc(paragraph(text("No image now"))));
	finish({ file_url: "/files/new.png" });
	await new Promise((resolve) => setTimeout(resolve));
	assert.deepEqual(gone.inserted, ["/files/new.png"]);
});

test("a replacement that lands after the form moved on goes nowhere", async () => {
	let target: UploadTarget = { doctype: "Note", docname: "N-1" };
	const { ed, inserted, fake } = replacing(doc(paragraph(image({ src: "/files/old.png" }))));
	let finish: (media: { file_url: string }) => void = () => {};
	const upload = () => new Promise<{ file_url: string }>((resolve) => (finish = resolve));
	commands({ upload }, () => target).replaceImage(1, png())({ editor: fake });
	target = { doctype: "Note", docname: "N-2" };
	ed.setContent(doc(paragraph(text("Another document"))));
	finish({ file_url: "/files/new.png" });
	await new Promise((resolve) => setTimeout(resolve));
	assert.equal(inserted.length, 0);
	assert.equal(ed.state.doc.textContent, "Another document");
});
