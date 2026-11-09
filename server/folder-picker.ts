import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Windows Common Item Dialog, with FOS_PICKFOLDERS and filesystem-only results.
// Paths enter through an environment variable, never interpolated into executable code.
export const folderPickerScript = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NxsoosFolderPicker {
  [ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IFileDialog {
    [PreserveSig] int Show(IntPtr owner);
    void SetFileTypes(uint count, IntPtr filters);
    void SetFileTypeIndex(uint index);
    void GetFileTypeIndex(out uint index);
    void Advise(IntPtr events, out uint cookie);
    void Unadvise(uint cookie);
    void SetOptions(uint options);
    void GetOptions(out uint options);
    void SetDefaultFolder(IShellItem folder);
    void SetFolder(IShellItem folder);
    void GetFolder(out IShellItem folder);
    void GetCurrentSelection(out IShellItem item);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string name);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string text);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string text);
    void GetResult(out IShellItem item);
  }
  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItem {
    void BindToHandler(IntPtr context, ref Guid handler, ref Guid iid, out IntPtr result);
    void GetParent(out IShellItem parent);
    void GetDisplayName(uint kind, out IntPtr name);
    void GetAttributes(uint mask, out uint attributes);
    void Compare(IShellItem other, uint hint, out int order);
  }
  [DllImport("shell32.dll", CharSet=CharSet.Unicode, PreserveSig=false)]
  static extern void SHCreateItemFromParsingName(string path, IntPtr context, ref Guid iid, out IShellItem item);
  static IFileDialog Create() {
    var dialog = (IFileDialog)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")));
    uint options; dialog.GetOptions(out options);
    dialog.SetOptions(options | 0x20u | 0x40u | 0x800u); // PICKFOLDERS, FORCEFILESYSTEM, PATHMUSTEXIST
    return dialog;
  }
  public static bool Validate() {
    var dialog=Create(); try {uint options;dialog.GetOptions(out options);return (options & 0x60u)==0x60u;}
    finally {Marshal.FinalReleaseComObject(dialog);}
  }
  public static string Pick(string initial) {
    var dialog=Create(); IShellItem folder=null, result=null; IntPtr name=IntPtr.Zero;
    try {
      dialog.SetTitle("Nxsoos Company - Choose project folder");
      dialog.SetOkButtonLabel("Select folder");
      if (!String.IsNullOrEmpty(initial) && System.IO.Directory.Exists(initial)) {
        var iid=new Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE");
        SHCreateItemFromParsingName(initial,IntPtr.Zero,ref iid,out folder);
        dialog.SetFolder(folder);
      }
      int status=dialog.Show(IntPtr.Zero);
      if (status==unchecked((int)0x800704C7)) return null;
      Marshal.ThrowExceptionForHR(status);
      dialog.GetResult(out result); result.GetDisplayName(0x80058000u,out name);
      return Marshal.PtrToStringUni(name);
    } finally {
      if(name!=IntPtr.Zero) Marshal.FreeCoTaskMem(name);
      if(result!=null) Marshal.FinalReleaseComObject(result);
      if(folder!=null) Marshal.FinalReleaseComObject(folder);
      Marshal.FinalReleaseComObject(dialog);
    }
  }
}
'@
`;

export class NativeFolderPicker {
  private pending?: Promise<string | null>;
  private controller?: AbortController;
  select(initial = ''): Promise<string | null> {
    if (this.pending) return this.pending;
    if (process.platform !== 'win32')
      return Promise.reject(
        new Error(
          'Native folder selection is available on Windows. Paste the folder path instead.',
        ),
      );
    this.controller = new AbortController();
    const script =
      folderPickerScript +
      '\n$value=[NxsoosFolderPicker]::Pick($env:NXSOOS_PICKER_START); @{path=$value} | ConvertTo-Json -Compress';
    this.pending = promisify(execFile)(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-STA',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64'),
      ],
      {
        windowsHide: true,
        encoding: 'utf8',
        timeout: 600000,
        maxBuffer: 65536,
        env: { ...process.env, NXSOOS_PICKER_START: initial },
        signal: this.controller.signal,
      },
    )
      .then(({ stdout }) => {
        const value = JSON.parse(stdout.trim());
        if (value.path !== null && typeof value.path !== 'string')
          throw new Error('Invalid folder picker result.');
        return value.path || null;
      })
      .catch((error) => {
        throw new Error(
          error.name === 'AbortError'
            ? 'Folder selection was cancelled.'
            : 'Windows folder selection failed. You can paste the folder path instead.',
        );
      })
      .finally(() => {
        this.pending = undefined;
        this.controller = undefined;
      });
    return this.pending;
  }
  close() {
    this.controller?.abort();
  }
}
