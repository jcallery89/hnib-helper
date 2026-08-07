<?php
// HNIB Major Showcases - ballot roster sync (Boys + Girls).
//
// Pulls every team roster and cumulative player stats from the Tourno API
// (hnib.app) and refreshes the database tables that the Gravity Forms ballots
// read through GP Populate Anything. Because each form re-reads its table on
// every render, coaches always see current stats. One run refreshes every
// event listed below, so a single cron covers both showcases.
//
// Install: edit HNIB_SYNC_KEY and the event list below, upload this file to
// the WordPress root (the folder containing wp-load.php), then visit
//   https://YOUR-SITE/hnib-ballot-sync.php?key=YOUR-KEY
// Schedule it with a SiteGround cron job during the events (see wp/README.md).
//
// Server-side calls are not subject to browser CORS, so this fetches
// hnib.app directly, same as public/hnib-proxy.php does for the tool.

define('HNIB_SYNC_KEY', 'CHANGE-ME-to-a-long-random-secret');
define('HNIB_API_BASE', 'https://hnib.app/api');

// One entry per event. An entry whose event_id still says FILL-ME is skipped,
// so the file works before every id is known.
$HNIB_EVENTS = array(
    array(
        'label' => 'Boys Major Showcase 2026',
        'event_id' => 'ebc5c5b9-9a1e-44f7-a6b8-466aefac97ee',
        'table' => 'gf_boysmajor_rosters',
    ),
    array(
        'label' => 'Girls Major Showcase 2026',
        'event_id' => 'FILL-ME-girls-major-event-id',
        'table' => 'gf_girlsmajor_rosters',
    ),
);

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(array('error' => 'GET only.'));
    exit;
}
if (HNIB_SYNC_KEY === 'CHANGE-ME-to-a-long-random-secret') {
    http_response_code(500);
    echo json_encode(array('error' => 'Set HNIB_SYNC_KEY in this file before use.'));
    exit;
}
$key = isset($_GET['key']) ? (string) $_GET['key'] : '';
if (!hash_equals(HNIB_SYNC_KEY, $key)) {
    http_response_code(403);
    echo json_encode(array('error' => 'Bad or missing key.'));
    exit;
}

require_once __DIR__ . '/wp-load.php';
global $wpdb;

// ---- Fetch helpers (same approach as hnib-proxy.php) -----------------------

function hnib_fetch_json($path) {
    $url = HNIB_API_BASE . '/' . $path;
    $body = false;
    $status = 0;
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_MAXREDIRS, 3);
        curl_setopt($ch, CURLOPT_TIMEOUT, 20);
        curl_setopt($ch, CURLOPT_USERAGENT, 'HNIB-Tournament-Expert/1.0');
        curl_setopt($ch, CURLOPT_HTTPHEADER, array('Accept: application/json'));
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
    } else {
        $ctx = stream_context_create(array('http' => array(
            'timeout' => 20,
            'header' => "Accept: application/json\r\nUser-Agent: HNIB-Tournament-Expert/1.0\r\n",
        )));
        $body = @file_get_contents($url, false, $ctx);
        $status = $body === false ? 0 : 200;
    }
    if ($body === false || $status < 200 || $status >= 300) {
        return null;
    }
    $data = json_decode($body, true);
    return is_array($data) ? $data : null;
}

// ---- Field mapping (mirrors src/io/importApiPlayers.ts) --------------------

function hnib_position($raw) {
    $t = strtolower(trim((string) $raw));
    if ($t === '') return '';
    $c = $t[0];
    if ($c === 'g') return 'G';
    if ($c === 'd') return 'D';
    if (in_array($c, array('f', 'c', 'w', 'l', 'r'), true)) return 'F';
    return '';
}

function hnib_num($v) {
    return is_numeric($v) ? $v + 0 : 0;
}

// ---- One event: fetch rosters + stats, rebuild its table -------------------

