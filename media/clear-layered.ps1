# Removes a previous whole-window fade so text and controls are solid again.
$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class CursorOpacityClear {
  const int GWL_EXSTYLE = -20;
  const int WS_EX_LAYERED = 0x00080000;
  const uint LWA_ALPHA = 0x2;
  delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] static extern int GetWindowLong(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll", EntryPoint = "SetWindowLongW")] static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
  [DllImport("user32.dll")] static extern bool SetLayeredWindowAttributes(IntPtr hwnd, uint crKey, byte bAlpha, uint dwFlags);
  public static void Clear() {
    EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
      if (!IsWindowVisible(hWnd)) return true;
      var cls = new StringBuilder(256);
      GetClassName(hWnd, cls, cls.Capacity);
      if (cls.ToString() != "Chrome_WidgetWin_1") return true;
      uint pid;
      GetWindowThreadProcessId(hWnd, out pid);
      try {
        if (!System.Diagnostics.Process.GetProcessById((int)pid).ProcessName.Equals("Cursor", StringComparison.OrdinalIgnoreCase)) return true;
      } catch { return true; }
      int style = GetWindowLong(hWnd, GWL_EXSTYLE);
      if ((style & WS_EX_LAYERED) == 0) return true;
      SetLayeredWindowAttributes(hWnd, 0, 255, LWA_ALPHA);
      SetWindowLong(hWnd, GWL_EXSTYLE, style & ~WS_EX_LAYERED);
      return true;
    }, IntPtr.Zero);
  }
}
'@
[CursorOpacityClear]::Clear()
