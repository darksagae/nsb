## NSB Motors – New Windows Machine Setup

This guide explains what you need to install on a **fresh Windows PC** so you can build and run the NSB Motors system after copying the project from your USB.

---

## 1. Required software to download/install

- **Git for Windows**
  - Download: `https://git-scm.com/downloads`
  - Used by Flutter and for working with the project repository.

- **Visual Studio Code**
  - Download: `https://code.visualstudio.com/`
  - Recommended extensions:
    - Flutter
    - Dart
    - GitHub Pull Requests and Issues (optional)

- **Flutter SDK (Windows, stable channel)**
  - Download: `https://docs.flutter.dev/get-started/install/windows`
  - Extract to a short path such as `C:\src\flutter`.
  - Add `C:\src\flutter\bin` to the **PATH** environment variable.

- **Visual Studio 2022 (for building Windows desktop apps)**
  - Download: search for **“Visual Studio 2022 Community”**.
  - During installation, select the workload:
    - **Desktop development with C++**
  - Make sure **Windows 10/11 SDK** is included (usually selected by default with that workload).

- **Inno Setup (optional – only if you want to rebuild the installer EXE)**
  - Download: `https://jrsoftware.org/isinfo.php`
  - After install, you can open the installer script from this project (if/when needed) and compile a new setup EXE.

- **(Optional) Android tooling – only if you build mobile apps**
  - **Android Studio**
    - Android SDK
    - Android SDK Platform-Tools
    - Android SDK Build-Tools

---

## 2. Initial Flutter setup on the new PC

1. Open **Command Prompt** or **PowerShell**.
2. Run:

```bash
flutter doctor
```

3. Follow the instructions from `flutter doctor` and install anything it says is missing (e.g. Visual Studio components, Android Studio if you plan to build mobile, etc.).

---

## 3. Copying the project from USB

1. On the **old machine**, make sure the project is updated and all needed files are present.
2. Copy the whole project folder (for example, `saga`) onto your **USB drive**.
3. On the **new machine**, copy the folder from the USB to a location like:
   - `C:\Users\<YourUser>\Desktop\All files\saga`

You should now have the same project structure, including:

- `cars_system/`
- Any installer scripts and documentation.

---

## 4. Getting the Flutter project ready (sales_system)

1. Open **VS Code**.
2. Use **File → Open Folder…** and open:
   - `cars_system/sales_system`
3. In the integrated terminal (or PowerShell), run:

```bash
flutter pub get
```

This restores all Dart/Flutter dependencies.

---

## 5. Building and running the Windows app

From the `cars_system/sales_system` folder, run:

```bash
flutter config --enable-windows-desktop
flutter doctor
flutter run -d windows
```

If `flutter doctor` reports missing Windows desktop components, install them via **Visual Studio Installer** (ensure the **Desktop development with C++** workload is installed).

To create a **release build** for Windows:

```bash
flutter build windows
```

The built application will be under:

- `cars_system/sales_system/build/windows/runner/Release/`

---

## 6. Rebuilding the installer (optional)

If you need to **rebuild the installer EXE**:

1. Install **Inno Setup** as described above.
2. Open the installer script file from this project in Inno Setup (look for a `.iss` file inside the sales system or installer folders).
3. Compile the script to generate a new installer EXE.

If there is no `.iss` file in the project, use the existing EXE installers already provided in the repository instead of rebuilding.

---

## 7. Summary checklist for the new Windows PC

- [ ] Git for Windows installed  
- [ ] Visual Studio Code installed (with Flutter & Dart extensions)  
- [ ] Flutter SDK downloaded, extracted, and on PATH  
- [ ] Visual Studio 2022 with **Desktop development with C++** workload and Windows SDK  
- [ ] (Optional) Android Studio & SDK for mobile builds  
- [ ] (Optional) Inno Setup for building installers  
- [ ] Project folder copied from USB to local disk  
- [ ] `flutter pub get` run inside `cars_system/sales_system`  
- [ ] `flutter run -d windows` and/or `flutter build windows` tested successfully  


