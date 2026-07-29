<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Origin, X-Requested-With, Content-Type, Accept');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true);
$action = isset($_GET['action']) ? $_GET['action'] : '';

// 1. Action: Ping / Health Check
if ($action === 'ping') {
    echo json_encode(['success' => true, 'message' => 'PHP Backend Online']);
    exit;
}

// Helper: Send Raw SMTP Commands
function sendSmtpMail($host, $port, $secure, $user, $pass, $fromName, $to, $subject, $htmlBody, $attachment = null) {
    $prefix = ($secure || intval($port) === 465) ? 'ssl://' : '';
    $timeout = 15;
    
    $socket = @fsockopen($prefix . $host, intval($port), $errno, $errstr, $timeout);
    if (!$socket) {
        return ['success' => false, 'error' => "Gagal terhubung ke host $host:$port ($errstr)"];
    }

    $read = function() use ($socket) {
        $data = '';
        while ($str = fgets($socket, 512)) {
            $data .= $str;
            if (substr($str, 3, 1) == ' ') break;
        }
        return $data;
    };

    $response = $read(); // Banner

    fputs($socket, "EHLO " . gethostname() . "\r\n");
    $response = $read();

    if (!$secure && intval($port) === 587) {
        fputs($socket, "STARTTLS\r\n");
        $response = $read();
        if (strpos($response, '220') !== false) {
            stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
            fputs($socket, "EHLO " . gethostname() . "\r\n");
            $response = $read();
        }
    }

    fputs($socket, "AUTH LOGIN\r\n");
    $response = $read();

    fputs($socket, base64_encode($user) . "\r\n");
    $response = $read();

    fputs($socket, base64_encode($pass) . "\r\n");
    $response = $read();

    if (strpos($response, '235') === false) {
        fputs($socket, "QUIT\r\n");
        fclose($socket);
        return ['success' => false, 'error' => "Autentikasi SMTP Gagal ($user): " . trim($response)];
    }

    // Return early if this is just a verification check
    if ($to === null) {
        fputs($socket, "QUIT\r\n");
        fclose($socket);
        return ['success' => true, 'message' => "Koneksi SMTP ke $host:$port berhasil terverifikasi!"];
    }

    fputs($socket, "MAIL FROM: <$user>\r\n");
    $response = $read();

    fputs($socket, "RCPT TO: <$to>\r\n");
    $response = $read();

    fputs($socket, "DATA\r\n");
    $response = $read();

    $boundary = "----=_NextPart_" . md5(time() . rand());
    
    $headers  = "From: =?UTF-8?B?" . base64_encode($fromName) . "?= <$user>\r\n";
    $headers .= "To: <$to>\r\n";
    $headers .= "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n";
    $headers .= "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: multipart/mixed; boundary=\"$boundary\"\r\n\r\n";

    $message  = "--$boundary\r\n";
    $message .= "Content-Type: text/html; charset=UTF-8\r\n";
    $message .= "Content-Transfer-Encoding: base64\r\n\r\n";
    $message .= chunk_split(base64_encode($htmlBody)) . "\r\n";

    if (!empty($attachment) && !empty($attachment['data'])) {
        $attName = isset($attachment['originalname']) ? $attachment['originalname'] : 'sertifikat.pdf';
        $parts = explode(',', $attachment['data']);
        $attContent = count($parts) > 1 ? base64_decode($parts[1]) : '';

        if (!empty($attContent)) {
            $message .= "--$boundary\r\n";
            $message .= "Content-Type: application/pdf; name=\"$attName\"\r\n";
            $message .= "Content-Transfer-Encoding: base64\r\n";
            $message .= "Content-Disposition: attachment; filename=\"$attName\"\r\n\r\n";
            $message .= chunk_split(base64_encode($attContent)) . "\r\n";
        }
    }

    $message .= "--$boundary--\r\n.\r\n";

    fputs($socket, $headers . $message);
    $response = $read();

    fputs($socket, "QUIT\r\n");
    fclose($socket);

    if (strpos($response, '250') !== false) {
        return ['success' => true, 'message' => 'Email terkirim'];
    } else {
        return ['success' => false, 'error' => "Gagal mengirim email: " . trim($response)];
    }
}

// 2. Action: Verify SMTP
if ($action === 'verify') {
    $host = isset($input['host']) ? $input['host'] : '';
    $port = isset($input['port']) ? $input['port'] : 587;
    $secure = !empty($input['secure']);
    $user = isset($input['user']) ? $input['user'] : '';
    $pass = isset($input['pass']) ? $input['pass'] : '';

    if (!$host || !$user || !$pass) {
        echo json_encode(['success' => false, 'error' => 'Informasi SMTP belum lengkap.']);
        exit;
    }

    $res = sendSmtpMail($host, $port, $secure, $user, $pass, 'Test', null, '', '');
    echo json_encode($res);
    exit;
}

// 3. Action: Send Email
if ($action === 'send') {
    $smtp = isset($input['smtpConfig']) ? $input['smtpConfig'] : [];
    $host = isset($smtp['host']) ? $smtp['host'] : '';
    $port = isset($smtp['port']) ? $smtp['port'] : 587;
    $secure = !empty($smtp['secure']);
    $user = isset($smtp['user']) ? $smtp['user'] : '';
    $pass = isset($smtp['pass']) ? $smtp['pass'] : '';
    $fromName = isset($smtp['fromName']) ? $smtp['fromName'] : 'MNC University';

    $to = isset($input['recipientEmail']) ? $input['recipientEmail'] : '';
    $subject = isset($input['subject']) ? $input['subject'] : '';
    $htmlBody = isset($input['htmlBody']) ? $input['htmlBody'] : '';
    $attachment = isset($input['attachment']) ? $input['attachment'] : null;

    if (!$host || !$user || !$pass || !$to || !$subject) {
        echo json_encode(['success' => false, 'error' => 'Parameter pengiriman email tidak lengkap.']);
        exit;
    }

    $res = sendSmtpMail($host, $port, $secure, $user, $pass, $fromName, $to, $subject, $htmlBody, $attachment);
    echo json_encode($res);
    exit;
}

echo json_encode(['success' => false, 'error' => 'Invalid action']);
