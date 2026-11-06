# Copyright (c) 2026, Avunu LLC and contributors
# For license information, please see license.txt

app_name = "ui_text_editor"
app_title = "Rich Text Editor for Desk"
app_publisher = "Avunu LLC"
app_description = "Rich text editor from frappe-ui for every Text Editor field in the Frappe desk"
app_email = "mail@avu.nu"
app_license = "MIT"

# Frappe's About dialog takes the logo from here. not_listed keeps the app off the apps screen.
# app_logo_url would change the site's own logo.
add_to_apps_screen = [
	{
		"name": "ui_text_editor",
		"logo": "/assets/ui_text_editor/images/ui_text_editor-logo.svg",
		"title": "Rich Text Editor for Desk",
		"route": "/desk",
		"has_permission": "ui_text_editor.apps_screen.not_listed",
	}
]
app_include_js = "ui_text_editor.bundle.js"
app_include_css = "ui_text_editor.bundle.css"
