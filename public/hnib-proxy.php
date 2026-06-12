<?php
// HNIB Tournament Expert - read-only relay to the Tourno API (hnib.app).
//
// The browser app calls this same-origin file when hnib.app does not allow
// direct cross-origin requests. It only forwards GETs to a whitelist of
// read-only endpoints, so it cannot be abused as an open proxy.
//
// Usage: hnib-proxy.php?path=schedule/EVENT-ID

header('Content-Type: application/json');

$path = isset($_GET['path']) ? $_GET['path'] : '';

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
