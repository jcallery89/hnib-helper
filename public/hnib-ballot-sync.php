<?php
// HNIB Tournament Expert - All-Star ballot roster writer (TEMPLATE).
//
// Receives the ballot roster from the app (the same rows the "Ballot roster"
// export produces) and rewrites the Populate Anything source table so the
// Gravity Forms All-Star ballot always reflects current stats - no manual
// phpMyAdmin paste. Every write is parameterized and limited to an allowlist of
// ballot tables, and the whole thing is gated by a shared secret checked before
// any database work happens.
//
// WHERE THIS FILE GOES: on the site whose database holds the ballot table (the
// Gravity Forms / WordPress site), not necessarily with the app.
//   - App same-site as WordPress (e.g. app at hnibonline.com/tournament): the
//     app calls "./hnib-ballot-sync.php"; leave ALLOWED_ORIGIN empty.
//   - App on a different domain (app at jamiecallery.com, WordPress at
//     hnibonline.com): put this on hnibonline.com, set ALLOWED_ORIGIN to the
//     app's origin, and point the app's Endpoint URL at the full
//     https://hnibonline.com/hnib-ballot-sync.php.
//
// ============================ DATABASE ACCESS ===============================
// Pick ONE of two modes. Mode A is strongly recommended for a business-critical
// site because the database itself - not just this code - confines the script.
//
//   MODE A (RECOMMENDED, most isolated): a DEDICATED MySQL user granted rights
//   on ONLY the ballot tables. Fill in BALLOT_DB below. The script talks
//   straight to the database and NEVER loads WordPress, so a bug or a leaked
//   token cannot reach wp_posts, wp_users, other Gravity Forms tables, or
//   anything else - the grants forbid it. One-time setup (phpMyAdmin -> SQL, or
//   Site Tools): create the user and grant it narrowly, e.g.
//       CREATE USER 'hnib_ballot'@'localhost' IDENTIFIED BY 'a-long-password';
//       GRANT SELECT, INSERT, DELETE ON `your_db`.`gf_soph_rosters`   TO 'hnib_ballot'@'localhost';
//       GRANT SELECT, INSERT, DELETE ON `your_db`.`gf_jrhigh_rosters` TO 'hnib_ballot'@'localhost';
//   Create the tables first (run the app's "Ballot roster (SQL)" export once),
//   so this user needs no CREATE/DROP rights at all.
//
//   MODE B (fallback): leave BALLOT_DB['name'] empty and the script loads
//   WordPress to use $wpdb. No credentials live in this file, but the script
//   then carries WordPress-level database rights; the table allowlist and
//   parameterized writes below are what keep it to the ballot tables. Never add
//   a core or Gravity-Forms-managed table to ALLOWED_TABLES.
// ============================================================================
//
// SETUP CHECKLIST:
//   1. BALLOT_SYNC_TOKEN: set to a long random string; paste the SAME value into
//      the app (Setup -> All-Star ballot auto-sync -> Shared token).
//   2. Choose Mode A (fill BALLOT_DB) or Mode B (set WP_LOAD_PATH).
//   3. ALLOWED_TABLES: the EXACT bare table names GPPA reads (e.g.
//      gf_soph_rosters - the same names the app's SQL export uses, no wp_ prefix).
//   4. ALLOWED_ORIGIN: the app's origin for cross-domain; '' when same-origin.
//   5. Back up the database, then use "Test push now" in the app before relying
//      on it. The manual SQL/CSV export remains the verified fallback.

const BALLOT_SYNC_TOKEN = 'CHANGE-ME-to-a-long-random-string';

// Mode A credentials (a user limited to the ballot tables). Leave 'name' empty
// to use Mode B instead.
const BALLOT_DB = array(
    'host' => '', // e.g. 'localhost'
    'name' => '', // database name (the same DB WordPress uses)
    'user' => '', // a user GRANTed SELECT,INSERT,DELETE on the ballot tables ONLY
    'pass' => '',
);
// Mode B: where to find WordPress (used only when BALLOT_DB['name'] is empty).
const WP_LOAD_PATH = __DIR__ . '/wp-load.php';

// The app's origin when it lives on a DIFFERENT domain than WordPress; '' skips
// CORS for a same-origin app.
const ALLOWED_ORIGIN = ''; // e.g. 'https://jamiecallery.com'

$ALLOWED_TABLES = array('gf_soph_rosters', 'gf_jrhigh_rosters');

// ---- CORS / preflight ------------------------------------------------------
if (ALLOWED_ORIGIN !== '') {
    header('Access-Control-Allow-Origin: ' . ALLOWED_ORIGIN);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Ballot-Token');
    header('Access-Control-Max-Age: 86400');
}
header('Content-Type: application/json');

// A cross-origin POST with a JSON body and a custom header sends a preflight
// first; answer it before auth so the real POST can follow.
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(array('error' => 'POST only.'));
    exit;
}

// ---- Auth (constant-time; runs BEFORE any DB work or WordPress load) --------
$sent = isset($_SERVER['HTTP_X_BALLOT_TOKEN']) ? $_SERVER['HTTP_X_BALLOT_TOKEN'] : '';
if (!hash_equals(BALLOT_SYNC_TOKEN, $sent)) {
    http_response_code(401);
    echo json_encode(array('error' => 'Bad token.'));
    exit;
}

