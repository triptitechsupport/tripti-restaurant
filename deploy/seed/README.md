# Stock files restored after every deploy

The site starts with an empty database after each deploy, restart or sleep.
On that fresh start `deploy/bootstrap.mjs` loads every `*.csv` file in this
folder (oldest first) and replaces the stock list (items, lots, locations)
with what is in the file. Files use the staff apps' backup CSV format.