function hnib_sync_event($eventId, $table) {
    global $wpdb;

    $teamsData = hnib_fetch_json('teams/' . $eventId);
    if ($teamsData === null) {
        return array('error' => 'Could not fetch /teams for the event.');
    }
    // Accept either a bare array of divisions or { Divisions: [...] }.
    $divisions = isset($teamsData['Divisions']) ? $teamsData['Divisions'] : $teamsData;

    $teams = array(); // id => {name, code}
    foreach ((array) $divisions as $div) {
        if (!isset($div['Teams']) || !is_array($div['Teams'])) continue;
        foreach ($div['Teams'] as $t) {
            $id = isset($t['ID']) ? trim((string) $t['ID']) : '';
            $name = isset($t['Name']) ? trim((string) $t['Name']) : '';
            if ($id !== '' && $name !== '') {
                $teams[$id] = array(
                    'name' => $name,
                    'code' => isset($t['Code']) ? trim((string) $t['Code']) : $name,
                );
            }
        }
    }
    if (count($teams) === 0) {
        return array('error' => 'No teams found in the /teams response.');
    }

    // Completed-game counts per team code, for the GP fallback (the Tourno box
    // score often reports GP 0). Best-effort; rows fall back to box GP if absent.
    $gamesPlayed = array(); // code => count
    $schedule = hnib_fetch_json('schedule/' . $eventId);
    if ($schedule !== null && isset($schedule['Games']) && is_array($schedule['Games'])) {
        foreach ($schedule['Games'] as $g) {
            $status = isset($g['Status']) ? strtoupper((string) $g['Status']) : '';
            if ($status !== 'FINAL') continue;
            foreach (array('HomeTeamCode', 'AwayTeamCode') as $side) {
                $code = isset($g[$side]) ? trim((string) $g[$side]) : '';
                if ($code === '') continue;
                $gamesPlayed[$code] = isset($gamesPlayed[$code]) ? $gamesPlayed[$code] + 1 : 1;
            }
        }
    }

    $rows = array();
    $skipped = array();
    foreach ($teams as $teamId => $team) {
        $teamJson = hnib_fetch_json('team/' . $teamId);
        if ($teamJson === null) {
            $skipped[] = $team['name'];
            continue;
        }
        $teamName = $team['name'];
        $teamGp = isset($gamesPlayed[$team['code']]) ? $gamesPlayed[$team['code']] : 0;

        // Index box stats by player id and by jersey for the join.
        $boxById = array();
        $boxByNumber = array();
        foreach ((array) (isset($teamJson['BoxPlayers']) ? $teamJson['BoxPlayers'] : array()) as $bp) {
            if (isset($bp['ID']) && trim((string) $bp['ID']) !== '') $boxById[trim((string) $bp['ID'])] = $bp;
            if (isset($bp['Number']) && is_numeric($bp['Number']) && !isset($boxByNumber[(int) $bp['Number']])) {
                $boxByNumber[(int) $bp['Number']] = $bp;
            }
        }

        foreach ((array) (isset($teamJson['Players']) ? $teamJson['Players'] : array()) as $rp) {
            $first = isset($rp['FirstName']) ? trim((string) $rp['FirstName']) : '';
            $last = isset($rp['LastName']) ? trim((string) $rp['LastName']) : '';
            $jersey = (isset($rp['Number']) && is_numeric($rp['Number'])) ? (int) $rp['Number'] : null;
            if ($first === '' && $last === '' && $jersey === null) continue;

            $pid = isset($rp['ID']) ? trim((string) $rp['ID']) : '';
            $box = null;
            if ($pid !== '' && isset($boxById[$pid])) $box = $boxById[$pid];
            elseif ($jersey !== null && isset($boxByNumber[$jersey])) $box = $boxByNumber[$jersey];

            $goals = $box ? (int) hnib_num(isset($box['Goals']) ? $box['Goals'] : 0) : 0;
            $assists = $box ? (int) hnib_num(isset($box['Assists']) ? $box['Assists'] : 0) : 0;
            $points = $box && isset($box['Points']) && is_numeric($box['Points'])
                ? (int) $box['Points'] : $goals + $assists;
            $shots = $box ? (int) hnib_num(isset($box['Shots']) ? $box['Shots'] : 0) : 0;
            $saves = $box ? (int) hnib_num(isset($box['Saves']) ? $box['Saves'] : 0) : 0;
            $gp = $box ? (int) hnib_num(isset($box['GP']) ? $box['GP'] : 0) : 0;
            if ($gp === 0 && $teamGp > 0) $gp = $teamGp; // GP fallback, same as the tool

            // Goalie detection: roster or box position G, or the line has saves.
            $pos = hnib_position(isset($rp['Position']) ? $rp['Position'] : '');
            $boxPos = $box ? hnib_position(isset($box['Position']) ? $box['Position'] : '') : '';
            $isGoalie = $pos === 'G' || $boxPos === 'G' || $saves > 0;
            if ($isGoalie) $pos = 'G';
            elseif ($pos === '') $pos = $boxPos !== '' ? $boxPos : 'F'; // blanks default to F

            $gaa = ($isGoalie && $box && isset($box['GAA']) && is_numeric($box['GAA'])) ? round($box['GAA'] + 0, 2) : null;
            $svpct = ($isGoalie && $box && isset($box['SVPCT']) && is_numeric($box['SVPCT'])) ? round($box['SVPCT'] + 0, 3) : null;

            $fullName = trim($first . ' ' . $last);
            $jerseyLabel = $jersey !== null ? '#' . $jersey . ' ' : '';
            $keyJersey = $jersey !== null ? ' #' . $jersey : '';
            if ($isGoalie) {
                $statBits = array('GP ' . $gp);
                $statBits[] = $gaa !== null ? number_format($gaa, 2) . ' GAA' : 'no GAA yet';
                $statBits[] = $svpct !== null ? ltrim(number_format($svpct, 3), '0') . ' SV%' : 'no SV% yet';
                $statText = implode(', ', $statBits);
            } else {
                $statText = 'GP ' . $gp . ', ' . $goals . 'g ' . $assists . 'a ' . $points . 'pts';
            }

            $rows[] = array(
                'player_id' => $pid,
                'player_key' => $last . ', ' . $first . ' (' . $teamName . $keyJersey . ')',
                'player_name' => $fullName,
                'team_name' => $teamName,
                'jersey' => $jersey,
                'position' => $pos,
                'gp' => $gp,
                'goals' => $goals,
                'assists' => $assists,
                'points' => $isGoalie ? 0 : $points,
                'gaa' => $gaa,
                'svpct' => $svpct,
                'display' => $jerseyLabel . $fullName . ' - ' . $teamName . ' (' . $statText . ')',
            );
        }
    }

    if (count($rows) === 0) {
        return array(
            'error' => 'No players parsed; existing table left untouched.',
            'skipped_teams' => $skipped,
        );
    }

    // ---- Refresh the table (only reached with a full row set in hand) ------

    $charset = $wpdb->get_charset_collate();
    $createSql = "CREATE TABLE IF NOT EXISTS `$table` (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        player_id VARCHAR(64) NOT NULL DEFAULT '',
        player_key VARCHAR(160) NOT NULL,
        player_name VARCHAR(120) NOT NULL,
        team_name VARCHAR(120) NOT NULL,
        jersey INT NULL,
        position VARCHAR(2) NOT NULL DEFAULT 'F',
        gp INT NOT NULL DEFAULT 0,
        goals INT NOT NULL DEFAULT 0,
        assists INT NOT NULL DEFAULT 0,
        points INT NOT NULL DEFAULT 0,
        gaa DECIMAL(6,2) NULL,
        svpct DECIMAL(5,3) NULL,
        display VARCHAR(255) NOT NULL,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        KEY position_idx (position),
        KEY team_idx (team_name)
    ) $charset";
    $wpdb->query($createSql);

    // If a table with this name already exists from an older sync script, its
    // columns may not match ours (CREATE IF NOT EXISTS keeps the old shape and
    // every insert then fails). This table is a throwaway cache rebuilt on each
    // run, so on any schema drift just drop it and recreate.
    $needed = array('player_id', 'player_key', 'player_name', 'team_name', 'jersey',
        'position', 'gp', 'goals', 'assists', 'points', 'gaa', 'svpct', 'display', 'updated_at');
    $cols = $wpdb->get_col("SHOW COLUMNS FROM `$table`", 0);
    $rebuilt = false;
    if (!is_array($cols) || count(array_diff($needed, $cols)) > 0) {
        $wpdb->query("DROP TABLE IF EXISTS `$table`");
        $wpdb->query($createSql);
        $rebuilt = true;
        $cols = $wpdb->get_col("SHOW COLUMNS FROM `$table`", 0);
        if (!is_array($cols) || count(array_diff($needed, $cols)) > 0) {
            return array(
                'error' => 'Could not create the roster table.',
                'db_error' => $wpdb->last_error,
            );
        }
    }

    $now = current_time('mysql');
    $wpdb->query('START TRANSACTION');
    $wpdb->query("DELETE FROM `$table`");
    $inserted = 0;
    $dbError = '';
    foreach ($rows as $r) {
        $r['updated_at'] = $now;
        $ok = $wpdb->insert($table, $r, array(
            '%s', '%s', '%s', '%s', '%d', '%s', '%d', '%d', '%d', '%d', '%f', '%f', '%s', '%s',
        ));
        if ($ok) $inserted++;
        elseif ($dbError === '') $dbError = $wpdb->last_error;
    }
    if ($inserted < count($rows)) {
        $wpdb->query('ROLLBACK');
        return array(
            'error' => 'Inserts failed; table left as it was.',
            'parsed_players' => count($rows),
            'inserted' => $inserted,
            'db_error' => $dbError,
            'table_rebuilt' => $rebuilt,
        );
    }
    $wpdb->query('COMMIT');

    return array(
        'ok' => true,
        'teams' => count($teams),
        'players' => $inserted,
        'skipped_teams' => $skipped,
        'table_rebuilt' => $rebuilt,
        'updated_at' => $now,
    );
}

// ---- Run every configured event --------------------------------------------

$results = array();
$anyOk = false;
foreach ($HNIB_EVENTS as $ev) {
    $label = $ev['label'];
    if (strpos($ev['event_id'], 'FILL-ME') === 0) {
        $results[$label] = array('skipped' => 'event_id not set yet');
        continue;
    }
    $results[$label] = hnib_sync_event($ev['event_id'], $ev['table']);
    if (!empty($results[$label]['ok'])) $anyOk = true;
}

if (!$anyOk) {
    http_response_code(502);
}
echo json_encode($results);
