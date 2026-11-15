// 고사시간표 시스템 실행 파일 (런처)
// - 웹판(index.html, css, js)과 엑셀·PDF 모듈, 글꼴을 app.zip 으로 exe 안에 넣어 두고,
//   실행하면 %LOCALAPPDATA%\SmartScheduler\app 에 풀어서 Microsoft Edge(없으면 Chrome)를
//   주소창 없는 전용 창(--app)으로 띄운다. 인터넷이 없어도 모든 기능이 동작한다.
// - 작업 내용은 전용 프로필(%LOCALAPPDATA%\SmartScheduler\profile)의 브라우저 저장소에 남는다.
//   앱 파일은 실행할 때마다 새로 풀지만 프로필은 지우지 않으므로 작업이 유지된다.
// - 이미 실행 중이면 새 창을 띄우지 않고 기존 창을 앞으로 가져온다.
// 빌드: build.bat
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Management;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("고사시간표 시스템")]
[assembly: AssemblyProduct("고사시간표 시스템 Smart Scheduler")]
[assembly: AssemblyDescription("정기고사 시간표·고사실 배치·출력물 작성 프로그램")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

static class SmartScheduler
{
    const string Title = "고사시간표 시스템";

    static readonly string[] BrowserFlags = {
        "--no-first-run",
        "--no-default-browser-check",
        "--start-maximized",
    };

    [STAThread]
    static int Main(string[] args)
    {
        try
        {
            string baseDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SmartScheduler");
            string appDir = Path.Combine(baseDir, "app");
            string profile = Path.Combine(baseDir, "profile");
            Directory.CreateDirectory(baseDir);
            Directory.CreateDirectory(profile);

            string browser = FindBrowser();
            if (browser == null)
            {
                MessageBox.Show("Microsoft Edge 또는 Chrome 을 찾을 수 없습니다.\n둘 중 하나를 설치한 뒤 다시 실행하세요.",
                    Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }

            // 이미 실행 중인가?
            List<int> running = FindRunning(profile);
            if (running.Count > 0)
            {
                if (ActivateWindow(running)) return 0;          // 기존 창을 앞으로
                foreach (int id in running) { try { Process.GetProcessById(id).Kill(); } catch { } }
                for (int i = 0; i < 30 && FindRunning(profile).Count > 0; i++) Thread.Sleep(200);
            }

            // 앱 파일 풀기 (매번 새로 풀어서 exe 와 항상 같은 버전). 작업 자료는 profile 에 있으므로 지워도 안전하다.
            if (Directory.Exists(appDir)) Directory.Delete(appDir, true);
            Directory.CreateDirectory(appDir);
            using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("app.zip"))
            using (var zip = new ZipArchive(s, ZipArchiveMode.Read))
            {
                foreach (ZipArchiveEntry e in zip.Entries)
                {
                    string dest = Path.GetFullPath(Path.Combine(appDir, e.FullName));
                    if (!dest.StartsWith(appDir, StringComparison.OrdinalIgnoreCase)) continue;   // 경로 밖으로 나가는 항목 무시
                    if (e.FullName.EndsWith("/")) { Directory.CreateDirectory(dest); continue; }
                    Directory.CreateDirectory(Path.GetDirectoryName(dest));
                    using (Stream src = e.Open())
                    using (FileStream f = File.Create(dest))
                        src.CopyTo(f);
                }
            }

            string url = new Uri(Path.Combine(appDir, "index.html")).AbsoluteUri;
            var extra = new StringBuilder();
            foreach (string a in args)                            // 점검용: --url=... 또는 추가 브라우저 옵션
            {
                if (a.StartsWith("--url=")) url = a.Substring(6);
                else if (a.StartsWith("--")) extra.Append(' ').Append(Quote(a));
            }

            var sb = new StringBuilder();
            sb.Append("--app=").Append(Quote(url));
            sb.Append(" --user-data-dir=").Append(Quote(profile));
            foreach (string fl in BrowserFlags) sb.Append(' ').Append(fl);
            sb.Append(extra);

            Process.Start(new ProcessStartInfo(browser, sb.ToString()) { UseShellExecute = false });
            return 0;
        }
        catch (Exception e)
        {
            MessageBox.Show("실행 중 오류가 발생했습니다.\n\n" + e.Message, Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }

    static string Quote(string s) { return s.IndexOf(' ') >= 0 || s.IndexOf('"') >= 0 ? "\"" + s.Replace("\"", "\\\"") + "\"" : s; }

    static string FindBrowser()
    {
        var cands = new List<string>();
        foreach (string exe in new[] { "msedge.exe", "chrome.exe" })
        {
            foreach (RegistryKey root in new[] { Registry.CurrentUser, Registry.LocalMachine })
            {
                try
                {
                    using (RegistryKey k = root.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\" + exe))
                        if (k != null && k.GetValue("") is string) cands.Add(((string)k.GetValue("")).Trim('"'));
                }
                catch { }
            }
            string sub = exe == "msedge.exe" ? @"Microsoft\Edge\Application\msedge.exe" : @"Google\Chrome\Application\chrome.exe";
            foreach (Environment.SpecialFolder sf in new[] { Environment.SpecialFolder.ProgramFilesX86, Environment.SpecialFolder.ProgramFiles, Environment.SpecialFolder.LocalApplicationData })
                cands.Add(Path.Combine(Environment.GetFolderPath(sf), sub));
        }
        foreach (string c in cands) if (!string.IsNullOrEmpty(c) && File.Exists(c)) return c;
        return null;
    }

    // 전용 프로필(--user-data-dir)로 떠 있는 브라우저 프로세스 id 목록
    static List<int> FindRunning(string profile)
    {
        var ids = new List<int>();
        try
        {
            using (var q = new ManagementObjectSearcher("SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name='msedge.exe' OR Name='chrome.exe'"))
                foreach (ManagementObject o in q.Get())
                {
                    string cl = o["CommandLine"] as string;
                    if (cl != null && cl.IndexOf(profile, StringComparison.OrdinalIgnoreCase) >= 0)
                        ids.Add(Convert.ToInt32(o["ProcessId"]));
                }
        }
        catch { }
        return ids;
    }

    delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int cmd);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);

    static bool ActivateWindow(List<int> pids)
    {
        IntPtr found = IntPtr.Zero;
        EnumWindows((h, l) =>
        {
            if (!IsWindowVisible(h)) return true;
            uint pid; GetWindowThreadProcessId(h, out pid);
            if (!pids.Contains((int)pid)) return true;
            var sb = new StringBuilder(256); GetWindowText(h, sb, 256);
            if (sb.Length == 0) return true;
            found = h; return false;
        }, IntPtr.Zero);
        if (found == IntPtr.Zero) return false;
        if (IsIconic(found)) ShowWindow(found, 9);   // SW_RESTORE
        SetForegroundWindow(found);
        return true;
    }
}
