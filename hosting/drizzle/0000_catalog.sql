CREATE TABLE exchanges (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, country TEXT, timezone TEXT, website_url TEXT);
--> statement-breakpoint
CREATE TABLE sectors (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
--> statement-breakpoint
CREATE TABLE instruments (id INTEGER PRIMARY KEY, ticker TEXT NOT NULL UNIQUE, name TEXT NOT NULL, instrument_type TEXT NOT NULL, exchange_id INTEGER REFERENCES exchanges(id), sector_id INTEGER REFERENCES sectors(id), currency TEXT NOT NULL, description TEXT, listed_date TEXT, search_text TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE price_snapshots (id INTEGER PRIMARY KEY, instrument_id INTEGER NOT NULL REFERENCES instruments(id), price REAL NOT NULL CHECK(price > 0), change_percent REAL, volume INTEGER, as_of_date TEXT NOT NULL, UNIQUE(instrument_id, as_of_date));
