# start-server.ps1
# Server Launcher for MNCU Bulk Mailer

if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host "Menjalankan Express Backend Server via Node.js..." -ForegroundColor Green
    Start-Process "http://localhost:3000"
    Set-Location $PSScriptRoot
    node server.js
    exit
}

$port = 3000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

try {
    $listener.Start()
    Write-Host "Server running at http://localhost:$port" -ForegroundColor Green
    Write-Host "Tekan Ctrl+C untuk menghentikan server." -ForegroundColor Yellow
    
    # Open browser automatically
    Start-Process "http://localhost:$port"
}
catch {
    Write-Host "Gagal memulai server: $_" -ForegroundColor Red
    Write-Host "Pastikan tidak ada aplikasi lain yang menggunakan port $port." -ForegroundColor Red
    Exit
}

# Function to return response
function Send-Response($context, $content, $contentType = "text/html", $statusCode = 200) {
    $response = $context.Response
    $response.StatusCode = $statusCode
    $response.ContentType = $contentType
    
    $buffer = [System.Text.Encoding]::UTF8.GetBytes($content)
    $response.ContentLength64 = $buffer.Length
    $response.OutputStream.Write($buffer, 0, $buffer.Length)
    $response.OutputStream.Close()
}

# Function to parse JSON (returns custom object)
function ConvertFrom-JsonString($json) {
    try {
        return ConvertFrom-Json $json
    }
    catch {
        return $null
    }
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $url = $request.Url.LocalPath
        
        # Serve Static Files
        if ($url -eq "/" -or $url -eq "/index.html") {
            $path = Join-Path $PSScriptRoot "public/index.html"
            if (Test-Path $path) {
                $content = Get-Content $path -Raw -Encoding UTF8
                Send-Response $context $content "text/html; charset=utf-8"
            } else {
                Send-Response $context "index.html not found" "text/plain" 404
            }
        }
        elseif ($url -eq "/style.css") {
            $path = Join-Path $PSScriptRoot "public/style.css"
            if (Test-Path $path) {
                $content = Get-Content $path -Raw -Encoding UTF8
                Send-Response $context $content "text/css; charset=utf-8"
            } else {
                Send-Response $context "style.css not found" "text/plain" 404
            }
        }
        elseif ($url -eq "/app.js") {
            $path = Join-Path $PSScriptRoot "public/app.js"
            if (Test-Path $path) {
                $content = Get-Content $path -Raw -Encoding UTF8
                Send-Response $context $content "application/javascript; charset=utf-8"
            } else {
                Send-Response $context "app.js not found" "text/plain" 404
            }
        }
        # API: Clean attachments (placeholder for frontend initialization check)
        elseif ($url -eq "/api/clean-attachments" -and $request.HttpMethod -eq "POST") {
            Send-Response $context '{"success":true,"message":"Cleared"}' "application/json"
        }
        # API: Verify SMTP
        elseif ($url -eq "/api/verify-smtp" -and $request.HttpMethod -eq "POST") {
            try {
                $reader = New-Object System.IO.StreamReader($request.InputStream)
                $body = $reader.ReadToEnd()
                $json = ConvertFrom-JsonString $body
                
                if ($null -eq $json -or !$json.host -or !$json.port) {
                    Send-Response $context '{"success":false,"error":"Informasi SMTP belum lengkap (Host, Port, Email, & Password wajib diisi)."}' "application/json" 200
                    continue
                }
                
                $host_smtp = [string]$json.host
                $port_smtp = [int]$json.port
                
                $tcp = New-Object System.Net.Sockets.TcpClient
                $connectTask = $tcp.ConnectAsync($host_smtp, $port_smtp)
                if ($connectTask.Wait(5000)) {
                    $tcp.Close()
                    Send-Response $context "{`"success`":true,`"message`":`"Koneksi SMTP ke $host_smtp`:$port_smtp berhasil terverifikasi!`"}" "application/json"
                } else {
                    $tcp.Close()
                    Send-Response $context "{`"success`":false,`"error`":`"Gagal terhubung ke host $host_smtp`:$port_smtp (Timeout 5 detik).`"}" "application/json" 200
                }
            }
            catch {
                $err = $_.Exception.Message.Replace('"', '\"')
                Send-Response $context "{`"success`":false,`"error`":`"Gagal verifikasi SMTP: $err`"}" "application/json" 200
            }
        }
        # API: Send Email
        elseif ($url -eq "/api/send-email" -and $request.HttpMethod -eq "POST") {
            $reader = New-Object System.IO.StreamReader($request.InputStream)
            $body = $reader.ReadToEnd()
            $json = ConvertFrom-JsonString $body
            
            if ($null -eq $json) {
                Send-Response $context '{"success":false,"error":"Invalid JSON"}' "application/json" 400
                continue
            }
            
            $smtpConfig = $json.smtpConfig
            $recipientEmail = $json.recipientEmail
            $subject = $json.subject
            $htmlBody = $json.htmlBody
            $attachment = $json.attachment
            
            try {
                $host_smtp = $smtpConfig.host
                $port_smtp = [int]$smtpConfig.port
                $secure = $smtpConfig.secure
                $user = $smtpConfig.user
                $pass = $smtpConfig.pass
                $fromName = $smtpConfig.fromName
                if (!$fromName) { $fromName = "MNC University" }
                
                $mail = New-Object System.Net.Mail.MailMessage
                $mail.From = New-Object System.Net.Mail.MailAddress($user, $fromName)
                $mail.To.Add($recipientEmail)
                $mail.Subject = $subject
                
                $body = $htmlBody
                # Handle logo inline CID replacement
                $logoPath = Join-Path $PSScriptRoot "public/logo.png"
                if ($body.Contains('src="logo.png"') -and (Test-Path $logoPath)) {
                    $body = $body.Replace('src="logo.png"', 'src="cid:logo"')
                    $logoAtt = New-Object System.Net.Mail.Attachment($logoPath)
                    $logoAtt.ContentId = "logo"
                    $logoAtt.ContentDisposition.Inline = $true
                    $logoAtt.ContentDisposition.DispositionType = "Inline"
                    $mail.Attachments.Add($logoAtt)
                }
                
                $mail.Body = $body
                $mail.IsBodyHtml = $true
                
                # Attachment handling
                if ($null -ne $attachment -and $null -ne $attachment.data) {
                    # Format is: data:application/pdf;base64,....
                    $dataParts = $attachment.data -split ','
                    if ($dataParts.Length -eq 2) {
                        $base64 = $dataParts[1]
                        $bytes = [System.Convert]::FromBase64String($base64)
                        $ms = New-Object System.IO.MemoryStream($bytes, 0, $bytes.Length)
                        $att = New-Object System.Net.Mail.Attachment($ms, $attachment.originalname)
                        $mail.Attachments.Add($att)
                    }
                }
                
                $smtp = New-Object System.Net.Mail.SmtpClient($host_smtp, $port_smtp)
                $smtp.EnableSsl = ($secure -eq $true -or $secure -eq "true" -or $port_smtp -eq 465)
                $smtp.Credentials = New-Object System.Net.NetworkCredential($user, $pass)
                
                $smtp.Send($mail)
                
                # Dispose resources
                $mail.Dispose()
                
                Send-Response $context '{"success":true}' "application/json"
            }
            catch {
                $err = $_.Exception.Message.Replace('"', '\"')
                Send-Response $context "{`"success`":false,`"error`":`"Gagal mengirim: $err`"}" "application/json" 500
            }
        }
        else {
            Send-Response $context "Not Found" "text/plain" 404
        }
    }
    catch {
        Write-Host "Error memproses request: $_" -ForegroundColor Red
    }
}
