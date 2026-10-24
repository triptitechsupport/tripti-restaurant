# Backup files restored after every deploy

The Render test site starts with an empty database after each deploy,
restart or sleep. On that fresh start `deploy/bootstrap.mjs` loads every
`*.csv` file in this folder (oldest backup first) and replaces the menu,
categories, recipes and stock list with what is in the file.

Make a file with **Backup → Download backup (CSV)** in the kitchen manager
or stock manager app, then put it in this folder (GitHub: Add file → Upload
files) and deploy. Use one kitchen file and one stock file; replace them
with newer backups when the data changes.
