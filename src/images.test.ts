// Copyright (c) 2026, Avunu LLC and contributors
// For license information, please see license.txt

import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { dropCancelledUploads, pendingUploads, settlesUpload } from "./images.ts";
import { UPLOAD_CANCELLED } from "./upload.ts";

const schema = new Schema({
	nodes: {
		doc: { content: "paragraph+" },
		paragraph: { content: "inline*" },
		text: { group: "inline" },
		image: {
			group: "inline",
			inline: true,
			attrs: { loading: { default: false }, error: { default: null }, src: { default: null } },
		},
	},
});

const image = (attrs: Record<string, unknown>) => schema.nodes.image.create(attrs);
const doc = (...inline: Parameters<typeof schema.nodes.paragraph.create>[1][]) =>
	schema.nodes.doc.create(
		null,
		inline.map((content) => schema.nodes.paragraph.create(null, content)),
	);
const stateOf = (document: ReturnType<typeof doc>) => EditorState.create({ schema, doc: document });

test("a placeholder counts as pending; a finished or failed image does not", () => {
	assert.equal(pendingUploads(doc([image({ loading: true }), image({ loading: true })])), 2);
	assert.equal(pendingUploads(doc([image({ src: "/files/a.png" })])), 0);
	assert.equal(pendingUploads(doc([image({ error: "File too large" })])), 0);
	assert.equal(pendingUploads(doc([schema.text("no image")])), 0);
});

test("an upload finishing either way settles it; inserting a placeholder does not", () => {
	const placeholder = image({ loading: true });
	const state = stateOf(doc([placeholder]));
	const finish = (attrs: Record<string, unknown>) =>
		state.tr.setNodeMarkup(1, undefined, { ...placeholder.attrs, loading: false, ...attrs });
	assert.equal(settlesUpload(finish({ src: "/files/a.png" })), true);
	assert.equal(settlesUpload(finish({ error: UPLOAD_CANCELLED })), true);
	assert.equal(settlesUpload(state.tr.insert(1, image({ loading: true }))), false);
	assert.equal(settlesUpload(state.tr.insertText("typed", 1)), false);
	assert.equal(settlesUpload(state.tr), false);
});

test("removes only the cancelled images", () => {
	const state = stateOf(
		doc(
			[schema.text("a"), image({ error: UPLOAD_CANCELLED }), schema.text("b")],
			[
				image({ error: "File too large" }),
				image({ error: UPLOAD_CANCELLED }),
				image({ src: "/files/a.png" }),
			],
		),
	);
	const tr = dropCancelledUploads(state);
	assert.ok(tr);
	const left = state.apply(tr).doc;
	assert.equal(left.child(0).textContent, "ab");
	assert.equal(left.child(0).childCount, 1);
	assert.equal(left.child(1).childCount, 2);
	assert.equal(left.child(1).child(0).attrs.error, "File too large");
	assert.equal(left.child(1).child(1).attrs.src, "/files/a.png");
});

test("leaves a document with nothing cancelled alone", () => {
	assert.equal(dropCancelledUploads(stateOf(doc([image({ loading: true })]))), null);
});
