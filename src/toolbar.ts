// Copyright (c) 2026, Avunu LLC and contributors
// For license information, please see license.txt

/**
 * The editor's toolbar, laid out like the Quill toolbar it replaces.
 *
 * frappe-ui ships presets for comments and articles; a desk field needs a
 * little more (underline, check lists, indent, clear formatting, code block),
 * so the items it lacks are defined here in the same shape as its own.
 */

import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	Blockquote,
	Bold,
	BulletList,
	FontColor,
	FontHighlight,
	H1,
	H2,
	H3,
	H4,
	HorizontalRule,
	InlineCode,
	InsertImage,
	InsertLink,
	InsertTable,
	Italic,
	OrderedList,
	Redo,
	Separator,
	Strike,
	Undo,
	tableToolbar,
	type CommandMenuItem,
	type MenuGroupItem,
	type MenuItem,
	type TiptapEditor,
} from "frappe-ui/editor";

const hasMark = (name: string) => (editor: TiptapEditor) => !!editor.schema.marks[name];
const hasNode = (name: string) => (editor: TiptapEditor) => !!editor.schema.nodes[name];

const Underline: CommandMenuItem = {
	label: "Underline",
	icon: "lucide-underline",
	action: (editor) => editor.chain().focus().toggleUnderline().run(),
	isActive: (editor) => editor.isActive("underline"),
	isAvailable: hasMark("underline"),
};

const ClearFormatting: CommandMenuItem = {
	label: "Clear formatting",
	icon: "lucide-remove-formatting",
	action: (editor) => editor.chain().focus().unsetAllMarks().clearNodes().run(),
};

const TaskList: CommandMenuItem = {
	label: "Task list",
	icon: "lucide-list-todo",
	action: (editor) => editor.chain().focus().toggleTaskList().run(),
	isActive: (editor) => editor.isActive("taskList"),
	isAvailable: hasNode("taskList"),
};

const CodeBlock: CommandMenuItem = {
	label: "Code block",
	icon: "lucide-square-code",
	action: (editor) => editor.chain().focus().toggleCodeBlock().run(),
	isActive: (editor) => editor.isActive("codeBlock"),
	isAvailable: hasNode("codeBlock"),
};

/** Indent and outdent move the current item one level in or out of its list. */
const LIST_ITEMS = ["listItem", "taskItem"] as const;

const Indent: CommandMenuItem = {
	label: "Indent",
	icon: "lucide-indent-increase",
	action: (editor) => LIST_ITEMS.some((item) => editor.chain().focus().sinkListItem(item).run()),
	isDisabled: (editor) => !LIST_ITEMS.some((item) => editor.can().sinkListItem(item)),
};

const Outdent: CommandMenuItem = {
	label: "Outdent",
	icon: "lucide-indent-decrease",
	action: (editor) => LIST_ITEMS.some((item) => editor.chain().focus().liftListItem(item).run()),
	isDisabled: (editor) => !LIST_ITEMS.some((item) => editor.can().liftListItem(item)),
};

/**
 * frappe-ui's item, without "Gallery": galleries are turned off. Its command
 * opens Frappe's file dialog here (`images.ts`), not a native file picker.
 */
const ImageItem: CommandMenuItem = { ...InsertImage, label: "Image" };

// Quill offered Heading 1-6; frappe-ui's own group stops at 4 and leads with H2.
const Headings: MenuGroupItem = {
	type: "group",
	label: "Heading",
	items: [H1, H2, H3, H4],
};

/** The fixed bar above the content. */
export const TOOLBAR: MenuItem[] = [
	Headings,
	Separator,
	Bold,
	Italic,
	Underline,
	Strike,
	InlineCode,
	ClearFormatting,
	Separator,
	FontColor,
	FontHighlight,
	Separator,
	BulletList,
	OrderedList,
	TaskList,
	Outdent,
	Indent,
	Separator,
	AlignLeft,
	AlignCenter,
	AlignRight,
	Separator,
	Blockquote,
	CodeBlock,
	HorizontalRule,
	Separator,
	InsertLink,
	ImageItem,
	InsertTable,
	Separator,
	Undo,
	Redo,
];

/** The small menu that follows a text selection. */
export const BUBBLE_MENU: MenuItem[] = [Bold, Italic, Underline, Strike, InsertLink];

/** The row/column controls that appear while the caret is in a table. */
export const TABLE_MENU: MenuItem[] = tableToolbar;
