param(
    [string]$DistDir = "C:\Users\Serik\.gemini\antigravity\scratch\yazhaz.github.io\dist",
    [string]$ExeFile = "C:\Users\Serik\.gemini\antigravity\scratch\yazhaz.github.io\YazHaz.exe",
    [string]$TargetDir = "C:\Users\Serik\Desktop\YazHaz-Offline",
    [string]$ZipFile = "C:\Users\Serik\Desktop\YazHaz-Offline.zip"
)

# 1. Eski klasör veya zip varsa temizle
if (Test-Path $TargetDir) {
    Remove-Item -Recurse -Force $TargetDir
}
if (Test-Path $ZipFile) {
    Remove-Item -Force $ZipFile
}

# 2. Hedef klasörü oluştur
New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null

# 3. Dist içeriğini kopyala
Copy-Item -Path "$DistDir\*" -Destination $TargetDir -Recurse -Force

# 4. YazHaz.exe kopyala
Copy-Item -Path $ExeFile -Destination "$TargetDir\YazHaz.exe" -Force

# 5. YazHaz-Baslat.bat oluştur
$batContent = @"
@echo off
chcp 65001 >nul
title YazHaz - Cevrimdisi Yazili Hazirlama
cls
echo ==============================================================
echo            YazHaz - Cevrimdisi Yazili Hazirlama
echo ==============================================================
echo.
echo   Uygulama yerel olarak baslatiliyor...
echo.
if exist YazHaz.exe (
    start "" YazHaz.exe
    exit
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "`$port=5050; while(`$true){`$t=New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Loopback,`$port); try{`$t.Start();`$t.Stop();break}catch{`$port++}}; `$l=New-Object System.Net.HttpListener; `$u='http://localhost:'+`$port+'/'; `$l.Prefixes.Add(`$u); `$l.Start(); Write-Host '  [OK] Baglanti: ' `$u; Start-Process `$u; while(`$l.IsListening){`$c=`$l.GetContext(); `$req=`$c.Request; `$res=`$c.Response; `$p=`$req.Url.LocalPath.TrimStart('/'); if([string]::IsNullOrEmpty(`$p)){`$p='index.html'}; `$fp=Join-Path `$PSScriptRoot ([System.Uri]::UnescapeDataString(`$p)); if(-not(Test-Path `$fp -PathType Leaf)){`$fp=Join-Path `$PSScriptRoot 'index.html'}; if(Test-Path `$fp -PathType Leaf){`$ext=[System.IO.Path]::GetExtension(`$fp).ToLowerInvariant(); `$m=@{'.html'='text/html; charset=utf-8';'.js'='application/javascript; charset=utf-8';'.css'='text/css; charset=utf-8';'.json'='application/json';'.png'='image/png';'.jpg'='image/jpeg';'.svg'='image/svg+xml';'.ico'='image/x-icon';'.woff2'='font/woff2';'.wasm'='application/wasm';'.gz'='application/gzip'}[`$ext]; if(-not `$m){`$m='application/octet-stream'}; `$res.ContentType=`$m; `$res.AddHeader('Access-Control-Allow-Origin','*'); `$b=[System.IO.File]::ReadAllBytes(`$fp); `$res.ContentLength64=`$b.Length; `$res.OutputStream.Write(`$b,0,`$b.Length)}else{`$res.StatusCode=404}; `$res.Close()}"
pause
"@
[System.IO.File]::WriteAllText("$TargetDir\YazHaz-Baslat.bat", $batContent, [System.Text.Encoding]::UTF8)

# 6. BeniOku.txt oluştur
$readmeContent = @"
==============================================================
         YazHaz - Çevrimdışı Sınav Hazırlama Aracı
==============================================================

Bu paket, internet bağlantısı olmadan (tamamen offline olarak)
yazhaz.github.io uygulamasını bilgisayarınızda çalıştırmanızı sağlar.

NASIL ÇALIŞTIRILIR?
-------------------
1. "YazHaz.exe" (veya "YazHaz-Baslat.bat") dosyasına çift tıklayın.
2. Program otomatik olarak yerel bir güvenli bağlantı kuracak ve
   uygulamayı ekranınızda (Microsoft Edge veya varsayılan tarayıcınızda)
   bağımsız bir pencere olarak açacaktır.
3. İnternetiniz tamamen kapalı olsa dahi:
   - Soru resmi yükleme, kırpma, döndürme ve ince ayarlar
   - Resimdeki yazıları OCR (yapay zeka) ile otomatik metne dönüştürme
   - A4 çift sütun sınav şablonu oluşturma
   - PDF olarak kaydetme ve doğrudan yazdırma
   özelliklerinin hepsi eksiksiz ve hızlıca çalışır.

NASIL KAPATILIR?
----------------
Açılan siyah konsol penceresini veya program penceresini 
kapatmanız yeterlidir.

NOT:
----
Hiçbir kurulum, yönetici izni, Node.js veya ek yazılım GEREKTİRMEZ.
Klasörü dilediğiniz bir USB belleğe veya başka bir bilgisayara
kopyalayıp doğrudan çalıştırabilirsiniz.

İyi çalışmalar dileriz!
==============================================================
"@
[System.IO.File]::WriteAllText("$TargetDir\BeniOku.txt", $readmeContent, [System.Text.Encoding]::UTF8)

# 7. Zip arşivini oluştur
Write-Host "Zip arşivi oluşturuluyor: $ZipFile"
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($TargetDir, $ZipFile, [System.IO.Compression.CompressionLevel]::Optimal, $false)

Write-Host "Paketleme başarıyla tamamlandı!"
Get-Item $ZipFile | Format-List FullName, Length, LastWriteTime