// ---- Validate payload ------------------------------------------------------
$payload = json_decode(file_get_contents('php://input'), true);
$table = isset($payload['table']) ? $payload['table'] : '';
$rows = isset($payload['rows']) && is_array($payload['rows']) ? $payload['rows'] : null;
// Allowlist match AND a plain-identifier shape, so $table is always safe to
// interpolate into the backtick-quoted statements below.
if (!in_array($table, $ALLOWED_TABLES, true) || !preg_match('/^[A-Za-z0-9_]+$/', $table) || $rows === null) {
    http_response_code(400);
    echo json_encode(array('error' => 'Expected {table, rows[]} with an allowed table.'));
    exit;
}

$cols = array('player_id','team_name','player_name','jersey','position','gp','g','a','pts','gaa','svpct','display');
$ddl =
    "CREATE TABLE IF NOT EXISTS `$table` (
        `player_id` VARCHAR(64) NOT NULL,
        `team_name` VARCHAR(120) NOT NULL,
        `player_name` VARCHAR(120) NOT NULL,
        `jersey` VARCHAR(8),
        `position` VARCHAR(4),
        `gp` INT, `g` INT, `a` INT, `pts` INT,
        `gaa` VARCHAR(8), `svpct` VARCHAR(8),
        `display` VARCHAR(255),
        PRIMARY KEY (`player_id`)
    ) DEFAULT CHARSET=utf8mb4";

$written = 0;

if (BALLOT_DB['name'] !== '') {
    // ---- MODE A: direct, least-privilege connection (no WordPress) ---------
    $db = @new mysqli(BALLOT_DB['host'], BALLOT_DB['user'], BALLOT_DB['pass'], BALLOT_DB['name']);
    if ($db->connect_errno) {
        http_response_code(500);
        echo json_encode(array('error' => 'Database connection failed.'));
        exit;
    }
    $db->set_charset('utf8mb4');
    // Create on first run if the user has rights; harmless to skip if it exists
    // and the user was granted no CREATE (recommended least-privilege setup).
    @$db->query($ddl);
    if ($db->query("DELETE FROM `$table`") === false) {
        http_response_code(500);
        echo json_encode(array('error' => 'Could not clear the ballot table. Check the table exists and the grants.'));
        exit;
    }
    $placeholders = implode(',', array_fill(0, count($cols), '?'));
    $stmt = $db->prepare("REPLACE INTO `$table` (`" . implode('`,`', $cols) . "`) VALUES ($placeholders)");
    if ($stmt === false) {
        http_response_code(500);
        echo json_encode(array('error' => 'Could not prepare the insert.'));
        exit;
    }
    // 5 strings, 4 ints, 3 strings - bound once to these variables, reused per row.
    $pid = $tname = $pname = $jersey = $pos = $gaa = $svpct = $disp = '';
    $gp = $g = $a = $pts = 0;
    $stmt->bind_param('sssssiiiisss', $pid, $tname, $pname, $jersey, $pos, $gp, $g, $a, $pts, $gaa, $svpct, $disp);
    foreach ($rows as $r) {
        if (empty($r['player_id'])) continue;
        $pid = (string) $r['player_id'];
        $tname = (string) (isset($r['team_name']) ? $r['team_name'] : '');
        $pname = (string) (isset($r['player_name']) ? $r['player_name'] : '');
        $jersey = (string) (isset($r['jersey']) ? $r['jersey'] : '');
        $pos = (string) (isset($r['position']) ? $r['position'] : '');
        $gp = (int) (isset($r['gp']) ? $r['gp'] : 0);
        $g = (int) (isset($r['g']) ? $r['g'] : 0);
        $a = (int) (isset($r['a']) ? $r['a'] : 0);
        $pts = (int) (isset($r['pts']) ? $r['pts'] : 0);
        $gaa = (string) (isset($r['gaa']) ? $r['gaa'] : '');
        $svpct = (string) (isset($r['svpct']) ? $r['svpct'] : '');
        $disp = (string) (isset($r['display']) ? $r['display'] : '');
        if ($stmt->execute()) $written++;
    }
    $stmt->close();
    $db->close();
} else {
    // ---- MODE B: WordPress $wpdb fallback ----------------------------------
    if (!file_exists(WP_LOAD_PATH)) {
        http_response_code(500);
        echo json_encode(array('error' => 'wp-load.php not found; fix WP_LOAD_PATH or use Mode A.'));
        exit;
    }
    require_once WP_LOAD_PATH;
    global $wpdb;
    $wpdb->query($ddl);
    $wpdb->query("DELETE FROM `$table`");
    foreach ($rows as $r) {
        if (empty($r['player_id'])) continue;
        $data = array();
        foreach ($cols as $c) {
            $data[$c] = isset($r[$c]) ? $r[$c] : '';
        }
        if ($wpdb->replace($table, $data) !== false) $written++;
    }
}

echo json_encode(array('ok' => true, 'table' => $table, 'written' => $written));
