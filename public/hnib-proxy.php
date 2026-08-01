<?php
// HNIB Tournament Expert - read-only relay to the Tourno API (hnib.app).
//
// The browser app calls this same-origin file when hnib.app does not allow
// direct cross-origin requests. It only forwards GETs to a whitelist of
// read-only endpoints, so it cannot be abused as an open proxy.
//
// Usage: hnib-proxy.php?path=schedule/EVENT-ID
//        hnib-proxy.php?path=headshot/PLAYER-ID   (image relay, see below)

header('Content-Type: application/json');

$path = isset($_GET['path']) ? $_GET['path'] : '';

// Image relay: Tourno keeps player photos in a public GCS bucket that sends no
// CORS headers, so the browser cannot draw them into an exportable canvas.
// Relaying them through this same-origin file makes them canvas-safe, and it
// means new uploads to Tourno appear live without redeploying headshots/.
if (preg_match('#^headshot/([a-zA-Z0-9\-]{8,64})$#', $path, $m)) {
    $base = 'https://storage.googleapis.com/tourno-39a2a.appspot.com/players/profile/' . $m[1];
    foreach (array('jpg', 'jpeg', 'png') as $ext) {
        $img = false;
        $imgStatus = 0;
        $ctype = 'image/jpeg';
        if (function_exists('curl_init')) {
            $ch = curl_init($base . '.' . $ext);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_MAXREDIRS, 3);
            curl_setopt($ch, CURLOPT_TIMEOUT, 20);
            curl_setopt($ch, CURLOPT_USERAGENT, 'HNIB-Tournament-Expert/1.0');
            $img = curl_exec($ch);
            $imgStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
        } else {
            $ctx = stream_context_create(array('http' => array('timeout' => 20)));
            $img = @file_get_contents($base . '.' . $ext, false, $ctx);
            $imgStatus = $img === false ? 0 : 200;
        }
        if ($img !== false && $imgStatus === 200 && strlen($img) > 0) {
            // Sniff real type: some bucket files are PNG bytes under .jpg names.
            if (substr($img, 0, 8) === "\x89PNG\r\n\x1a\n") {
                $ctype = 'image/png';
            }
            header('Content-Type: ' . $ctype);
            header('Cache-Control: public, max-age=600');
            echo $img;
            exit;
        }
    }
    http_response_code(404);
    echo json_encode(array('error' => 'No headshot for that player.'));
    exit;
}

// Whitelist: known read endpoints followed by a single safe id segment.
if (!preg_match('#^(schedule|teams|standings|leaders|event|events|game|team|locations|player_profile)/[a-zA-Z0-9\-]{1,64}$#', $path)) {
    http_response_code(400);
    echo json_encode(array('error' => 'Invalid or disallowed path.'));
    exit;
}

$url = 'https://hnib.app/api/' . $path;

// Prefer cURL (always available on SiteGround); fall back to file_get_contents.
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
    http_response_code(502);
    echo json_encode(array('error' => 'Upstream fetch failed.', 'status' => $status));
    exit;
}

echo $body;
