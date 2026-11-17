; Instalador de NEXUS Importador de palas (Inno Setup 6).
;
; Requisito: haber construido antes la app con build.ps1, que deja
;   apps/desktop/dist/NEXUS-Importador/   (ejecutable + _internal)
;   apps/desktop/build/nexus_desktop/nexus-icon.ico
; Compilar (desde la raíz del repositorio):
;   iscc apps\desktop\packaging\installer.iss
; Resultado: apps/desktop/dist/installer/NEXUS-Importador-<versión>-instalador.exe
;
; Instala por usuario, sin permisos de administrador, en %LOCALAPPDATA%\Programs.
; NO incluye configuración ni llaves: el despliegue deja la URL y la llave PÚBLICA en
; %APPDATA%\NEXUS\config.json (claves supabase_url y supabase_publishable_key). Al desinstalar
; se conserva %APPDATA%\NEXUS (configuración y subidas pendientes).

#define AppName "NEXUS Importador de palas"
#define AppExeName "NEXUS-Importador.exe"
#define SourceDir "..\dist\NEXUS-Importador"
; La versión sale del propio ejecutable (build.ps1 la toma de config.VERSION).
#define AppVersion GetStringFileInfo(AddBackslash(SourcePath) + SourceDir + "\" + AppExeName, "ProductVersion")
#if AppVersion == ""
  #error "No se encontró ..\dist\NEXUS-Importador\NEXUS-Importador.exe: ejecuta antes build.ps1"
#endif

[Setup]
AppId={{322710F9-ACD3-48C7-9740-AC070C279C61}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=NEXUS
VersionInfoVersion={#AppVersion}
VersionInfoProductName={#AppName}
DefaultDirName={autopf}\NEXUS Importador
DefaultGroupName=NEXUS
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist\installer
OutputBaseFilename=NEXUS-Importador-{#AppVersion}-instalador
SetupIconFile=..\build\nexus_desktop\nexus-icon.ico
UninstallDisplayIcon={app}\{#AppExeName}
UninstallDisplayName={#AppName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExeName}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent
