@echo off
chcp 65001 >nul
rem 고사시간표 시스템 exe 빌드 (Windows 내장 C# 컴파일러 사용, 설치 불필요)
cd /d "%~dp0"
if not exist app.ico python make_icon.py || (echo 아이콘 생성 실패 & exit /b 1)
python make_app_zip.py || (echo 앱 묶기 실패 & exit /b 1)
if not exist "..\실행파일" mkdir "..\실행파일"
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
"%CSC%" /nologo /codepage:65001 /target:winexe /optimize+ /win32icon:app.ico ^
  /resource:app.zip,app.zip ^
  /reference:System.Management.dll /reference:System.Windows.Forms.dll ^
  /reference:System.IO.Compression.dll ^
  /out:"..\실행파일\고사시간표시스템.exe" SmartScheduler.cs
if errorlevel 1 (echo 빌드 실패 & exit /b 1)
echo 빌드 완료: ..\실행파일\고사시간표시스템.exe
