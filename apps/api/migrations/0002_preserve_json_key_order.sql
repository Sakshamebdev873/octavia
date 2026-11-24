-- jsonb normalises objects: it reorders keys (shorter keys first) and drops whitespace.
-- A transform with mapping { orderId, total, email } was shown back as { email, total, orderId }.
-- We never query inside these columns, we only store and show them, so `json` is the better
-- type: it keeps the document exactly as written, key order included. It still checks that
-- the value is valid JSON.
ALTER TABLE runs      ALTER COLUMN payload TYPE json USING payload::json;
ALTER TABLE run_steps ALTER COLUMN input   TYPE json USING input::json;
ALTER TABLE run_steps ALTER COLUMN output  TYPE json USING output::json;
