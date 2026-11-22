using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Diagnostics;
using System.Threading;
using System.Collections.Generic;
using System.Runtime.InteropServices;

class YazHazServer
{
    private static HttpListener listener;
    private static string baseDir;
    private static int port = 5050;

    [DllImport("user32.dll")]
    private static extern int GetSystemMetrics(int nIndex);

    private static readonly Dictionary<string, string> mimeTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        { ".html", "text/html; charset=utf-8" },
        { ".htm", "text/html; charset=utf-8" },
        { ".js", "application/javascript; charset=utf-8" },
        { ".mjs", "application/javascript; charset=utf-8" },
        { ".css", "text/css; charset=utf-8" },
        { ".json", "application/json; charset=utf-8" },
        { ".png", "image/png" },
        { ".jpg", "image/jpeg" },
        { ".jpeg", "image/jpeg" },
        { ".gif", "image/gif" },
        { ".svg", "image/svg+xml" },
        { ".ico", "image/x-icon" },
        { ".woff", "font/woff" },
        { ".woff2", "font/woff2" },
        { ".ttf", "font/ttf" },
        { ".wasm", "application/wasm" },
        { ".gz", "application/gzip" }
    };

    static void Main(string[] args)
    {
        Console.Title = "YazHaz - Cevrimdisi Yazili Hazirlama";
        Console.OutputEncoding = System.Text.Encoding.UTF8;

        baseDir = AppDomain.CurrentDomain.BaseDirectory;

        // Port bul (5050'den baslayarak bos port ara)
        port = FindAvailablePort(5050, 5100);

        string url = "http://localhost:" + port + "/";

        try
        {
            listener = new HttpListener();
            listener.Prefixes.Add(url);
            listener.Start();
        }
        catch (Exception ex)
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine("Sunucu baslatilamadi: " + ex.Message);
            Console.ResetColor();
            Console.WriteLine("Cikmak icin bir tusa basin...");
            Console.ReadKey();
            return;
        }

        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine("==============================================================");
        Console.WriteLine("            YazHaz - Cevrimdisi Yazili Hazirlama              ");
        Console.WriteLine("==============================================================");
        Console.ResetColor();
        Console.WriteLine();
        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine("  [OK] Yerel web sunucusu calisiyor.");
        Console.WriteLine("  [OK] Baglanti adresi: " + url);
        Console.ResetColor();
        Console.WriteLine();
        Console.WriteLine("  Uygulamayi kapatmak icin bu pencereyi kapatabilirsiniz.");
        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine("==============================================================");
        Console.ResetColor();

        // Arka planda istekleri dinle
        ThreadPool.QueueUserWorkItem(ListenLoop);

        // Tarayicida veya Edge App modunda genis pencereyle ac
        LaunchBrowser(url);

        // Pencere acik kalsin
        while (true)
        {
            Thread.Sleep(1000);
        }
    }

    private static int FindAvailablePort(int start, int end)
    {
        for (int p = start; p <= end; p++)
        {
            try
            {
                TcpListener tcp = new TcpListener(IPAddress.Loopback, p);
                tcp.Start();
                tcp.Stop();
                return p;
            }
            catch { }
        }
        return start;
    }

    private static void LaunchBrowser(string url)
    {
        try
        {
            // Oncelikle Edge'i bagimsiz uygulama penceresinde acmayi dene (PWA gibi tertemiz gorunum)
            string edgePath = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
            if (!File.Exists(edgePath))
            {
                edgePath = @"C:\Program Files\Microsoft\Edge\Application\msedge.exe";
            }

            if (File.Exists(edgePath))
            {
                // Ekran cozunurlugune gore %25-30 daha genis yatay boyut
                int screenW = GetSystemMetrics(0); // SM_CXSCREEN
                int screenH = GetSystemMetrics(1); // SM_CYSCREEN
                if (screenW <= 0) screenW = 1920;
                if (screenH <= 0) screenH = 1080;

                // Standart ~1024-1050px pencereye kiyasla %25-30 daha genis (1380-1440px)
                int targetW = (int)(screenW * 0.74);
                if (targetW < 1200 && screenW >= 1280) targetW = 1200;
                if (targetW > 1440) targetW = 1440;

                int targetH = (int)(screenH * 0.88);
                if (targetH > 940) targetH = 940;

                int posX = Math.Max(10, (screenW - targetW) / 2);
                int posY = Math.Max(10, (screenH - targetH) / 2);

                string appData = Path.Combine(Path.GetTempPath(), "YazHaz_EdgeProfile");
                string args = string.Format("--app=\"{0}\" --window-size={1},{2} --window-position={3},{4} --user-data-dir=\"{5}\"",
                    url, targetW, targetH, posX, posY, appData);

                ProcessStartInfo psi = new ProcessStartInfo(edgePath, args);
                psi.UseShellExecute = false;
                Process.Start(psi);
                return;
            }
        }
        catch { }

        try
        {
            // Edge bulunamazsa varsayilan tarayiciyi ac
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
        catch
        {
            try
            {
                Process.Start("explorer.exe", url);
            }
            catch { }
        }
    }

    private static void ListenLoop(object state)
    {
        while (listener != null && listener.IsListening)
        {
            try
            {
                HttpListenerContext context = listener.GetContext();
                ThreadPool.QueueUserWorkItem(ProcessRequest, context);
            }
            catch
            {
                break;
            }
        }
    }

    private static void ProcessRequest(object state)
    {
        HttpListenerContext context = (HttpListenerContext)state;
        HttpListenerRequest request = context.Request;
        HttpListenerResponse response = context.Response;

        try
        {
            string rawPath = request.Url.LocalPath.TrimStart('/');
            if (string.IsNullOrEmpty(rawPath))
            {
                rawPath = "index.html";
            }

            string decodedPath = Uri.UnescapeDataString(rawPath).Replace('/', Path.DirectorySeparatorChar);
            string filePath = Path.Combine(baseDir, decodedPath);

            // Guvenlik: Dizin disina cikmayi onle
            string fullPath = Path.GetFullPath(filePath);
            if (!fullPath.StartsWith(Path.GetFullPath(baseDir), StringComparison.OrdinalIgnoreCase))
            {
                response.StatusCode = 403;
                response.Close();
                return;
            }

            // Dosya bulunamazsa SPA yonlendirmesi olarak index.html ver
            if (!File.Exists(fullPath))
            {
                fullPath = Path.Combine(baseDir, "index.html");
            }

            if (File.Exists(fullPath))
            {
                string ext = Path.GetExtension(fullPath);
                string mime;
                if (!mimeTypes.TryGetValue(ext, out mime))
                {
                    mime = "application/octet-stream";
                }

                response.ContentType = mime;
                response.AddHeader("Access-Control-Allow-Origin", "*");
                response.AddHeader("Cache-Control", "no-cache");

                byte[] data = File.ReadAllBytes(fullPath);
                response.ContentLength64 = data.Length;
                response.OutputStream.Write(data, 0, data.Length);
            }
            else
            {
                response.StatusCode = 404;
            }
        }
        catch
        {
            response.StatusCode = 500;
        }
        finally
        {
            try { response.Close(); } catch { }
        }
    }
}
