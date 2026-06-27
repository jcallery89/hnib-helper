<?php
// HNIB Tournament Expert - All-Star ballot roster writer (TEMPLATE).
//
// Receives the ballot roster from the app (the same rows the "Ballot roster"
// export produces) and writes them into the Populate Anything source table so
// the Gravity Forms All-Star ballot always reflects current stats - no manual
// phpMyAdmin paste.
//
// It reuses WordPress's own database handle ($wpdb), so there are NO database
// credentials in this file, and every write is parameterized (no SQL built from
// request text). Writes are gated by a shared secret.
//
// WHERE THIS FILE GOES: on the WordPress/Gravity Forms site (the one whose
// database holds the ballot table), NOT necessarily with the app. It can only
// reach that database from inside that site's directory.
//   - Same site as the app (e.g. app at hnibonline.com/tournament): drop this at
//     hnibonline.com/hnib-ballot-sync.php; the app calls "./hnib-ballot-sync.php"
//     (same-origin, no CORS needed).
//   - App on a different domain (e.g. jamiecallery.com/tournament, WordPress on
//     hnibonline.com): put this on hnibonline.com, set ALLOWED_ORIGIN to the
//     app's origin, and point the app's Endpoint URL at the full
//     https://hnibonline.com/hnib-ballot-sync.php.
//
// SETUP:
//   1. Set BALLOT_SYNC_TOKEN to a long random string; put the same value in the
//      app (Setup -> All-Star ballot auto-sync -> Shared token).
//   2. Confirm WP_LOAD_PATH reaches this site's wp-load.php (it is normally in
//      the WordPress root; adjust the ../ depth for where you place this file).
//   3. ALLOWED_TABLES must list the EXACT table names GPPA reads (the same bare
//      names the app's SQL export uses, e.g. gf_soph_rosters - no wp_ prefix).
//   4. Set ALLOWED_ORIGIN: the app's origin for cross-domain, or '' to skip CORS
//      when the app is same-origin.
//   5. Test with "Test push now" in the app before relying on it.
//
// This is a TEMPLATE: validate it against your live site before the event. The
// app's manual SQL/CSV export remains the verified fallback.

const BALLOT_SYNC_TOKEN = 'CHANGE-ME-to-a-long-random-string';
const WP_LOAD_PATH = __DIR__ . '/wp-load.php';
// The app's origin when it lives on a DIFFERENT domain than WordPress. Leave ''
// if the app is served from this same site (same-origin needs no CORS header).
const ALLOWED_ORIGIN = ''; // e.g. 'https://jamiecallery.com'
$ALLOWED_TABLES = array('gf_soph_rosters', 'gf_jrhigh_rosters');

if (ALLOWED_ORIGIN !== '') {
    header('Access-Control-Allow-Origin: ' . ALLOWED_ORIGIN);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Ballot-Token');
    header('Access-Control-Max-Age: 86400');
}
header('Content-Type: application/json');

// Cross-origin POSTs with a JSON body and a custom header trigger a preflight;
// answer it before any auth so the real POST can follow.
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(array('error' => 'POST only.'));
    exit;
}

// Shared-secret check (constant-time).
$sent = isset($_SERVER['HTTP_X_BALLOT_TOKEN']) ? $_SERVER['HTTP_X_BALLOT_TOKEN'] : '';
if (!hash_equals(BALLOT_SYNC_TOKEN, $sent)) {
    http_response_code(401);
    echo json_encode(array('error' => 'Bad token.'));
    exit;
}

$payload = json_decode(file_get_contents('php://input'), true);
$table = isset($payload['table']) ? $payload['table'] : '';
$rows = isset($payload['rows']) && is_array($payload['rows']) ? $payload['rows'] : null;
if (!in_array($table, $ALLOWED_TABLES, true) || $rows === null) {
    http_response_code(400);
    echo json_encode(array('error' => 'Expected {table, rows[]} with an allowed table.'));
    exit;
}

if (!file_exists(WP_LOAD_PATH)) {
    http_response_code(500);
    echo json_encode(array('error' => 'wp-load.php not found; fix WP_LOAD_PATH.'));
    exit;
}
require_once WP_LOAD_PATH; // gives us $wpdb
global $wpdb;
// Use the table name exactly as GPPA reads it (already checked against the
// allowlist above). These are standalone tables, not wp_-prefixed core tables.
$full = $table;

// Create the table if it does not exist yet (matches the export's schema).
$wpdb->query(
    "CREATE TABLE IF NOT EXISTS `$full` (
        `player_id` VARCHAR(64) NOT NULL,
        `team_name` VARCHAR(120) NOT NULL,
        `player_name` VARCHAR(120) NOT NULL,
        `jersey` VARCHAR(8),
        `position` VARCHAR(4),
        `gp` INT, `g` INT, `a` INT, `pts` INT,
        `gaa` VARCHAR(8), `svpct` VARCHAR(8),
        `display` VARCHAR(255),
        PRIMARY KEY (`player_id`)
    ) DEFAULT CHARSET=utf8mb4"
);

// Replace the whole roster: clear, then insert each row with $wpdb->replace
// (parameterized; safe against anything in the request body).
$wpdb->query("TRUNCATE TABLE `$full`");
$cols = array('player_id','team_name','player_name','jersey','position','gp','g','a','pts','gaa','svpct','display');
$written = 0;
foreach ($rows as $r) {
    if (empty($r['player_id'])) continue;
    $data = array();
    foreach ($cols as $c) {
        $data[$c] = isset($r[$c]) ? $r[$c] : '';
    }
    if ($wpdb->replace($full, $data) !== false) {
        $written++;
    }
}

echo json_encode(array('ok' => true, 'table' => $full, 'written' => $written));
